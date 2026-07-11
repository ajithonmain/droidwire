import { execFile } from 'child_process'
import fs from 'fs'
import path from 'path'
import type { FileNode, StorageInfo } from '@droidwire/shared'
import type { Transport, TransportDevice } from './transport'

let _adbSlots = 0
const _adbQueue: Array<() => void> = []
const ADB_MAX = 6

function withAdbSlot<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const run = () => {
      _adbSlots++
      fn().then(resolve, reject).finally(() => {
        _adbSlots--
        _adbQueue.shift()?.()
      })
    }
    if (_adbSlots < ADB_MAX) run()
    else _adbQueue.push(run)
  })
}

function adbBin(): string {
  const bundled = path.join(process.resourcesPath ?? '', 'adb')
  if (fs.existsSync(bundled)) return bundled
  for (const p of ['/opt/homebrew/bin/adb', '/usr/local/bin/adb']) {
    if (fs.existsSync(p)) return p
  }
  return 'adb'
}

let _activeSerial: string | null = null
const _modelCache = new Map<string, string>()
const _hwSerialCache = new Map<string, string>()

function isWirelessSerial(serial: string): boolean {
  return serial.includes(':') || serial.startsWith('adb-') || serial.includes('_adb-tls-connect')
}

function transportRank(serial: string): number {
  if (!isWirelessSerial(serial)) return 0
  return serial.includes(':') && !serial.includes('_adb-tls-connect') ? 1 : 2
}

function adbArgs(args: string[]): string[] {
  if (!_activeSerial || args[0] === 'devices' || args[0] === '-s') return args
  return ['-s', _activeSerial, ...args]
}

function adb(args: string[]): Promise<string> {
  return withAdbSlot(() => new Promise((resolve, reject) => {
    const proc = execFile(adbBin(), adbArgs(args), { timeout: 15000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr.trim() || err.message))
      else resolve(stdout)
    })
    proc.on('error', reject)
  }))
}

function adbLong(args: string[], timeout = 120_000): Promise<string> {
  return withAdbSlot(() => new Promise((resolve, reject) => {
    const proc = execFile(adbBin(), adbArgs(args), { timeout, maxBuffer: 32 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr.trim() || err.message))
      else resolve(stdout)
    })
    proc.on('error', reject)
  }))
}

function sq(p: string): string {
  return `'${p.replace(/'/g, "'\\''")}'`
}

function parseLsLa(output: string, dirPath: string): FileNode[] {
  const nodes: FileNode[] = []
  for (const line of output.split('\n')) {
    const m = line.match(
      /^([dlrwxst-]{10})\s+\d+\s+\S+\s+\S+\s+(\d+)\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\s+(.+)$/
    )
    if (!m) continue
    const [, perms, sizeStr, date, time, rawName] = m
    const name = rawName.trim()
    if (name === '.' || name === '..') continue
    const isDir = perms[0] === 'd'
    const isLink = perms[0] === 'l'
    const cleanName = isLink ? name.split(' -> ')[0].trim() : name
    nodes.push({
      name: cleanName,
      path: dirPath.replace(/\/$/, '') + '/' + cleanName,
      size: isDir ? 0 : parseInt(sizeStr, 10),
      type: isDir ? 'dir' : 'file',
      mimeType: isDir ? null : guessMime(cleanName),
      modified: new Date(`${date}T${time}:00`).getTime(),
    })
  }
  return nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  })
}

