import { execFile, spawn } from 'child_process'
import fs from 'fs'
import os from 'os'
import type { FileNode, StorageInfo } from '@droidwire/shared'
import { cancelledError, throwIfAborted, type Transport, type TransportDevice, type TransferOptions } from './transport.ts'
import { getActiveSerial } from './active-device.ts'
import { findAdb } from './lib/adb-path.ts'
import { parseAdbDevices, dedupeByHardware, type AdbDeviceRow } from './lib/adb-devices.ts'
import { parseLsLa } from './lib/ls-parse.ts'
import { shQuote } from './lib/shell.ts'
import { explainRemoteNameError } from './lib/android-names.ts'
import { treeSize } from './lib/fsx.ts'
import { posixBase, posixDir, isProtectedRemotePath } from './lib/paths.ts'
import path from 'path'

// ---------------------------------------------------------------------------
// adb binary + process helpers. Every function that talks to a phone takes
// the serial explicitly; nothing here consults the UI's "active device".
// ---------------------------------------------------------------------------

const ADB_MAX = 6
let adbSlots = 0
const adbQueue: Array<() => void> = []

// Short commands share a small pool so a huge folder listing cannot exhaust
// process limits (EAGAIN). Long transfers deliberately bypass it: they would
// otherwise hold slots for minutes and starve listings.
function withAdbSlot<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const run = () => {
      adbSlots++
      fn().then(resolve, reject).finally(() => {
        adbSlots--
        adbQueue.shift()?.()
      })
    }
    if (adbSlots < ADB_MAX) run()
    else adbQueue.push(run)
  })
}

export function getAdbBinary(): string {
  return findAdb({
    resourcesDir: process.resourcesPath,
    env: process.env,
    homeDir: os.homedir(),
    exists: fs.existsSync,
  })
}

function scoped(serial: string | null, args: string[]): string[] {
  return serial ? ['-s', serial, ...args] : args
}

export interface AdbExecOptions {
  timeout?: number
  maxBuffer?: number
  signal?: AbortSignal
}

/** Run adb against one device (or host-wide when serial is null) and return stdout. */
export function adbExec(serial: string | null, args: string[], opts: AdbExecOptions = {}): Promise<string> {
  return withAdbSlot(() => new Promise<string>((resolve, reject) => {
    throwIfAborted(opts.signal)
    const proc = execFile(
      getAdbBinary(),
      scoped(serial, args),
      { timeout: opts.timeout ?? 15_000, maxBuffer: opts.maxBuffer ?? 8 * 1024 * 1024, signal: opts.signal },
      (err, stdout, stderr) => {
        if (err) {
          if (opts.signal?.aborted) reject(cancelledError())
          else reject(new Error(stderr.trim() || err.message))
        } else resolve(stdout)
      },
    )
    proc.on('error', reject)
  }))
}

/** `adb -s <serial> shell <command>`; the command string MUST already be quoted. */
export function adbShell(serial: string, command: string, opts?: AdbExecOptions): Promise<string> {
  return adbExec(serial, ['shell', command], opts)
}

/** Host-wide command (devices, pair, connect, mdns). Returns stdout+stderr. */
export function adbHost(args: string[], timeout: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = execFile(getAdbBinary(), args, { timeout }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr.trim() || stdout.trim() || err.message))
      else resolve(stdout + stderr)
    })
    proc.on('error', reject)
  })
}

/**
 * Run a long `adb` transfer command, optionally polling for progress.
 * `probe` returns the bytes moved so far (or null while unknown).
 * Aborting the signal kills the child and rejects with a cancellation error.
 */
