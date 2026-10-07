import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import type { FileNode, StorageInfo } from '@droidwire/shared'
import { cancelledError, throwIfAborted, type Transport, type TransportDevice, type TransferOptions } from './transport.ts'
import { guessMime } from './lib/mime.ts'
import { sortNodes } from './lib/ls-parse.ts'
import { posixBase, posixDir } from './lib/paths.ts'

// luck-node-mtp: synchronous libmtp bindings with a singleton connection,
// proxied through mtp-worker-client (see that file for why - a real SIGSEGV
// was observed when calling this module directly from Electron's main
// process). All calls below go through callMtp() -> child process -> IPC.
//
// API surface (README-verified):
//   connect(vid?, pid?) / release() - one device at a time
//   getDeviceInfo() -> [{ vendor, vendor_id, product, product_id }]
//   getList(parentPath) -> [{ name, size, type: 'FILE'|'FOLDER', id, modificationdate, ... }]
//   download(devPath, localPath, (sent, total) => void)
//   upload(localFile, targetFolderPath, (sent, total) => void)
//   del(path), move(src, folder), copy(src, folder)
//   setFileName(path, newName), setFolderName(path, newName)
//   createFolder(parentPath, name) -> id
//   getCurrentDeviceStorageInfo() -> [{ id, StorageDescription, ... }]
//   get(path) -> object info (used to tell file vs folder before rename)
//
// libmtp holds ONE open device. Every operation therefore runs inside
// withSession(), which serialises "make sure device X is open" together with
// the calls that follow it. Without that, two operations for different
// devices could interleave (A connects, B switches the session, A's download
// then runs against B).

interface MtpRawDevice {
  vendor: string
  vendor_id: number
  product: string
  product_id: number
}

interface MtpEntry {
  name: string
  size: number
  type: 'FILE' | 'FOLDER'
  id: number
  modificationdate: number
  parent_id: number
  storage_id: number
}

/** Everything the transport needs from the outside world - injected so tests can fake the worker. */
export interface MtpEnv {
  call<T = unknown>(method: string, args: unknown[], onProgress?: (sent: number, total: number) => void): Promise<T>
  /** Kill the worker (the only way to interrupt a blocking native call). */
  stopWorker(): void
  onWorkerExit(cb: () => void): void
  /** macOS ptpcamerad claims MTP interfaces; evict it before opening a session. */
  evictPtpcamerad(): Promise<void>
}

