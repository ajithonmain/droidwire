import { app } from 'electron'
import { fork, type ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs'

// luck-node-mtp (libmtp/libusb) has been observed to SIGSEGV when its native
// calls run on Electron's main thread - its libusb macOS backend fights
// Electron's own CFRunLoop. So every call is proxied to a dedicated child
// process (mtp-worker.cjs) over IPC; a crash there kills only the worker,
// which we detect and restart, instead of taking down the whole app.

interface PendingCall {
  resolve: (v: unknown) => void
  reject: (e: Error) => void
  onProgress?: (sent: number, total: number) => void
  timer?: ReturnType<typeof setTimeout>
  method: string
}

// libmtp calls are synchronous native code - if one wedges (a degraded USB
// session tolerates reads but hangs on writes, observed after a PTP I/O
// reset), the worker never replies and the caller would hang forever with
// no error. A quiet call gets killed and restarted; download/upload reset
// their clock on every progress tick since large transfers can legitimately
// run long as long as bytes keep moving.
const QUIET_TIMEOUT_MS = 20_000
// getList() has no progress signal at all - MTP enumerates a folder's
// objects (and their metadata) one PTP transaction at a time with no bulk
// fetch. Measured against a real device: ~20ms/object, so a folder with
// ~3,300 photos took 72s just to list. Give it a lot of rope before
// assuming it's stuck rather than just large.
const LIST_TIMEOUT_MS = 120_000

function timeoutFor(method: string): number {
  return method === 'getList' ? LIST_TIMEOUT_MS : QUIET_TIMEOUT_MS
}

let _worker: ChildProcess | null = null
let _ready: Promise<void> | null = null
let _nextId = 1
const _pending = new Map<number, PendingCall>()

// The transport layer caches its open-session state; a worker death takes the
// libmtp connection with it, so the transport must be told to forget it -
// otherwise the next call skips connect() and runs against a session-less
// fresh worker (observed: getList hanging its full 120s timeout).
const _exitListeners: Array<() => void> = []
export function onMtpWorkerExit(cb: () => void): void {
  _exitListeners.push(cb)
}

function workerScriptPath(): string {
  const candidates = [
    // Packaged app: shipped via electron-builder's extraResources
    path.join(process.resourcesPath ?? '', 'mtp-worker.cjs'),
    // Dev/unpacked: app.getAppPath() resolves to the directory of the
    // nearest package.json above the entry script (usually desktop/), but
    // can also land on out/main depending on how the entry was launched -
    // so resources/ is checked both directly and one level up.
    path.join(app.getAppPath(), 'resources', 'mtp-worker.cjs'),
    path.join(app.getAppPath(), '..', 'resources', 'mtp-worker.cjs'),
    path.join(app.getAppPath(), '..', '..', 'resources', 'mtp-worker.cjs'),
    path.join(__dirname, '..', '..', 'resources', 'mtp-worker.cjs'),
  ]
  const found = candidates.find(p => fs.existsSync(p))
  if (!found) {
    throw new Error(`mtp-worker.cjs not found - checked:\n${candidates.join('\n')}`)
  }
  return found
}

function spawnWorker(): Promise<void> {
  if (_worker && !_worker.killed) return _ready ?? Promise.resolve()

  _ready = new Promise((resolve, reject) => {
    const child = fork(workerScriptPath(), [], {
      // Electron doubles as a Node runtime under this flag - the worker
      // needs Electron's own Node ABI since that's what the native module
      // was rebuilt against (see @electron/rebuild in package setup)
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      execPath: process.execPath,
      silent: false,
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    })
    _worker = child

    const onReady = (msg: any) => {
      if (msg?.type === 'ready') {
        child.off('message', onReady)
        resolve()
      }
    }
    child.on('message', onReady)

    child.on('message', (msg: any) => {
      if (msg?.type === 'ready') return
      const call = msg?.id != null ? _pending.get(msg.id) : undefined
      if (!call) return
      if (msg.type === 'started') {
        // The worker only just picked this call off its queue - start the
        // clock now, not when we sent it (it may have waited behind other
        // calls, e.g. several large image thumbnails downloading in turn)
        armTimeout(msg.id, call)
        return
      }
      if (msg.type === 'progress') {
        call.onProgress?.(msg.sent, msg.total)
        armTimeout(msg.id, call) // bytes are moving - the call isn't stuck
        return
      }
      if (msg.type === 'result') {
        clearTimeout(call.timer)
        _pending.delete(msg.id)
        if (msg.ok) call.resolve(msg.result)
        else call.reject(new Error(msg.error))
      }
    })

    child.stderr?.on('data', (d) => console.error('[mtp-worker]', d.toString().trim()))

    child.on('exit', (code, signal) => {
      console.error(`[mtp-worker] exited (code=${code}, signal=${signal})`)
      _worker = null
      _ready = null
      // Any in-flight calls will never resolve - fail them so callers don't hang
      for (const [id, call] of _pending) {
        clearTimeout(call.timer)
        call.reject(new Error(`MTP worker crashed (signal=${signal ?? 'none'}) mid-call`))
        _pending.delete(id)
      }
      for (const cb of _exitListeners) cb()
    })

    child.on('error', (err) => {
      _worker = null
      _ready = null
      reject(err)
    })
  })

  return _ready
}

function armTimeout(id: number, call: PendingCall): void {
  clearTimeout(call.timer)
  const ms = timeoutFor(call.method)
  call.timer = setTimeout(() => {
    _pending.delete(id)
    // The native call is synchronous C code - there's no way to cancel just
    // this call, so the whole worker (and its wedged connection) is killed.
    // The next MTP call reconnects fresh.
    console.error(`[mtp-worker] call ${id} (${call.method}) silent for ${ms}ms - killing worker`)
    stopMtpWorker()
    call.reject(new Error('MTP device stopped responding - try re-plugging the cable'))
  }, ms)
}

export async function callMtp<T = unknown>(
  method: string,
  args: unknown[],
  onProgress?: (sent: number, total: number) => void
): Promise<T> {
  await spawnWorker()
  if (!_worker) throw new Error('MTP worker unavailable')

  const id = _nextId++
  return new Promise<T>((resolve, reject) => {
    const call: PendingCall = { resolve: resolve as (v: unknown) => void, reject, onProgress, method }
    _pending.set(id, call)
    // Timeout arms on the worker's 'started' ack, not here - a call can
    // wait indefinitely behind others in the worker's queue without that
    // wait itself counting as "stuck"
    _worker!.send({ id, method, args })
  })
}

export function stopMtpWorker(): void {
  if (_worker && !_worker.killed) _worker.kill()
  _worker = null
  _ready = null
}

app.on('before-quit', stopMtpWorker)
