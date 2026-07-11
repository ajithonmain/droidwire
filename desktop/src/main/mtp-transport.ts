import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFile } from 'child_process'
import type { FileNode, StorageInfo } from '@droidwire/shared'
import type { Transport, TransportDevice } from './transport'
import { callMtp, onMtpWorkerExit } from './mtp-worker-client'

// luck-node-mtp: synchronous libmtp bindings with a singleton connection,
// proxied through mtp-worker-client (see that file for why — a real SIGSEGV
// was observed when calling this module directly from Electron's main
// process). All calls below go through callMtp() → child process → IPC.
//
// API surface (README-verified):
//   connect(vid?, pid?) / release() — one device at a time
//   getDeviceInfo() → [{ vendor, vendor_id, product, product_id }]
//   getList(parentPath) → [{ name, size, type: 'FILE'|'FOLDER', id, modificationdate, ... }]
//   download(devPath, localPath, (sent, total) => void)
//   upload(localFile, targetFolderPath, (sent, total) => void)
//   del(path), move(src, folder), copy(src, folder)
//   setFileName(path, newName), setFolderName(path, newName)
//   createFolder(parentPath, name) → id
//   getCurrentDeviceStorageInfo() → [{ id, StorageDescription, ... }]
//   get(path) → object info (used to tell file vs folder before rename)

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

export function mtpAvailable(): boolean {
  // The worker is spawned lazily on first call; assume available and let
  // the first real call surface a clear error if the native module is missing.
  return true
}

// --- Connection management (singleton — libmtp allows one open device) ------

let _connectedSerial: string | null = null
// Device names captured during enumeration, so later lookups don't need to
// re-enumerate USB (which contends with an open session)
const _deviceNames = new Map<string, string>()

// A dead worker took the libmtp session with it — forget it so the next
// call reconnects instead of running session-less
onMtpWorkerExit(() => { _connectedSerial = null })

function serialOf(d: MtpRawDevice): string {
  return `mtp-${d.vendor_id}-${d.product_id}`
}

// macOS's ptpcamerad (feeds Image Capture/Photos) claims every attached MTP
// device's USB interface, making libmtp's claim fail (and it respawns via
// launchd, re-claiming on each device attach). Evict it right before we
// connect — same technique OpenMTP uses; once our session holds the
// interface, its respawn can't take the device back.
function evictPtpcamerad(): Promise<void> {
  return new Promise(resolve => {
    execFile('killall', ['ptpcamerad'], () => resolve()) // exit 1 (not running) is fine
  })
}

async function ensureConnected(serial: string): Promise<void> {
  if (_connectedSerial === serial) return
  if (_connectedSerial) await releaseMtpConnection()
  await evictPtpcamerad()
  const m = serial.match(/^mtp-(\d+)-(\d+)$/)
  const connectArgs = m ? [Number(m[1]), Number(m[2])] : []
  let lastErr: unknown = null
  let ok = false
  try {
    ok = await callMtp<boolean>('connect', connectArgs)
  } catch (err) {
    lastErr = err
  }
  if (!ok) {
    // ptpcamerad may have re-claimed the interface in the race window —
    // evict again and retry once
    await evictPtpcamerad()
    try {
      ok = await callMtp<boolean>('connect', connectArgs)
    } catch (err) {
      lastErr = err
    }
  }
  if (!ok) {
    const detail = lastErr instanceof Error ? ` (${lastErr.message})` : ''
    throw new Error(
      `Could not open MTP session — set the phone to "File Transfer / Android Auto" USB mode and close Android File Transfer / OpenMTP if running${detail}`
    )
  }
  _connectedSerial = serial
}

export async function releaseMtpConnection(): Promise<void> {
  if (!_connectedSerial) return
  try { await callMtp('release', []) } catch { /* device already gone */ }
  _connectedSerial = null
}

// On any op failure the session state is suspect (unplug mid-op, worker
// crash/restart, etc.) — drop it so the next call reconnects fresh.
function invalidate(): void {
  _connectedSerial = null
}

// --- Path mapping ------------------------------------------------------------
// The UI browses ADB-style paths (/sdcard/..., /storage/emulated/0/...).
// MTP exposes the same tree rooted at '/'.

function toMtpPath(p: string): string {
  const stripped = p
    .replace(/^\/storage\/emulated\/0/, '')
    .replace(/^\/sdcard/, '')
  return stripped === '' ? '/' : stripped
}

function fromMtpName(dirPath: string, name: string): string {
  return dirPath.replace(/\/$/, '') + '/' + name
}

// --- Transport implementation -------------------------------------------------

let _pollInFlight = false
let _lastDevices: TransportDevice[] = []