function runTransfer(
  serial: string,
  args: string[],
  opts: { signal?: AbortSignal; probe?: () => Promise<number | null>; pollMs: number; onProgress?: (n: number) => void },
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (opts.signal?.aborted) { reject(cancelledError()); return }
    const proc = spawn(getAdbBinary(), scoped(serial, args))
    let stderr = ''
    let settled = false
    let probing = false

    const poll = opts.probe && opts.onProgress
      ? setInterval(async () => {
          if (probing || settled) return
          probing = true
          try {
            const n = await opts.probe!()
            if (n !== null && !settled) opts.onProgress!(n)
          } catch { /* destination not created yet */ }
          probing = false
        }, opts.pollMs)
      : null

    const finish = (err: Error | null) => {
      if (settled) return
      settled = true
      if (poll) clearInterval(poll)
      opts.signal?.removeEventListener('abort', onAbort)
      if (err) reject(err)
      else resolve()
    }
    const onAbort = () => {
      try { proc.kill() } catch { /* already dead */ }
      finish(cancelledError())
    }
    opts.signal?.addEventListener('abort', onAbort, { once: true })

    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString() })
    proc.stdout.on('data', () => { /* progress text is not machine readable when not on a TTY */ })
    proc.on('error', err => finish(err))
    proc.on('close', code => {
      if (code === 0) finish(null)
      else finish(new Error(stderr.trim() || `adb ${args[0]} failed (exit ${code})`))
    })
  })
}

/** Raw adb child for streaming callers (the video range server). Caller owns its lifetime. */
export function adbSpawn(serial: string | null, args: string[]): ReturnType<typeof spawn> {
  return spawn(getAdbBinary(), scoped(serial, args))
}

/**
 * Pull a whole directory tree into `localParent/<basename>` and return that
 * path. Progress is local bytes written versus the remote `du` size.
 */
export async function pullTree(
  serial: string,
  remoteDir: string,
  localParent: string,
  opts: TransferOptions = {},
): Promise<string> {
  throwIfAborted(opts.signal)
  const target = path.join(localParent, posixBase(remoteDir))
  let total = 0
  try {
    const kb = parseInt((await adbShell(serial, `du -sk ${shQuote(remoteDir)}`, { timeout: 60_000 })).trim().split(/\s+/)[0], 10)
    if (!Number.isNaN(kb)) total = kb * 1024
  } catch { /* unknown total: progress shows bytes only */ }
  await runTransfer(serial, ['pull', remoteDir, localParent], {
    signal: opts.signal,
    pollMs: 500,
    probe: () => treeSize(target),
    onProgress: n => opts.onProgress?.(n, total),
  })
  return target
}

/** True if the device ships a `zip` executable (most stock Android builds do not). */
export async function deviceHasZip(serial: string): Promise<boolean> {
  try {
    return (await adbShell(serial, 'command -v zip >/dev/null 2>&1 && echo yes || echo no')).trim() === 'yes'
  } catch {
    return false
  }
}

// --- device enumeration --------------------------------------------------------

const modelCache = new Map<string, string>()
const hwSerialCache = new Map<string, string>()
const ejected = new Set<string>()

export function addEjectedSerial(serial: string): void { ejected.add(serial) }
export function clearEjectedSerials(): void { ejected.clear() }
export function forgetDeviceCaches(): void { modelCache.clear(); hwSerialCache.clear() }

async function prop(serial: string, key: string): Promise<string> {
  return (await adbShell(serial, `getprop ${key}`)).trim()
}

function parseBatteryLevel(dumpsys: string): number {
  const m = dumpsys.match(/level:\s*(\d+)/)
  return m ? parseInt(m[1], 10) : -1
}

async function remoteSize(serial: string, remotePath: string): Promise<number | null> {
  try {
    const n = parseInt((await adbShell(serial, `stat -c '%s' ${shQuote(remotePath)}`)).trim(), 10)
    return Number.isNaN(n) ? null : n
  } catch {
    return null
  }
}

/** Raw `adb devices` rows (any state), for explaining why no phone is usable yet. */
export async function adbDeviceRows(): Promise<AdbDeviceRow[]> {
  return parseAdbDevices(await adbExec(null, ['devices'])).filter(d => !ejected.has(d.serial))
}

