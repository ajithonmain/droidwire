// Lifecycle manager for the MTP worker child process. It has no Electron
// dependency (the process is created through an injected factory) so the
// startup, timeout, exit and restart behaviour can be unit tested.
//
// Every spawned child is a "generation" with its own pending-call table and
// readiness promise. Events from an older generation can therefore never
// touch a newer one - the classic restart race where a killed worker's late
// 'exit' event wipes the state of its replacement.

export interface WorkerChild {
  readonly connected: boolean
  send(message: unknown, callback?: (err: Error | null) => void): boolean
  kill(): void
  on(event: 'message', cb: (msg: unknown) => void): unknown
  on(event: 'exit', cb: (code: number | null, signal: string | null) => void): unknown
  on(event: 'error', cb: (err: Error) => void): unknown
}

export interface MtpHostOptions {
  /** Max time for the worker to announce readiness. */
  startupTimeoutMs?: number
  /** Idle limit for a running call; progress ticks and 'started' reset it. */
  quietTimeoutMs?: (method: string) => number
  log?: (message: string) => void
}

interface PendingCall {
  method: string
  resolve: (v: unknown) => void
  reject: (e: Error) => void
  onProgress?: (sent: number, total: number) => void
  timer?: ReturnType<typeof setTimeout>
}

interface Generation {
  child: WorkerChild
  ready: Promise<void>
  settleReady: { resolve: () => void; reject: (e: Error) => void }
  readySettled: boolean
  pending: Map<number, PendingCall>
  dead: boolean
}

interface WorkerMessage {
  type?: string
  id?: number
  ok?: boolean
  result?: unknown
  error?: string
  sent?: number
  total?: number
}

const DEFAULT_STARTUP_MS = 15_000
const DEFAULT_QUIET_MS = 20_000

export class MtpWorkerHost {
  private gen: Generation | null = null
  private nextId = 1
  private readonly exitListeners: Array<() => void> = []
  private readonly startupTimeoutMs: number
  private readonly quietTimeoutMs: (method: string) => number
  private readonly log: (message: string) => void

  private readonly spawn: () => WorkerChild

  constructor(spawn: () => WorkerChild, opts: MtpHostOptions = {}) {
    this.spawn = spawn
    this.startupTimeoutMs = opts.startupTimeoutMs ?? DEFAULT_STARTUP_MS
    this.quietTimeoutMs = opts.quietTimeoutMs ?? (() => DEFAULT_QUIET_MS)
    this.log = opts.log ?? (() => {})
  }

  /** Called whenever the live worker (and its device session) goes away. */
  onExit(cb: () => void): void {
    this.exitListeners.push(cb)
  }

  isRunning(): boolean {
    return this.gen !== null && !this.gen.dead
  }

  pendingCount(): number {
    return this.gen ? this.gen.pending.size : 0
  }

  async call<T = unknown>(
    method: string,
    args: unknown[],
    onProgress?: (sent: number, total: number) => void,
  ): Promise<T> {
    const gen = this.ensureGeneration()
    await gen.ready
    if (gen.dead) throw new Error('MTP worker exited before the call could start')

    return new Promise<T>((resolve, reject) => {
      const id = this.nextId++
      gen.pending.set(id, { method, resolve: resolve as (v: unknown) => void, reject, onProgress })
      // The idle timer starts on the worker's 'started' ack, not here: a call
      // may legitimately wait behind others in the worker's queue.
      gen.child.send({ id, method, args }, err => {
        if (!err) return
        const call = gen.pending.get(id)
        if (!call) return
        clearTimeout(call.timer)
        gen.pending.delete(id)
        call.reject(new Error(`MTP worker unreachable: ${err.message}`))
      })
    })
  }

  /** Kill the worker. In-flight calls reject immediately; the next call starts a fresh one. */
  stop(reason = 'MTP worker stopped'): void {
    const gen = this.gen
    if (!gen) return
    this.gen = null
    this.retire(gen, new Error(reason))
    try { gen.child.kill() } catch { /* already gone */ }
    this.notifyExit()
  }

  // --- internals -------------------------------------------------------------

