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
  /**
   * Ask the worker to abort its current transfer cleanly (see mtp-worker.cjs). Without this, or when the
   * worker does not answer within `cancelGraceMs`, cancellation falls back to killing the worker.
   */
  requestCancel?: (child: WorkerChild) => void
  cancelGraceMs?: number
}

interface PendingCall {
  method: string
  resolve: (v: unknown) => void
  reject: (e: Error) => void
  onProgress?: (sent: number, total: number) => void
  /** When a cooperative cancel was requested for this call (for the log and tests). */
  cancelRequestedAt?: number
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
const DEFAULT_CANCEL_GRACE_MS = 120_000
const TRANSFER_METHODS = new Set(['download', 'upload'])

export class MtpWorkerHost {
  private gen: Generation | null = null
  private nextId = 1
  private readonly exitListeners: Array<() => void> = []
  private readonly forcedStopListeners: Array<(reason: string) => void> = []
  private readonly startupTimeoutMs: number
  private readonly quietTimeoutMs: (method: string) => number
  private readonly log: (message: string) => void
  private readonly requestCancel?: (child: WorkerChild) => void
  private readonly cancelGraceMs: number

  private readonly spawn: () => WorkerChild

  constructor(spawn: () => WorkerChild, opts: MtpHostOptions = {}) {
    this.spawn = spawn
    this.startupTimeoutMs = opts.startupTimeoutMs ?? DEFAULT_STARTUP_MS
    this.quietTimeoutMs = opts.quietTimeoutMs ?? (() => DEFAULT_QUIET_MS)
    this.log = opts.log ?? (() => {})
    this.requestCancel = opts.requestCancel
    this.cancelGraceMs = opts.cancelGraceMs ?? DEFAULT_CANCEL_GRACE_MS
  }

  /**
   * Called when the worker had to be killed in the middle of a native call (a cancel that would not stop, or a call
   * that went silent). The phone's MTP responder is probably stuck mid-transaction and may need a replug.
   */
  onForcedStop(cb: (reason: string) => void): void {
    this.forcedStopListeners.push(cb)
  }

  private forceStop(reason: string): void {
    for (const cb of this.forcedStopListeners) { try { cb(reason) } catch { /* listener errors must not break teardown */ } }
    this.stop(reason)
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

  /**
   * Cancel the running transfer. Preferred path: raise the worker's cancel flag so libmtp aborts the PTP
   * transaction and the call settles on its own (the phone stays usable). If nothing is transferring, or
   * the worker has not settled within the grace period, the worker is killed as a last resort.
   */
  cancelTransfer(): void {
    const gen = this.gen
    if (!gen || gen.dead) return
    const running = [...gen.pending.entries()].filter(([, c]) => TRANSFER_METHODS.has(c.method))
    if (running.length === 0) return // nothing to interrupt (the transfer already finished)
    if (!this.requestCancel) { this.forceStop('MTP transfer cancelled'); return }
    try { this.requestCancel(gen.child) } catch { this.forceStop('MTP transfer cancelled'); return }
    this.log(`cancel: cooperative cancel requested for ${running.map(([, c]) => c.method).join(', ')}`)
    // libmtp may need a while to wind a transfer down (a download can drain the data the phone is still sending),
    // during which no progress arrives. So the quiet-timeout is replaced by the cancel grace period: killing the
    // worker mid-transfer is what wedges the phone, so it is only done if the worker really does not stop.
    for (const [id, call] of running) {
      call.cancelRequestedAt = Date.now()
      clearTimeout(call.timer)
      call.timer = setTimeout(() => {
        if (gen.dead || !gen.pending.has(id)) return
        this.log(`cancel: FALLBACK - transfer did not stop within ${this.cancelGraceMs}ms of the cancel request - killing worker`)
        if (this.gen === gen) this.forceStop('MTP transfer cancelled')
      }, this.cancelGraceMs)
    }
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
        if (!call.cancelRequestedAt) this.armTimeout(gen, msg.id, call) // bytes are moving - not stuck
        break
      case 'result':
        if (call.cancelRequestedAt) this.log(`cancel: ${call.method} stopped cooperatively ${Date.now() - call.cancelRequestedAt}ms after the request (worker kept alive)`)
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
      if (this.gen === gen) this.forceStop('MTP worker restarted after a stuck call')
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