export const MtpTransport: Transport = {
  type: 'mtp',

  async getDevices(): Promise<TransportDevice[]> {
    // The renderer polls this every 2s. Coalesce: while one probe is in
    // flight (it can sit behind a long getList in the worker's queue),
    // answer follow-up polls from the last known result instead of stacking
    // more calls into the queue.
    if (_pollInFlight) return _lastDevices
    _pollInFlight = true
    try {
      if (_connectedSerial) {
        // Session open: check liveness with a cheap session-scoped call.
        // getDeviceInfo() re-enumerates USB, which contends with the open
        // session and was observed to wedge the worker (20s watchdog kill
        // every poll) — never enumerate while connected.
        try {
          await callMtp('getCurrentDeviceStorageInfo', [])
          _lastDevices = [{
            serial: _connectedSerial,
            name: _deviceNames.get(_connectedSerial) ?? 'MTP Device',
            type: 'mtp' as const,
          }]
          return _lastDevices
        } catch {
          _connectedSerial = null // session dead — fall through to enumeration
        }
      }
      const raw = await callMtp<MtpRawDevice[]>('getDeviceInfo', [])
      _lastDevices = (raw ?? []).map(d => {
        const serial = serialOf(d)
        _deviceNames.set(serial, d.product || d.vendor || 'MTP Device')
        return { serial, name: _deviceNames.get(serial)!, type: 'mtp' as const }
      })
      return _lastDevices
    } catch {
      _lastDevices = []
      return []
    } finally {
      _pollInFlight = false
    }
  },

  async getDeviceInfo(serial: string) {
    await ensureConnected(serial)
    // Name comes from the enumeration cache — re-enumerating USB here would
    // contend with the session just opened above
    const name = _deviceNames.get(serial) ?? 'MTP Device'
    return {
      model: name,
      androidVersion: '',
      battery: -1, // MTP does not expose battery level
    }
  },

  async listFiles(serial: string, dirPath: string): Promise<FileNode[]> {
    await ensureConnected(serial)
    try {
      const entries = await callMtp<MtpEntry[]>('getList', [toMtpPath(dirPath)])
      const nodes: FileNode[] = (entries ?? []).map(e => ({
        name: e.name,
        path: fromMtpName(dirPath, e.name),
        size: e.type === 'FOLDER' ? 0 : e.size,
        type: e.type === 'FOLDER' ? 'dir' : 'file',
        mimeType: e.type === 'FOLDER' ? null : guessMimeMtp(e.name),
        modified: (e.modificationdate || 0) * 1000,
      }))
      return nodes.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      })
    } catch (err) {
      invalidate()
      throw new Error(`MTP list failed: ${err instanceof Error ? err.message : err}`)
    }
  },

  async pullFile(serial, remotePath, localPath, onProgress): Promise<void> {
    await ensureConnected(serial)
    try {
      const ok = await callMtp<boolean>('download', [toMtpPath(remotePath), localPath], onProgress)
      if (!ok) throw new Error('MTP download returned failure')
    } catch (err) {
      invalidate()
      throw new Error(`MTP download failed: ${err instanceof Error ? err.message : err}`)
    }
  },

  async pushFile(serial, localPath, remotePath, onProgress): Promise<void> {
    if (!fs.existsSync(localPath)) throw new Error(`Local file not found: ${localPath}`)
    await ensureConnected(serial)
    const targetFolder = toMtpPath(path.posix.dirname(remotePath))
    const wantedName = path.posix.basename(remotePath)

    // MTP rejects duplicate names instead of overwriting — adb push replaces,
    // so match that: drop an existing object at the destination path first
    // (also what the conflict modal's "Replace" expects)
    try {
      await callMtp('get', [toMtpPath(remotePath)])
      await callMtp('del', [toMtpPath(remotePath)])
    } catch { /* nothing at the destination — the common case */ }

    // upload() always names the object after the local file, so a differing
    // destination name (conflict modal's "Keep both" → "x (1).jpg") must be
    // staged as a local copy with the wanted name — uploading under the
    // original name would collide with the file that made it a conflict
    let uploadSrc = localPath
    let stagedDir: string | null = null
    if (wantedName !== path.basename(localPath)) {
      stagedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'droidwire-push-'))
      uploadSrc = path.join(stagedDir, wantedName)
      fs.copyFileSync(localPath, uploadSrc)
    }
    try {
      const ok = await callMtp<boolean>('upload', [uploadSrc, targetFolder], onProgress)
      if (!ok) throw new Error('MTP upload returned failure')
    } catch (err) {
      invalidate()
      throw new Error(`MTP upload failed: ${err instanceof Error ? err.message : err}`)
    } finally {
      if (stagedDir) fs.rmSync(stagedDir, { recursive: true, force: true })
    }
  },

  async deleteFile(serial, filePath): Promise<void> {
    await ensureConnected(serial)
    try {
      const ok = await callMtp<boolean>('del', [toMtpPath(filePath)])
      if (!ok) throw new Error('MTP delete returned failure')
    } catch (err) {
      invalidate()
      throw new Error(`MTP delete failed: ${err instanceof Error ? err.message : err}`)
    }
  },

  async renameFile(serial, oldPath, newName): Promise<void> {
    await ensureConnected(serial)
    const target = toMtpPath(oldPath)
    try {
      const obj = await callMtp<{ type: string }>('get', [target])
      const ok = obj?.type === 'FOLDER'
        ? await callMtp<boolean>('setFolderName', [target, newName])
        : await callMtp<boolean>('setFileName', [target, newName])
      if (!ok) throw new Error('MTP rename returned failure')
    } catch (err) {
      invalidate()
      throw new Error(`MTP rename failed: ${err instanceof Error ? err.message : err}`)
    }
  },

  async makeDir(serial, dirPath): Promise<void> {
    await ensureConnected(serial)
    const target = toMtpPath(dirPath)
    const parent = path.posix.dirname(target)
    const name = path.posix.basename(target)
    try {
      await callMtp('createFolder', [parent === '' ? '/' : parent, name])
    } catch (err) {
      invalidate()
      throw new Error(`MTP mkdir failed: ${err instanceof Error ? err.message : err}`)
    }
  },

  async copy(serial, srcPath, dstPath): Promise<void> {
    await ensureConnected(serial)
    const src = toMtpPath(srcPath)
    const targetFolder = toMtpPath(path.posix.dirname(dstPath))
    const wantedName = path.posix.basename(dstPath)
    const srcName = path.posix.basename(src)
    try {
      const ok = await callMtp<boolean>('copy', [src, targetFolder])
      if (!ok) throw new Error('MTP copy returned failure')
      // copy() keeps the source name in the target folder — rename if the
      // destination path asked for a different name (e.g. "file (2).jpg")
      if (wantedName !== srcName) {
        const obj = await callMtp<{ type: string }>('get', [src])
        const copiedPath = targetFolder.replace(/\/$/, '') + '/' + srcName
        if (obj?.type === 'FOLDER') await callMtp('setFolderName', [copiedPath, wantedName])
        else await callMtp('setFileName', [copiedPath, wantedName])
      }
    } catch (err) {
      invalidate()
      throw new Error(`MTP copy failed: ${err instanceof Error ? err.message : err}`)
    }
  },

  async statObject(serial, targetPath): Promise<string | null> {
    await ensureConnected(serial)
    try {
      const obj = await callMtp<{ modificationdate?: number }>('get', [toMtpPath(targetPath)])
      if (!obj?.modificationdate) return null
      return new Date(obj.modificationdate * 1000).toISOString().replace('T', ' ').slice(0, 19)
    } catch (err) {
      invalidate()
      throw new Error(`MTP stat failed: ${err instanceof Error ? err.message : err}`)
    }
  },

  async getStorage(serial): Promise<StorageInfo> {
    // getCurrentDeviceStorageInfo() only returns { id, StorageDescription,
    // VolumeIdentifier } — verified against a real device — no
    // capacity/free-space fields exist anywhere in luck-node-mtp's API.
    // total: 0 is a sentinel the UI reads as "storage info unavailable".
    await ensureConnected(serial)
    return { total: 0, used: 0, free: 0 }
  },
}