  private ensureGeneration(): Generation {
    if (this.gen && !this.gen.dead) return this.gen

    let settle!: Generation['settleReady']
    const ready = new Promise<void>((resolve, reject) => { settle = { resolve, reject } })
    // A rejected `ready` with no awaiting caller must not become an unhandled rejection
    ready.catch(() => {})

    const child = this.spawn() // may throw synchronously (e.g. worker script missing)
    const gen: Generation = {
      child, ready, settleReady: settle, readySettled: false, pending: new Map(), dead: false,
    }
    this.gen = gen

    const startupTimer = setTimeout(() => {
      if (gen.readySettled) return
      this.log(`worker did not become ready within ${this.startupTimeoutMs}ms - killing it`)
      this.failGeneration(gen, new Error('MTP worker failed to start (timed out)'))
      try { child.kill() } catch { /* ignore */ }
    }, this.startupTimeoutMs)
    ready.finally(() => clearTimeout(startupTimer)).catch(() => {})

    child.on('message', raw => this.onMessage(gen, raw as WorkerMessage))
    child.on('error', err => this.failGeneration(gen, new Error(`MTP worker error: ${err.message}`)))
    child.on('exit', (code, signal) => {
      this.log(`worker exited (code=${code}, signal=${signal})`)
      this.failGeneration(gen, new Error(`MTP worker crashed (code=${code}, signal=${signal ?? 'none'}) mid-call`))
    })
    return gen
  }

  private onMessage(gen: Generation, msg: WorkerMessage): void {
    if (gen.dead) return
    if (msg?.type === 'ready') {
      if (!gen.readySettled) { gen.readySettled = true; gen.settleReady.resolve() }
      return
    }
    if (msg?.type === 'fatal') {
      this.log(`worker fatal: ${msg.error ?? 'unknown'}`)
      return
    }
    const call = typeof msg?.id === 'number' ? gen.pending.get(msg.id) : undefined
    if (!call || typeof msg.id !== 'number') return
    switch (msg.type) {
      case 'started':
        this.armTimeout(gen, msg.id, call)
        break
      case 'progress':
        call.onProgress?.(msg.sent ?? 0, msg.total ?? 0)
        this.armTimeout(gen, msg.id, call) // bytes are moving - not stuck
        break
      case 'result':
        clearTimeout(call.timer)
        gen.pending.delete(msg.id)
        if (msg.ok) call.resolve(msg.result)
        else call.reject(new Error(msg.error ?? 'MTP call failed'))
        break
    }
  }

  private armTimeout(gen: Generation, id: number, call: PendingCall): void {
    clearTimeout(call.timer)
    const ms = this.quietTimeoutMs(call.method)
    call.timer = setTimeout(() => {
      if (gen.dead || !gen.pending.has(id)) return
      gen.pending.delete(id)
      // Native calls are synchronous C code: the only way to abandon one is
      // to kill the whole worker (and with it the wedged device session).
      this.log(`call ${id} (${call.method}) silent for ${ms}ms - killing worker`)
      call.reject(new Error('MTP device stopped responding - try re-plugging the cable'))
      if (this.gen === gen) this.stop('MTP worker restarted after a stuck call')
      else this.retire(gen, new Error('MTP worker restarted after a stuck call'))
    }, ms)
  }

  /** The child is gone (exit/error/startup failure): fail everything that belonged to it. */
  private failGeneration(gen: Generation, err: Error): void {
    if (gen.dead) return
    const wasCurrent = this.gen === gen
    if (wasCurrent) this.gen = null
    this.retire(gen, err)
    // Only a *current* worker's death invalidates the device session. A stale
    // generation (already replaced) must not disturb its successor.
    if (wasCurrent) this.notifyExit()
  }

  private retire(gen: Generation, err: Error): void {
    gen.dead = true
    if (!gen.readySettled) { gen.readySettled = true; gen.settleReady.reject(err) }
    for (const [id, call] of gen.pending) {
      clearTimeout(call.timer)
      gen.pending.delete(id)
      call.reject(err)
    }
  }

  private notifyExit(): void {
    for (const cb of this.exitListeners) {
      try { cb() } catch { /* listener errors must not break teardown */ }
    }
  }
}
