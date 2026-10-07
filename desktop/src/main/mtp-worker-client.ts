import { app } from 'electron'
import { fork } from 'child_process'
import path from 'path'
import fs from 'fs'
import { MtpWorkerHost, type WorkerChild } from './mtp-worker-host.ts'

// luck-node-mtp (libmtp/libusb) has been observed to SIGSEGV when its native
// calls run on Electron's main thread - its libusb macOS backend fights
// Electron's own CFRunLoop. So every call is proxied to a dedicated child
// process (mtp-worker.cjs) over IPC; a crash there kills only the worker,
// which MtpWorkerHost detects and restarts, instead of taking down the app.

// libmtp calls are synchronous native code - if one wedges (a degraded USB
// session tolerates reads but hangs on writes, observed after a PTP I/O
// reset), the worker never replies. A quiet call gets the worker killed;
// download/upload reset their clock on every progress tick since large
// transfers can legitimately run long as long as bytes keep moving.
const QUIET_TIMEOUT_MS = 20_000
// getList() has no progress signal at all - MTP enumerates a folder's
// objects (and their metadata) one PTP transaction at a time with no bulk
// fetch. Measured against a real device: ~20ms/object, so a folder with
// ~3,300 photos took 72s just to list.
const LIST_TIMEOUT_MS = 120_000

function timeoutFor(method: string): number {
  return method === 'getList' ? LIST_TIMEOUT_MS : QUIET_TIMEOUT_MS
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

function forkWorker(): WorkerChild {
  return fork(workerScriptPath(), [], {
    // Electron doubles as a Node runtime under this flag. The addon is
    // N-API, so it is ABI-stable across Node and Electron versions.
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    execPath: process.execPath,
    silent: false,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  }) as unknown as WorkerChild
}

const host = new MtpWorkerHost(
  () => {
    const child = forkWorker()
    ;(child as unknown as import('child_process').ChildProcess).stderr?.on('data', d =>
      console.error('[mtp-worker]', d.toString().trim()))
    return child
  },
  { quietTimeoutMs: timeoutFor, log: m => console.error('[mtp-worker]', m) },
)

/** Register a callback fired when the worker (and its libmtp session) dies. */
export function onMtpWorkerExit(cb: () => void): void {
  host.onExit(cb)
}

export function callMtp<T = unknown>(
  method: string,
  args: unknown[],
  onProgress?: (sent: number, total: number) => void,
): Promise<T> {
  return host.call<T>(method, args, onProgress)
}

export function stopMtpWorker(): void {
  host.stop()
}

app.on('before-quit', () => host.stop('Droidwire is quitting'))