function guessMime(name: string): string | null {
  const ext = name.split('.').pop()?.toLowerCase()
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

const _ejectedSerials = new Set<string>()

export const AdbTransport: Transport = {
  type: 'adb',

  async getDevices(): Promise<TransportDevice[]> {
    const out = await adb(['devices'])
    const devices = out
      .split('\n')
      .slice(1)
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('*') && l.includes('\t'))
      .map(l => {
        const [serial, state] = l.split('\t')
        return { serial: serial.trim(), state: state.trim(), model: '' }
      })
      .filter(d => !_ejectedSerials.has(d.serial))

    const online = devices.filter(d => d.state === 'device')
    if (!_activeSerial || !online.some(d => d.serial === _activeSerial)) {
      _activeSerial = online[0]?.serial ?? null
    }

    for (const d of online) {
      if (!_modelCache.has(d.serial)) {
        try {
          const model = await adb(['-s', d.serial, 'shell', 'getprop', 'ro.product.model'])
          _modelCache.set(d.serial, model.trim())
        } catch { /* leave unnamed */ }
      }
      d.model = _modelCache.get(d.serial) ?? d.serial
      if (!_hwSerialCache.has(d.serial)) {
        try {
          const hw = (await adb(['-s', d.serial, 'shell', 'getprop', 'ro.serialno'])).trim()
          if (hw) _hwSerialCache.set(d.serial, hw)
        } catch { /* identify by adb serial */ }
      }
    }

    const byHw = new Map<string, (typeof online)[number]>()
    for (const d of online) {
      const hw = _hwSerialCache.get(d.serial) ?? d.serial
      const existing = byHw.get(hw)
      if (!existing) { byHw.set(hw, d); continue }
      const keepNew = d.serial === _activeSerial
        || (existing.serial !== _activeSerial && transportRank(d.serial) < transportRank(existing.serial))
      if (keepNew) byHw.set(hw, d)
    }
    const deduped = online.filter(d => byHw.get(_hwSerialCache.get(d.serial) ?? d.serial) === d)

    return [...deduped, ...devices.filter(d => d.state !== 'device')].map(d => ({
      serial: d.serial,
      name: d.model || d.serial,
      type: 'adb' as const,
    }))
  },

  async getDeviceInfo(serial: string) {
    _activeSerial = serial
    const [model, batteryOut] = await Promise.all([
      adb(['shell', 'getprop', 'ro.product.model']),
      adb(['shell', 'dumpsys', 'battery']),
    ])
    const levelMatch = batteryOut.match(/level:\s*(\d+)/)
    return {
      model: model.trim(),
      androidVersion: '',
      battery: levelMatch ? parseInt(levelMatch[1], 10) : -1,
    }
  },

  async listFiles(serial: string, dirPath: string): Promise<FileNode[]> {
    _activeSerial = serial
    const out = await adb(['shell', `ls -la --color=never ${sq(dirPath)}`])
    return parseLsLa(out, dirPath)
  },

  async pullFile(serial: string, remotePath: string, localPath: string, onProgress?: (sent: number, total: number) => void): Promise<void> {
    _activeSerial = serial
    await adb(['pull', remotePath, localPath])
    if (onProgress && fs.existsSync(localPath)) {
      const size = fs.statSync(localPath).size
      onProgress(size, size)
    }
  },

  async pushFile(serial: string, localPath: string, remotePath: string, onProgress?: (sent: number, total: number) => void): Promise<void> {
    _activeSerial = serial
    if (!fs.existsSync(localPath)) throw new Error(`Local file not found: ${localPath}`)
    const stats = fs.statSync(localPath)
    await adb(['push', localPath, remotePath])
    if (onProgress) onProgress(stats.size, stats.size)
  },

  async deleteFile(serial: string, filePath: string): Promise<void> {
    _activeSerial = serial
    await adb(['shell', `rm ${sq(filePath)}`])
  },

  async renameFile(serial: string, oldPath: string, newName: string): Promise<void> {
    _activeSerial = serial
    const dir = oldPath.substring(0, oldPath.lastIndexOf('/'))
    const newPath = dir + '/' + newName
    await adb(['shell', `mv ${sq(oldPath)} ${sq(newPath)}`])
  },

  async makeDir(serial: string, dirPath: string): Promise<void> {
    _activeSerial = serial
    await adb(['shell', `mkdir -p ${sq(dirPath)}`])
  },

  async getStorage(serial: string): Promise<StorageInfo> {
    _activeSerial = serial
    const out = await adb(['shell', 'df', '-k', '/sdcard'])
    const lines = out.split('\n').filter(l => l.trim() && !l.startsWith('Filesystem'))
    if (!lines.length) throw new Error('Could not read storage')
    const parts = lines[0].trim().split(/\s+/)
    const total = parseInt(parts[1], 10) * 1024
    const used = parseInt(parts[2], 10) * 1024
    const free = parseInt(parts[3], 10) * 1024
    return { total, used, free }
  },
}

export function setActiveSerial(serial: string | null) {
  _activeSerial = serial
}

export function getActiveSerial(): string | null {
  return _activeSerial
}

export function addEjectedSerial(serial: string) {
  _ejectedSerials.add(serial)
}

export function clearEjectedSerials() {
  _ejectedSerials.clear()
}

export function getAdbBinary(): string {
  return adbBin()
}

export function adbCommand(args: string[]): Promise<string> {
  return adb(args)
}

export function adbLongCommand(args: string[], timeout?: number): Promise<string> {
  return adbLong(args, timeout)
}

export function squote(p: string): string {
  return sq(p)
}