export const AdbTransport: Transport = {
  type: 'adb',

  async getDevices(): Promise<TransportDevice[]> {
    const rows = parseAdbDevices(await adbExec(null, ['devices'])).filter(d => !ejected.has(d.serial))
    const online = rows.filter(d => d.state === 'device')

    for (const d of online) {
      if (!modelCache.has(d.serial)) {
        try { modelCache.set(d.serial, await prop(d.serial, 'ro.product.model')) } catch { /* leave unnamed */ }
      }
      if (!hwSerialCache.has(d.serial)) {
        try {
          const hw = await prop(d.serial, 'ro.serialno')
          if (hw) hwSerialCache.set(d.serial, hw)
        } catch { /* identify by adb serial */ }
      }
    }

    const unique = dedupeByHardware(online, getActiveSerial('adb'), s => hwSerialCache.get(s) ?? s)
    return unique.map(d => ({ serial: d.serial, name: modelCache.get(d.serial) || d.serial, type: 'adb' as const }))
  },

  async getDeviceInfo(serial) {
    const [model, battery] = await Promise.all([
      prop(serial, 'ro.product.model'),
      adbShell(serial, 'dumpsys battery'),
    ])
    return { model, androidVersion: '', battery: parseBatteryLevel(battery) }
  },

  async listFiles(serial, dirPath): Promise<FileNode[]> {
    const out = await adbShell(serial, `ls -la --color=never ${shQuote(dirPath)}`)
    return parseLsLa(out, dirPath)
  },

  async pullFile(serial, remotePath, localPath, opts: TransferOptions = {}): Promise<void> {
    throwIfAborted(opts.signal)
    const total = (await remoteSize(serial, remotePath)) ?? 0
    await runTransfer(serial, ['pull', remotePath, localPath], {
      signal: opts.signal,
      pollMs: 250,
      probe: async () => fs.statSync(localPath).size,
      onProgress: n => opts.onProgress?.(n, total),
    })
  },

  async pushFile(serial, localPath, remotePath, opts: TransferOptions = {}): Promise<void> {
    if (!fs.existsSync(localPath)) throw new Error(`Local file not found: ${localPath}`)
    throwIfAborted(opts.signal)
    const total = fs.statSync(localPath).size
    // adb prints [ XX%] only when attached to a TTY, so poll the remote size instead
    await runTransfer(serial, ['push', localPath, remotePath], {
      signal: opts.signal,
      pollMs: 400,
      probe: () => remoteSize(serial, remotePath),
      onProgress: n => opts.onProgress?.(n, total),
    }).catch(err => { throw explainRemoteNameError(err, posixBase(remotePath)) })
  },

  async deleteFile(serial, filePath): Promise<void> {
    if (isProtectedRemotePath(filePath)) throw new Error('Refusing to delete a storage root')
    await adbShell(serial, `rm -rf ${shQuote(filePath)}`)
  },

  async renameFile(serial, oldPath, newName): Promise<void> {
    if (newName.includes('/') || newName === '' || newName === '.' || newName === '..') throw new Error('Invalid name')
    await adbShell(serial, `mv ${shQuote(oldPath)} ${shQuote(posixDir(oldPath).replace(/\/$/, '') + '/' + newName)}`)
      .catch(err => { throw explainRemoteNameError(err, newName) })
  },

  async moveFile(serial, srcPath, destPath): Promise<void> {
    if (isProtectedRemotePath(srcPath)) throw new Error('Refusing to move a storage root')
    await adbShell(serial, `mv ${shQuote(srcPath)} ${shQuote(destPath)}`)
      .catch(err => { throw explainRemoteNameError(err, posixBase(destPath)) })
  },

  async makeDir(serial, dirPath): Promise<void> {
    await adbShell(serial, `mkdir -p ${shQuote(dirPath)}`)
      .catch(err => { throw explainRemoteNameError(err, posixBase(dirPath)) })
  },

  async copy(serial, srcPath, dstPath): Promise<void> {
    await adbShell(serial, `cp -r ${shQuote(srcPath)} ${shQuote(dstPath)}`, { timeout: 120_000 })
      .catch(err => { throw explainRemoteNameError(err, posixBase(dstPath)) })
  },

  async getStorage(serial): Promise<StorageInfo> {
    const out = await adbShell(serial, 'df -k /sdcard')
    const lines = out.split('\n').filter(l => l.trim() && !l.startsWith('Filesystem'))
    if (!lines.length) throw new Error('Could not read storage')
    // df -k columns: Filesystem 1K-blocks Used Available Use% Mounted
    const parts = lines[0].trim().split(/\s+/)
    return {
      total: parseInt(parts[1], 10) * 1024,
      used: parseInt(parts[2], 10) * 1024,
      free: parseInt(parts[3], 10) * 1024,
    }
  },
}