export function createMtpTransport(env: MtpEnv): Transport {
  let connectedSerial: string | null = null
  // Device names captured during enumeration, so later lookups don't need to
  // re-enumerate USB (which contends with an open session)
  const deviceNames = new Map<string, string>()

  // A dead worker took the libmtp session with it - forget it so the next
  // call reconnects instead of running session-less
  env.onWorkerExit(() => { connectedSerial = null })

  function serialOf(d: MtpRawDevice): string {
    return `mtp-${d.vendor_id}-${d.product_id}`
  }

  // --- session lock -----------------------------------------------------------

  let lockTail: Promise<unknown> = Promise.resolve()

  function withSession<T>(serial: string, signal: AbortSignal | undefined, fn: () => Promise<T>): Promise<T> {
    const run = async (): Promise<T> => {
      throwIfAborted(signal) // cancelled while waiting for its turn
      await ensureConnected(serial)
      return fn()
    }
    const result = lockTail.then(run, run)
    lockTail = result.catch(() => {})
    return result
  }

  /** Abort -> restart the worker (the only way to interrupt a blocking native call). */
  function bindAbort<T>(signal: AbortSignal | undefined, fn: () => Promise<T>): Promise<T> {
    if (!signal) return fn()
    const onAbort = () => env.stopWorker()
    signal.addEventListener('abort', onAbort, { once: true })
    return fn().finally(() => signal.removeEventListener('abort', onAbort))
  }

  async function ensureConnected(serial: string): Promise<void> {
    if (connectedSerial === serial) return
    if (connectedSerial) await releaseMtpConnection()
    await env.evictPtpcamerad()
    const m = serial.match(/^mtp-(\d+)-(\d+)$/)
    const connectArgs = m ? [Number(m[1]), Number(m[2])] : []
    let lastErr: unknown = null
    let ok = false
    try {
      ok = await env.call<boolean>('connect', connectArgs)
    } catch (err) {
      lastErr = err
    }
    if (!ok) {
      // ptpcamerad may have re-claimed the interface in the race window -
      // evict again and retry once
      await env.evictPtpcamerad()
      try {
        ok = await env.call<boolean>('connect', connectArgs)
      } catch (err) {
        lastErr = err
      }
    }
    if (!ok) {
      const detail = lastErr instanceof Error ? ` (${lastErr.message})` : ''
      throw new Error(
        `Could not open MTP session - set the phone to "File Transfer / Android Auto" USB mode and close Android File Transfer / OpenMTP if running${detail}`,
      )
    }
    connectedSerial = serial
  }

  async function releaseMtpConnection(): Promise<void> {
    if (!connectedSerial) return
    try { await env.call('release', []) } catch { /* device already gone */ }
    connectedSerial = null
  }

  // On any op failure the session state is suspect (unplug mid-op, worker
  // crash/restart, etc.) - drop it so the next call reconnects fresh.
  function invalidate(): void {
    connectedSerial = null
  }

  function fail(what: string, err: unknown): never {
    invalidate()
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`MTP ${what} failed: ${msg}`)
  }

  // --- path mapping -----------------------------------------------------------
  // The UI browses ADB-style paths (/sdcard/..., /storage/emulated/0/...).
  // MTP exposes the same tree rooted at '/'.

  function toMtpPath(p: string): string {
    const stripped = p
      .replace(/^\/storage\/emulated\/0/, '')
      .replace(/^\/sdcard/, '')
    return stripped === '' ? '/' : stripped
  }

  function joinRemote(dirPath: string, name: string): string {
    return dirPath.replace(/\/$/, '') + '/' + name
  }

  async function objectExists(p: string): Promise<boolean> {
    try {
      return !!(await env.call('get', [toMtpPath(p)]))
    } catch {
      return false
    }
  }

  function tempName(original: string): string {
    return `.droidwire-${crypto.randomBytes(4).toString('hex')}-${original}`
  }

  async function renameObject(mtpPath: string, newName: string): Promise<void> {
    const obj = await env.call<{ type: string }>('get', [mtpPath])
    const ok = obj?.type === 'FOLDER'
      ? await env.call<boolean>('setFolderName', [mtpPath, newName])
      : await env.call<boolean>('setFileName', [mtpPath, newName])
    if (!ok) throw new Error('rename returned failure')
  }

  // --- transport --------------------------------------------------------------

  let pollInFlight = false
  let lastDevices: TransportDevice[] = []

  const MtpTransport: Transport = {
    type: 'mtp',

    async getDevices(): Promise<TransportDevice[]> {
      // The renderer polls this regularly. Coalesce: while one probe is in
      // flight (it can sit behind a long getList in the worker's queue),
      // answer follow-up polls from the last known result instead of stacking
      // more calls into the queue.
      if (pollInFlight) return lastDevices
      pollInFlight = true
      try {
        if (connectedSerial) {
          // Session open: check liveness with a cheap session-scoped call.
          // getDeviceInfo() re-enumerates USB, which contends with the open
          // session and was observed to wedge the worker (20s watchdog kill
          // every poll) - never enumerate while connected.
          const serial = connectedSerial
          try {
            await env.call('getCurrentDeviceStorageInfo', [])
            lastDevices = [{ serial, name: deviceNames.get(serial) ?? 'MTP Device', type: 'mtp' as const }]
            return lastDevices
          } catch {
            if (connectedSerial === serial) connectedSerial = null // session dead - fall through to enumeration
          }
        }
        const raw = await env.call<MtpRawDevice[]>('getDeviceInfo', [])
        lastDevices = (raw ?? []).map(d => {
          const serial = serialOf(d)
          deviceNames.set(serial, d.product || d.vendor || 'MTP Device')
          return { serial, name: deviceNames.get(serial)!, type: 'mtp' as const }
        })
        return lastDevices
      } catch {
        lastDevices = []
        return []
      } finally {
        pollInFlight = false
      }
    },

    getDeviceInfo(serial) {
      return withSession(serial, undefined, async () => ({
        // Name comes from the enumeration cache - re-enumerating USB here would
        // contend with the session just opened
        model: deviceNames.get(serial) ?? 'MTP Device',
        androidVersion: '',
        battery: -1, // MTP does not expose battery level
      }))
    },

    listFiles(serial, dirPath): Promise<FileNode[]> {
      return withSession(serial, undefined, async () => {
        try {
          const entries = await env.call<MtpEntry[]>('getList', [toMtpPath(dirPath)])
          return sortNodes((entries ?? []).map(e => ({
            name: e.name,
            path: joinRemote(dirPath, e.name),
            size: e.type === 'FOLDER' ? 0 : e.size,
            type: e.type === 'FOLDER' ? 'dir' as const : 'file' as const,
            mimeType: e.type === 'FOLDER' ? null : guessMime(e.name),
            modified: (e.modificationdate || 0) * 1000,
          })))
        } catch (err) {
          return fail('list', err)
        }
      })
    },

    pullFile(serial, remotePath, localPath, opts: TransferOptions = {}): Promise<void> {
      return withSession(serial, opts.signal, () => bindAbort(opts.signal, async () => {
        try {
          const ok = await env.call<boolean>('download', [toMtpPath(remotePath), localPath], opts.onProgress)
          if (!ok) throw new Error('download returned failure')
        } catch (err) {
          if (opts.signal?.aborted) throw cancelledError()
          return fail('download', err)
        }
      }))
    },

    pushFile(serial, localPath, remotePath, opts: TransferOptions = {}): Promise<void> {
      if (!fs.existsSync(localPath)) return Promise.reject(new Error(`Local file not found: ${localPath}`))
      return withSession(serial, opts.signal, () => bindAbort(opts.signal, async () => {
        const targetFolder = toMtpPath(posixDir(remotePath))
        const wantedName = posixBase(remotePath)
        // MTP rejects duplicate names instead of overwriting, while `adb push`
        // replaces. Match adb for the conflict modal's "Replace" - but upload
        // under a temporary name first so a failed upload never destroys the
        // existing file.
        const replacing = await objectExists(remotePath)
        const uploadName = replacing ? tempName(wantedName) : wantedName

        // upload() always names the object after the local file, so stage a
        // link/copy carrying the name we want (hard link when possible - no
        // second copy of a multi-GB file).
        let uploadSrc = localPath
        let stagedDir: string | null = null
        if (uploadName !== path.basename(localPath)) {
          stagedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'droidwire-push-'))
          uploadSrc = path.join(stagedDir, uploadName)
          try { fs.linkSync(localPath, uploadSrc) } catch { fs.copyFileSync(localPath, uploadSrc) }
        }
        try {
          const ok = await env.call<boolean>('upload', [uploadSrc, targetFolder], opts.onProgress)
          if (!ok) throw new Error('upload returned failure')
          if (replacing) {
            await env.call('del', [toMtpPath(remotePath)])
            await renameObject(joinRemote(targetFolder, uploadName), wantedName)
          }
        } catch (err) {
          if (opts.signal?.aborted) throw cancelledError()
          return fail('upload', err)
        } finally {
          if (stagedDir) fs.rmSync(stagedDir, { recursive: true, force: true })
        }
      }))
    },

    deleteFile(serial, filePath): Promise<void> {
      return withSession(serial, undefined, async () => {
        try {
          const ok = await env.call<boolean>('del', [toMtpPath(filePath)])
          if (!ok) throw new Error('delete returned failure')
        } catch (err) {
          return fail('delete', err)
        }
      })
    },

    renameFile(serial, oldPath, newName): Promise<void> {
      return withSession(serial, undefined, async () => {
        try {
          await renameObject(toMtpPath(oldPath), newName)
        } catch (err) {
          return fail('rename', err)
        }
      })
    },

    moveFile(serial, srcPath, destPath): Promise<void> {
      return withSession(serial, undefined, async () => {
        const srcDir = posixDir(srcPath)
        const dstDir = posixDir(destPath)
        const srcName = posixBase(srcPath)
        const dstName = posixBase(destPath)
        try {
          if (srcDir === dstDir) {
            // Same folder: a move is just a rename
            if (srcName !== dstName) await renameObject(toMtpPath(srcPath), dstName)
            return
          }
          const dstExists = await objectExists(destPath)
          if (srcName === dstName && !dstExists) {
            // The direct case: PTP MoveObject into the target folder
            const ok = await env.call<boolean>('move', [toMtpPath(srcPath), toMtpPath(dstDir)])
            if (!ok) throw new Error('move returned failure')
            return
          }
          // The name changes (keep-both) or the destination exists (replace).
          // MTP has no atomic overwrite and a move keeps the source name, so go
          // through a unique temporary name that cannot collide at either end.
          const tmp = tempName(srcName)
          const srcMtp = toMtpPath(srcPath)
          const tmpInSrc = joinRemote(toMtpPath(srcDir), tmp)
          await renameObject(srcMtp, tmp)
          try {
            const ok = await env.call<boolean>('move', [tmpInSrc, toMtpPath(dstDir)])
            if (!ok) throw new Error('move returned failure')
          } catch (err) {
            // Put the original name back so a failed move leaves no trace
            try { await renameObject(tmpInSrc, srcName) } catch { /* best effort */ }
            throw err
          }
          const tmpInDst = joinRemote(toMtpPath(dstDir), tmp)
          if (dstExists) await env.call('del', [toMtpPath(destPath)])
          await renameObject(tmpInDst, dstName)
        } catch (err) {
          const hint = ' - this device may not support moving between folders; copy the item, then delete the original'
          invalidate()
          throw new Error(`MTP move failed: ${err instanceof Error ? err.message : err}${hint}`)
        }
      })
    },

    makeDir(serial, dirPath): Promise<void> {
      return withSession(serial, undefined, async () => {
        const target = toMtpPath(dirPath)
        try {
          await env.call('createFolder', [posixDir(target), posixBase(target)])
        } catch (err) {
          return fail('mkdir', err)
        }
      })
    },

    copy(serial, srcPath, dstPath): Promise<void> {
      return withSession(serial, undefined, async () => {
        const src = toMtpPath(srcPath)
        const targetFolder = toMtpPath(posixDir(dstPath))
        const wantedName = posixBase(dstPath)
        const srcName = posixBase(src)
        try {
          const ok = await env.call<boolean>('copy', [src, targetFolder])
          if (!ok) throw new Error('copy returned failure')
          // copy() keeps the source name in the target folder - rename if the
          // destination path asked for a different name (e.g. "file (2).jpg")
          if (wantedName !== srcName) {
            await renameObject(joinRemote(targetFolder, srcName), wantedName)
          }
        } catch (err) {
          return fail('copy', err)
        }
      })
    },

    statObject(serial, targetPath): Promise<string | null> {
      return withSession(serial, undefined, async () => {
        try {
          const obj = await env.call<{ modificationdate?: number }>('get', [toMtpPath(targetPath)])
          if (!obj?.modificationdate) return null
          return new Date(obj.modificationdate * 1000).toISOString().replace('T', ' ').slice(0, 19)
        } catch (err) {
          return fail('stat', err)
        }
      })
    },

    getStorage(serial): Promise<StorageInfo> {
      // getCurrentDeviceStorageInfo() only returns { id, StorageDescription,
      // VolumeIdentifier } - verified against a real device - no
      // capacity/free-space fields exist anywhere in luck-node-mtp's API.
      // total: 0 is a sentinel the UI reads as "storage info unavailable".
      return withSession(serial, undefined, async () => ({ total: 0, used: 0, free: 0 }))
    },
  }

  return MtpTransport
}