function guessMimeMtp(filename: string): string | null {
  const ext = filename.split('.').pop()?.toLowerCase()
  const map: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    gif: 'image/gif', webp: 'image/webp', heic: 'image/heic',
    svg: 'image/svg+xml', bmp: 'image/bmp', ico: 'image/x-icon',
    tiff: 'image/tiff', tif: 'image/tiff',
    mp4: 'video/mp4', mov: 'video/quicktime', mkv: 'video/x-matroska',
    avi: 'video/x-msvideo', webm: 'video/webm', m4v: 'video/mp4', '3gp': 'video/3gpp',
    mp3: 'audio/mpeg', aac: 'audio/aac', flac: 'audio/flac',
    wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4', opus: 'audio/opus',
    pdf: 'application/pdf',
    zip: 'application/zip', rar: 'application/x-rar-compressed',
    '7z': 'application/x-7z-compressed', tar: 'application/x-tar', gz: 'application/gzip',
    apk: 'application/vnd.android.package-archive',
    txt: 'text/plain', md: 'text/markdown', csv: 'text/csv',
    html: 'text/html', htm: 'text/html',
    css: 'text/css', js: 'text/javascript', ts: 'text/plain',
    json: 'application/json', xml: 'text/xml', yaml: 'text/plain', yml: 'text/plain',
    sh: 'application/x-sh', py: 'text/plain', rb: 'text/plain',
    c: 'text/plain', cpp: 'text/plain', h: 'text/plain', kt: 'text/plain',
  }
  return ext ? (map[ext] ?? 'application/octet-stream') : null
}
