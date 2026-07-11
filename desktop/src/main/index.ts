import { app, BrowserWindow, ipcMain, shell, dialog, Tray, Menu, Notification, nativeImage, screen } from 'electron'
import path from 'path'
import fs from 'fs'
import os from 'os'
import http from 'http'
import crypto from 'crypto'
import { execFile, spawn } from 'child_process'
import type { FileNode, TransferProgress, StorageInfo, BatteryDetail, DeviceDetail, MountInfo, InstalledApp, DuEntry } from '@droidwire/shared'
import { setActiveSerial, getActiveSerial, getAdbBinary, adbCommand, adbLongCommand, squote } from './adb-transport'
import { setConnectionType, getConnectionType, getActiveTransport, listDevices as dmListDevices, setActiveDevice as dmSetActiveDevice, getActiveDevice } from './device-manager'
import type { Transport } from './transport'
import { stopMtpWorker } from './mtp-worker-client'

// Android USB vendor IDs — covers all major manufacturers
const ANDROID_VENDOR_IDS = new Set([
  0x18D1, // Google / Nexus / Pixel
  0x04E8, // Samsung
  0x2717, // Xiaomi
  0x22B8, // Motorola
  0x0BB4, // HTC
  0x12D1, // Huawei
  0x2A70, // OnePlus
  0x1004, // LG
  0x054C, // Sony
  0x04DD, // Sharp
  0x0409, // NEC
  0x0502, // Acer
  0x0B05, // Asus
  0x413C, // Dell
  0x2B4C, // Qiku / 360
  0x1F53, // SK Telesys
  0x19D2, // ZTE
  0x1EBF, // Yulong
])

const isDev = process.env.NODE_ENV === 'development'
let mainWindow: BrowserWindow | null = null

// Mirror all main-process console output to ~/Library/Logs/Droidwire/main.log
// so beta testers can attach something concrete to a bug report (the packaged
// app has no terminal). Logging must never take the app down with it.
function setupFileLog(): void {
  try {
    const dir = app.getPath('logs')
    fs.mkdirSync(dir, { recursive: true })
    const stream = fs.createWriteStream(path.join(dir, 'main.log'), { flags: 'a' })
    const fmt = (a: unknown): string =>
      a instanceof Error ? (a.stack ?? a.message) : typeof a === 'string' ? a : JSON.stringify(a)
    const wrap = (orig: (...args: unknown[]) => void, level: string) =>
      (...args: unknown[]) => {
        orig(...args)
        stream.write(`${new Date().toISOString()} [${level}] ${args.map(fmt).join(' ')}\n`)
      }
    console.log = wrap(console.log.bind(console), 'info')
    console.warn = wrap(console.warn.bind(console), 'warn')
    console.error = wrap(console.error.bind(console), 'error')
    console.log(`Droidwire ${app.getVersion()} starting (packaged=${app.isPackaged})`)
  } catch { /* no log file is better than no app */ }
}
setupFileLog()

// Prevent EAGAIN / transient spawn errors from crashing the whole main process.
// Individual handlers already reject their own promises; this catches anything
// that slips through (e.g. race between error emission and listener attachment).
process.on('uncaughtException', (err) => {
  console.error('[droidwire] uncaught exception (suppressed):', err.message)
})
process.on('unhandledRejection', (reason) => {
  console.error('[droidwire] unhandled rejection (suppressed):', reason)
})

// Delegation wrappers to AdbTransport (centralizes ADB logic)
function adbBin(): string {
  return getAdbBinary()
}

function adb(args: string[]): Promise<string> {
  return adbCommand(args)
}

function adbLong(args: string[], timeout?: number): Promise<string> {
  return adbLongCommand(args, timeout)
}

function sq(p: string): string {
  return squote(p)
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

function adbArgs(args: string[]): string[] {
  const serial = getActiveSerial()
  if (!serial || args[0] === 'devices' || args[0] === '-s') return args
  return ['-s', serial, ...args]
}

function isWirelessSerial(serial: string): boolean {
  return serial.includes(':') || serial.startsWith('adb-') || serial.includes('_adb-tls-connect')
}

function transportRank(serial: string): number {
  if (!isWirelessSerial(serial)) return 0
  return serial.includes(':') && !serial.includes('_adb-tls-connect') ? 1 : 2
}

const _ejectedSerials = new Set<string>()
const _modelCache = new Map<string, string>()
const _hwSerialCache = new Map<string, string>()

// Cross-window drag data store (keyed by source window id)
let _pendingDragNode: FileNode | null = null

function downloadsDir(): string {
  const settingsFile = path.join(app.getPath('userData'), 'settings.json')
  try {
    const s = JSON.parse(fs.readFileSync(settingsFile, 'utf8'))
    if (s.downloadDir && fs.existsSync(s.downloadDir)) return s.downloadDir
  } catch { /* use default */ }
  const dir = path.join(os.homedir(), 'Downloads', 'Droidwire')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

const activeTransfers = new Map<string, ReturnType<typeof spawn>>()
// MTP transfers block synchronously inside the worker process — there's no
// per-call cancel API, so cancelling means killing the worker outright
const activeMtpTransfers = new Set<string>()

function previewDir(): string {
  const dir = path.join(os.tmpdir(), 'droidwire-preview')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

// ---------------------------------------------------------------------------
// Video thumbnails — a local HTTP range server backed by `adb exec-out dd`
// lets ffmpeg seek to the moov atom (which camera MP4s put at the end)
// without pulling the whole file. Typical cost: ~8MB transfer per video.
// ---------------------------------------------------------------------------

function ffmpegBin(): string | null {
  for (const p of ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/usr/bin/ffmpeg']) {
    if (fs.existsSync(p)) return p
  }
  return null
}

let _rangeServer: http.Server | null = null
let _rangePort = 0
const _remoteSizeCache = new Map<string, number>()

function ensureRangeServer(): Promise<number> {
  if (_rangePort) return Promise.resolve(_rangePort)
  return new Promise(resolve => {
    _rangeServer = http.createServer((req, res) => {
      try {
        const url = new URL(req.url ?? '', 'http://localhost')
        const remotePath = url.searchParams.get('p')
        const size = remotePath ? _remoteSizeCache.get(remotePath) : undefined
        if (!remotePath || size === undefined) { res.writeHead(404); res.end(); return }
        let start = 0
        let end = size - 1
        const range = req.headers.range?.match(/bytes=(\d*)-(\d*)/)
        if (range) {
          if (range[1]) start = parseInt(range[1], 10)
          // Cap open-ended reads — ffmpeg probes with them and never needs much
          end = range[2] ? parseInt(range[2], 10) : Math.min(size - 1, start + 4 * 1024 * 1024 - 1)
        }
        const len = end - start + 1
        const BS = 65536
        const blockStart = Math.floor(start / BS)
        let toSkip = start - blockStart * BS
        const blockCount = Math.ceil((toSkip + len) / BS)
        res.writeHead(range ? 206 : 200, {
          'Accept-Ranges': 'bytes',
          'Content-Length': len,
          ...(range ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}),
        })
        const proc = spawn(adbBin(), adbArgs(['exec-out', `dd if=${sq(remotePath)} bs=${BS} skip=${blockStart} count=${blockCount} 2>/dev/null`]))
        let remaining = len
        proc.stdout.on('data', (chunk: Buffer) => {
          let c = chunk
          if (toSkip > 0) {
            if (c.length <= toSkip) { toSkip -= c.length; return }
            c = c.subarray(toSkip)
            toSkip = 0
          }
          if (remaining <= 0) return
          if (c.length > remaining) c = c.subarray(0, remaining)
          remaining -= c.length
          res.write(c)
          if (remaining === 0) { res.end(); proc.kill() }
        })
        proc.on('close', () => { if (remaining > 0) res.end() })
        proc.on('error', () => res.end())
        res.on('close', () => proc.kill())
      } catch { res.end() }
    })
    _rangeServer.listen(0, '127.0.0.1', () => {
      _rangePort = (_rangeServer!.address() as { port: number }).port
      resolve(_rangePort)
    })
  })
}

// ffmpeg concurrency limiter — each extraction spawns its own adb readers
let _ffSlots = 0
const _ffQueue: Array<() => void> = []
function withFfSlot<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const run = () => {
      _ffSlots++
      fn().then(resolve, reject).finally(() => {
        _ffSlots--
        _ffQueue.shift()?.()
      })
    }
    if (_ffSlots < 2) run()
    else _ffQueue.push(run)
  })
}

ipcMain.handle('adb:video-thumb', async (_e, remotePath: string, size: number) => {
  const ff = ffmpegBin()
  if (!ff || !size) return null
  const dir = path.join(os.tmpdir(), 'droidwire-vthumbs')
  fs.mkdirSync(dir, { recursive: true })
  const key = crypto.createHash('md5').update(`${remotePath}:${size}`).digest('hex')
  const out = path.join(dir, `${key}.jpg`)
  if (fs.existsSync(out)) return `data:image/jpeg;base64,${fs.readFileSync(out).toString('base64')}`

  _remoteSizeCache.set(remotePath, size)
  const port = await ensureRangeServer()
  const url = `http://127.0.0.1:${port}/v?p=${encodeURIComponent(remotePath)}`

  return withFfSlot(() => new Promise<string | null>(resolve => {
    const proc = spawn(ff, ['-y', '-v', 'error', '-i', url, '-frames:v', '1', '-vf', 'scale=320:-2', out])
    const timer = setTimeout(() => { proc.kill('SIGKILL'); resolve(null) }, 20_000)
    proc.on('error', () => { clearTimeout(timer); resolve(null) })
    proc.on('close', code => {
      clearTimeout(timer)
      if (code === 0 && fs.existsSync(out)) {
        resolve(`data:image/jpeg;base64,${fs.readFileSync(out).toString('base64')}`)
      } else resolve(null)
    })
  }))
})

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 760,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#111114',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
  return win
}

app.whenReady().then(() => {
  mainWindow = createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow()
  })
  setupUsbAutoOpen()
  setupTray()
  setupAppMenu()
  setupAutoUpdate()
})

function setupUsbAutoOpen(): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { usb } = require('usb') as typeof import('usb')
    usb.on('attach', (device) => {
      if (!ANDROID_VENDOR_IDS.has(device.deviceDescriptor.idVendor)) return
      // Physically replugging a phone is an explicit reconnect request —
      // bring back any individually ejected devices
      _ejectedSerials.clear()
      if (!mainWindow) return
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    })
  } catch {
    // usb native module unavailable — skip auto-open
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ---------------------------------------------------------------------------
// IPC: device
// ---------------------------------------------------------------------------

ipcMain.handle('set-connection-type', async (_e, type: string) => {
  if (type !== 'adb' && type !== 'mtp' && type !== 'wireless') {
    throw new Error(`Invalid connection type: ${type}`)
  }
  setConnectionType(type)
  _remoteSizeCache.clear()
  _modelCache.clear()
  _hwSerialCache.clear()
})

ipcMain.handle('get-connection-type', async () => {
  return getConnectionType()
})

ipcMain.handle('adb:eject-device', async (_e, serial: string) => {
  _ejectedSerials.add(serial)
  if (getActiveSerial() === serial) setActiveSerial(null)
  _remoteSizeCache.clear()
  // Wireless devices have a real session to tear down — disconnect properly
  // so the phone stops showing an active connection
  if (isWirelessSerial(serial)) {
    adbGlobal(['disconnect', serial], 10_000).catch(() => { /* already gone */ })
  }
})

ipcMain.handle('adb:uneject-all', async () => {
  _ejectedSerials.clear()
})

async function listDevices(): Promise<{ devices: { serial: string; state: string; model: string }[]; active: string | null }> {
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

  // Keep the active serial valid: default to the first online device,
  // reset if the active one vanished
  const online = devices.filter(d => d.state === 'device')
  if (!getActiveSerial() || !online.some(d => d.serial === getActiveSerial())) {
    setActiveSerial(online[0]?.serial ?? null)
  }

  // Model names for the switcher UI, cached per serial
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

  // Dedupe: one entry per physical phone. Keep the entry the user is actively
  // using; otherwise prefer the fastest transport.
  const byHw = new Map<string, (typeof online)[number]>()
  for (const d of online) {
    const hw = _hwSerialCache.get(d.serial) ?? d.serial
    const existing = byHw.get(hw)
    if (!existing) { byHw.set(hw, d); continue }
    const keepNew = d.serial === getActiveSerial()
      || (existing.serial !== getActiveSerial() && transportRank(d.serial) < transportRank(existing.serial))
    if (keepNew) byHw.set(hw, d)
  }
  const deduped = online.filter(d => byHw.get(_hwSerialCache.get(d.serial) ?? d.serial) === d)

  return {
    devices: [...deduped, ...devices.filter(d => d.state !== 'device')],
    active: getActiveSerial(),
  }
}

ipcMain.handle('adb:devices', async () => {
  // MTP mode: same response shape as ADB so useDevice polling works unchanged
  if (getConnectionType() === 'mtp') {
    const { devices, active } = await dmListDevices()
    return {
      devices: devices.map(d => ({ serial: d.serial, state: 'device', model: d.name })),
      active: active?.serial ?? null,
    }
  }
  return listDevices()
})

ipcMain.handle('adb:set-device', async (_e, serial: string) => {
  if (getConnectionType() === 'mtp') {
    dmSetActiveDevice(serial)
    return
  }
  setActiveSerial(serial)
  _remoteSizeCache.clear()
})

ipcMain.handle('adb:device-info', async () => {
  if (getConnectionType() === 'mtp') {
    const active = getActiveDevice()
    if (!active) throw new Error('No MTP device selected')
    const info = await getActiveTransport().getDeviceInfo(active.serial)
    return { name: info.model, battery: info.battery }
  }
  const [model, batteryOut] = await Promise.all([
    adb(['shell', 'getprop', 'ro.product.model']),
    adb(['shell', 'dumpsys', 'battery']),
  ])
  const levelMatch = batteryOut.match(/level:\s*(\d+)/)
  return {
    name: model.trim(),
    battery: levelMatch ? parseInt(levelMatch[1], 10) : -1,
  }
})

// ---------------------------------------------------------------------------
// IPC: files
// ---------------------------------------------------------------------------

ipcMain.handle('adb:list-files', async (_e, dirPath: string) => {
  if (getConnectionType() === 'mtp') {
    const active = getActiveDevice()
    if (!active) throw new Error('No MTP device selected')
    return getActiveTransport().listFiles(active.serial, dirPath)
  }
  const out = await adb(['shell', `ls -la --color=never ${sq(dirPath)}`])
  return parseLsLa(out, dirPath)
})

ipcMain.handle('adb:storage', async () => {
  if (getConnectionType() === 'mtp') {
    const active = getActiveDevice()
    if (!active) throw new Error('No MTP device selected')
    return getActiveTransport().getStorage(active.serial)
  }
  const out = await adb(['shell', 'df', '-k', '/sdcard'])
  const lines = out.split('\n').filter(l => l.trim() && !l.startsWith('Filesystem'))
  if (!lines.length) throw new Error('Could not read storage')
  const parts = lines[0].trim().split(/\s+/)
  // df -k columns: Filesystem  1K-blocks  Used  Available  Use%  Mounted
  const total = parseInt(parts[1], 10) * 1024
  const used  = parseInt(parts[2], 10) * 1024
  const free  = parseInt(parts[3], 10) * 1024
  return { total, used, free } as StorageInfo
})

// ---------------------------------------------------------------------------
// IPC: transfers
// ---------------------------------------------------------------------------

ipcMain.handle('adb:pull', async (event, remotePath: string, fileName: string, transferId: string) => {
  const dest = path.join(downloadsDir(), fileName)

  if (getConnectionType() === 'mtp') {
    const active = getActiveDevice()
    if (!active) throw new Error('No MTP device selected')
    activeMtpTransfers.add(transferId)
    let lastTime = Date.now()
    let lastBytes = 0
    try {
      await getActiveTransport().pullFile(active.serial, remotePath, dest, (sent, total) => {
        const now = Date.now()
        const elapsed = (now - lastTime) / 1000
        const speedBps = elapsed > 0 ? (sent - lastBytes) / elapsed : 0
        lastTime = now
        lastBytes = sent
        event.sender.send('transfer-progress', {
          id: transferId, totalBytes: total, transferredBytes: sent, speedBps, status: 'active',
        })
      })
      const size = (() => { try { return fs.statSync(dest).size } catch { return 0 } })()
      event.sender.send('transfer-progress', {
        id: transferId, totalBytes: size, transferredBytes: size, speedBps: 0, status: 'done',
      })
      return dest
    } catch (err) {
      try { fs.unlinkSync(dest) } catch { /* nothing to clean */ }
      const msg = err instanceof Error ? err.message : String(err)
      event.sender.send('transfer-progress', { id: transferId, status: 'error', error: msg })
      throw err
    } finally {
      activeMtpTransfers.delete(transferId)
    }
  }

  // Get remote file size for progress
  let totalBytes = 0
  try {
    const statOut = await adb(['shell', `stat -c '%s' ${sq(remotePath)}`])
    totalBytes = parseInt(statOut.trim(), 10) || 0
  } catch { /* non-critical */ }

  return new Promise<string>((resolve, reject) => {
    const proc = spawn(adbBin(), adbArgs(['pull', remotePath, dest]))
    activeTransfers.set(transferId, proc)
    const startTime = Date.now()
    let lastBytes = 0

    proc.on('error', err => {
      clearInterval(poll)
      activeTransfers.delete(transferId)
      event.sender.send('transfer-progress', { id: transferId, status: 'error', error: err.message })
      reject(err)
    })

    // Poll destination file size for real-time progress
    const poll = setInterval(() => {
      try {
        const { size } = fs.statSync(dest)
        const elapsed = (Date.now() - startTime) / 1000
        const speedBps = elapsed > 0 ? (size - lastBytes) / 0.25 : 0
        lastBytes = size
        const progress: Partial<TransferProgress> & { id: string } = {
          id: transferId, totalBytes, transferredBytes: size, speedBps, status: 'active',
        }
        event.sender.send('transfer-progress', progress)
      } catch { /* file not yet created */ }
    }, 250)

    proc.on('close', code => {
      clearInterval(poll)
      activeTransfers.delete(transferId)
      if (code === 0) {
        const finalSize = (() => { try { return fs.statSync(dest).size } catch { return totalBytes } })()
        event.sender.send('transfer-progress', {
          id: transferId, totalBytes: finalSize, transferredBytes: finalSize, speedBps: 0, status: 'done',
        })
        resolve(dest)
      } else {
        // Remove the partial file a failed/cancelled pull left behind
        try { fs.unlinkSync(dest) } catch { /* nothing to clean */ }
        const errMsg = pullStderr.trim() || 'adb pull failed'
        event.sender.send('transfer-progress', { id: transferId, status: 'error', error: errMsg })
        reject(new Error(errMsg))
      }
    })

    let pullStderr = ''
    proc.stderr.on('data', (d: Buffer) => { pullStderr += d.toString() })
  })
})

ipcMain.handle('adb:push', async (event, localPath: string, remotePath: string, transferId: string) => {
  const totalBytes = (() => { try { return fs.statSync(localPath).size } catch { return 0 } })()

  if (getConnectionType() === 'mtp') {
    const active = getActiveDevice()
    if (!active) throw new Error('No MTP device selected')
    activeMtpTransfers.add(transferId)
    let lastTime = Date.now()
    let lastBytes = 0
    try {
      await getActiveTransport().pushFile(active.serial, localPath, remotePath, (sent, total) => {
        const now = Date.now()
        const elapsed = (now - lastTime) / 1000
        const speedBps = elapsed > 0 ? (sent - lastBytes) / elapsed : 0
        lastTime = now
        lastBytes = sent
        event.sender.send('transfer-progress', {
          id: transferId, totalBytes: total || totalBytes, transferredBytes: sent, speedBps, status: 'active',
        })
      })
      event.sender.send('transfer-progress', {
        id: transferId, totalBytes, transferredBytes: totalBytes, speedBps: 0, status: 'done',
      })
      return
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      event.sender.send('transfer-progress', { id: transferId, status: 'error', error: msg })
      throw err
    } finally {
      activeMtpTransfers.delete(transferId)
    }
  }

  return new Promise<void>((resolve, reject) => {
    const proc = spawn(adbBin(), adbArgs(['push', localPath, remotePath]))
    activeTransfers.set(transferId, proc)
    let lastBytes = 0
    let lastTime = Date.now()

    // adb only prints [ XX%] progress when attached to a TTY, which a spawned
    // process is not — so poll the remote file size instead (mirrors adb:pull).
    let polling = false
    const poll = setInterval(async () => {
      if (polling) return
      polling = true
      try {
        const out = await adb(['shell', `stat -c '%s' ${sq(remotePath)}`])
        const size = parseInt(out.trim(), 10)
        if (!Number.isNaN(size)) {
          const now = Date.now()
          const speedBps = now > lastTime ? (size - lastBytes) / ((now - lastTime) / 1000) : 0
          lastBytes = size
          lastTime = now
          event.sender.send('transfer-progress', {
            id: transferId, totalBytes, transferredBytes: size, speedBps: Math.max(0, speedBps), status: 'active',
          })
        }
      } catch { /* file not yet created on device */ }
      polling = false
    }, 400)

    proc.on('error', err => {
      clearInterval(poll)
      activeTransfers.delete(transferId)
      event.sender.send('transfer-progress', { id: transferId, status: 'error', error: err.message })
      reject(err)
    })

    let stderr = ''
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
    proc.stdout.on('data', () => { /* suppress */ })

    proc.on('close', code => {
      clearInterval(poll)
      activeTransfers.delete(transferId)
      if (code === 0) {
        event.sender.send('transfer-progress', {
          id: transferId, totalBytes, transferredBytes: totalBytes, speedBps: 0, status: 'done',
        })
        resolve()
      } else {
        const errMsg = stderr.trim() || 'adb push failed'
        event.sender.send('transfer-progress', { id: transferId, status: 'error', error: errMsg })
        reject(new Error(errMsg))
      }
    })
  })
})

ipcMain.handle('open-downloads', async () => {
  await shell.openPath(downloadsDir())
})

ipcMain.handle('show-in-finder', async (_e, filePath: string) => {
  shell.showItemInFolder(filePath)
})

ipcMain.handle('adb:preview', async (_e, remotePath: string, fileName: string) => {
  const dest = path.join(previewDir(), fileName)
  try {
    if (getConnectionType() === 'mtp') {
      const active = getActiveDevice()
      if (!active) throw new Error('No MTP device selected')
      await getActiveTransport().pullFile(active.serial, remotePath, dest)
    } else {
      await new Promise<void>((resolve, reject) => {
        const proc = spawn(adbBin(), adbArgs(['pull', remotePath, dest]))
        proc.on('error', reject)
        proc.on('close', code => code === 0 ? resolve() : reject(new Error('pull failed')))
        proc.stderr.on('data', () => {})
      })
    }

    const ext = path.extname(fileName).toLowerCase().replace('.', '')

    // Files unscanned by Android's media store report size 0 over MTP and the
    // device sends 0 bytes on download — an empty data URL renders as a broken
    // image in the grid, so fall back to the generic icon instead
    if (!fs.existsSync(dest) || fs.statSync(dest).size === 0) return null

    // HEIC/HEIF/TIFF: Chromium can't decode these — convert with sips (macOS built-in)
    if (ext === 'heic' || ext === 'heif' || ext === 'tiff' || ext === 'tif') {
      const jpgPath = dest + '.preview.jpg'
      try {
        await new Promise<void>((resolve, reject) => {
          const proc = spawn('sips', ['-s', 'format', 'jpeg', '--resampleHeightWidthMax', '1200', dest, '--out', jpgPath])
          proc.on('error', reject)
          proc.on('close', code => code === 0 ? resolve() : reject(new Error('sips failed')))
          proc.stderr.on('data', () => {})
        })
        if (fs.existsSync(jpgPath) && fs.statSync(jpgPath).size > 0) {
          const buf = fs.readFileSync(jpgPath)
          return `data:image/jpeg;base64,${buf.toString('base64')}`
        }
      } catch { /* sips failed — fall through to generic icon */ }
      return null
    }

    // PDF: generate thumbnail with qlmanage (macOS built-in)
    if (ext === 'pdf') {
      const thumbPath = dest + '.png'
      try {
        await new Promise<void>((resolve, reject) => {
          const proc = spawn('qlmanage', ['-t', '-s', '600', '-o', previewDir(), dest])
          proc.on('error', reject)
          proc.on('close', code => code === 0 ? resolve() : reject(new Error('qlmanage failed')))
          proc.stderr.on('data', () => {})
        })
        if (fs.existsSync(thumbPath)) {
          const buf = fs.readFileSync(thumbPath)
          return `data:image/png;base64,${buf.toString('base64')}`
        }
      } catch { /* qlmanage unavailable */ }
      return null
    }

    const buf = fs.readFileSync(dest)
    const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
      : ext === 'png' ? 'image/png'
      : ext === 'gif' ? 'image/gif'
      : ext === 'webp' ? 'image/webp'
      : ext === 'heic' || ext === 'heif' ? 'image/heic'
      : 'application/octet-stream'
    return `data:${mime};base64,${buf.toString('base64')}`
  } catch {
    return null
  }
})

ipcMain.handle('show-open-dialog', async () => {
  if (!mainWindow) return []
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    title: 'Choose files to upload',
  })
  return result.canceled ? [] : result.filePaths
})

// ---------------------------------------------------------------------------
// IPC: file management
// ---------------------------------------------------------------------------

ipcMain.handle('adb:delete', async (_e, remotePath: string) => {
  if (getConnectionType() === 'mtp') {
    const active = getActiveDevice()
    if (!active) throw new Error('No MTP device selected')
    return getActiveTransport().deleteFile(active.serial, remotePath)
  }
  await adb(['shell', `rm -rf ${sq(remotePath)}`])
})

ipcMain.handle('adb:rename', async (_e, oldPath: string, newPath: string) => {
  if (getConnectionType() === 'mtp') {
    const active = getActiveDevice()
    if (!active) throw new Error('No MTP device selected')
    const newName = newPath.split('/').pop() ?? newPath
    return getActiveTransport().renameFile(active.serial, oldPath, newName)
  }
  await adb(['shell', `mv ${sq(oldPath)} ${sq(newPath)}`])
})

ipcMain.handle('adb:mkdir', async (_e, dirPath: string) => {
  if (getConnectionType() === 'mtp') {
    const active = getActiveDevice()
    if (!active) throw new Error('No MTP device selected')
    return getActiveTransport().makeDir(active.serial, dirPath)
  }
  await adb(['shell', `mkdir -p ${sq(dirPath)}`])
})

ipcMain.handle('adb:copy', async (_e, src: string, dest: string) => {
  if (getConnectionType() === 'mtp') {
    const active = getActiveDevice()
    if (!active) throw new Error('No MTP device selected')
    const transport = getActiveTransport()
    if (!transport.copy) throw new Error('Copy not supported on this transport')
    return transport.copy(active.serial, src, dest)
  }
  await adb(['shell', `cp -r ${sq(src)} ${sq(dest)}`])
})

ipcMain.handle('adb:find', async (_e, dirPath: string, query: string) => {
  if (getConnectionType() === 'mtp') {
    const active = getActiveDevice()
    if (!active) throw new Error('No MTP device selected')
    const transport = getActiveTransport()
    const q = query.toLowerCase()
    const results: FileNode[] = []
    let foldersVisited = 0
    const MAX_RESULTS = 300
    const MAX_FOLDERS = 500
    const MAX_DEPTH = 8

    async function walk(p: string, depth: number): Promise<void> {
      if (results.length >= MAX_RESULTS || foldersVisited >= MAX_FOLDERS || depth > MAX_DEPTH) return
      foldersVisited++
      let entries: FileNode[]
      try {
        entries = await transport.listFiles(active!.serial, p)
      } catch { return }
      for (const entry of entries) {
        if (entry.name.toLowerCase().includes(q)) results.push(entry)
        if (results.length >= MAX_RESULTS) return
        if (entry.type === 'dir') await walk(entry.path, depth + 1)
        if (results.length >= MAX_RESULTS || foldersVisited >= MAX_FOLDERS) return
      }
    }

    await walk(dirPath, 0)
    return results
  }

  const safeQuery = query.replace(/'/g, '')
  const out = await adb([
    'shell',
    `find ${sq(dirPath)} -iname '*${safeQuery}*' -maxdepth 8 -exec stat -c '%n|%F|%s|%Y' '{}' ';' 2>/dev/null`,
  ])
  const results: FileNode[] = []
  for (const line of out.split('\n')) {
    if (!line.trim()) continue
    if (line.includes('Permission denied') || line.includes('No such file')) continue
    const parts = line.split('|')
    if (parts.length < 4) continue
    const [nodePath, rawType, sizeStr, tsStr] = parts
    const isDir = rawType.trim() === 'directory'
    const name = nodePath.split('/').filter(Boolean).pop() ?? nodePath
    results.push({
      name,
      path: nodePath,
      size: isDir ? 0 : parseInt(sizeStr, 10) || 0,
      type: isDir ? 'dir' : 'file',
      mimeType: isDir ? null : guessMime(name),
      modified: (parseInt(tsStr, 10) || 0) * 1000,
    })
    if (results.length >= 300) break
  }
  return results
})

ipcMain.handle('adb:cancel-transfer', async (_e, transferId: string) => {
  const proc = activeTransfers.get(transferId)
  if (proc) {
    try { proc.kill() } catch { /* already dead */ }
    activeTransfers.delete(transferId)
    return
  }
  if (activeMtpTransfers.has(transferId)) {
    // No per-call cancel in luck-node-mtp — the blocking native call only
    // stops if its process dies. The worker's exit handler rejects the
    // in-flight promise, which the pull/push catch block turns into an
    // 'error' transfer-progress event (matching ADB's cancel behavior above).
    stopMtpWorker()
    activeMtpTransfers.delete(transferId)
  }
})

// ---------------------------------------------------------------------------
// Open & edit round-trip: pull the file to a temp dir, open it in its Mac
// app, watch for saves, push changes back to the phone automatically.
// ---------------------------------------------------------------------------

interface EditSession {
  localPath: string
  remotePath: string
  serial: string | null      // pin to the device the file came from
  // Transport the file was pulled over; null means plain adb (spawn path).
  // Pinned at open time so a later connection-type switch doesn't reroute
  // the sync-back to a transport that never saw this device.
  transport: Transport | null
  lastMtimeMs: number
  pushing: boolean
  pendingTimer: ReturnType<typeof setTimeout> | null
  watcher: fs.FSWatcher
}

const _editSessions = new Map<string, EditSession>()

function sendEditEvent(payload: { type: 'opened' | 'synced' | 'failed'; fileName: string; error?: string }) {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('edit-event', payload)
  }
}

function pushEditSession(session: EditSession, fileName: string) {
  let st: fs.Stats
  try { st = fs.statSync(session.localPath) } catch { return }
  if (st.mtimeMs <= session.lastMtimeMs || session.pushing) return
  session.pushing = true
  if (session.transport && session.serial) {
    session.transport.pushFile(session.serial, session.localPath, session.remotePath)
      .then(() => {
        session.lastMtimeMs = st.mtimeMs
        sendEditEvent({ type: 'synced', fileName })
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'push failed — is the device connected?'
        sendEditEvent({ type: 'failed', fileName, error: msg })
      })
      .finally(() => { session.pushing = false })
    return
  }
  const args = session.serial
    ? ['-s', session.serial, 'push', session.localPath, session.remotePath]
    : ['push', session.localPath, session.remotePath]
  const proc = spawn(adbBin(), args)
  proc.on('error', () => {
    session.pushing = false
    sendEditEvent({ type: 'failed', fileName, error: 'adb not available' })
  })
  proc.on('close', code => {
    session.pushing = false
    if (code === 0) {
      session.lastMtimeMs = st.mtimeMs
      sendEditEvent({ type: 'synced', fileName })
    } else {
      sendEditEvent({ type: 'failed', fileName, error: 'push failed — is the device connected?' })
    }
  })
}

ipcMain.handle('edit-open', async (_e, remotePath: string, fileName: string) => {
  const existing = _editSessions.get(remotePath)
  if (existing) {
    await shell.openPath(existing.localPath)
    return
  }

  const dir = path.join(os.tmpdir(), 'droidwire-edit', crypto.createHash('md5').update(remotePath).digest('hex').slice(0, 10))
  fs.mkdirSync(dir, { recursive: true })
  const localPath = path.join(dir, fileName)

  const isMtp = getConnectionType() === 'mtp'
  const mtpDevice = isMtp ? getActiveDevice() : null
  if (isMtp) {
    if (!mtpDevice) throw new Error('No MTP device selected')
    await getActiveTransport().pullFile(mtpDevice.serial, remotePath, localPath)
  } else {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(adbBin(), adbArgs(['pull', remotePath, localPath]))
      proc.on('error', reject)
      proc.on('close', code => code === 0 ? resolve() : reject(new Error('pull failed')))
      proc.stderr.on('data', () => {})
    })
  }

  const session: EditSession = {
    localPath,
    remotePath,
    serial: isMtp ? mtpDevice!.serial : getActiveSerial(),
    transport: isMtp ? getActiveTransport() : null,
    lastMtimeMs: fs.statSync(localPath).mtimeMs,
    pushing: false,
    pendingTimer: null,
    // Watch the directory, not the file — most editors save via
    // write-temp-then-rename, which breaks a direct file watch
    watcher: fs.watch(dir, (_event, changed) => {
      if (changed !== fileName) return
      if (session.pendingTimer) clearTimeout(session.pendingTimer)
      session.pendingTimer = setTimeout(() => pushEditSession(session, fileName), 600)
    }),
  }
  _editSessions.set(remotePath, session)

  const err = await shell.openPath(localPath)
  if (err) {
    session.watcher.close()
    _editSessions.delete(remotePath)
    throw new Error(err)
  }
  sendEditEvent({ type: 'opened', fileName })
})

app.on('will-quit', () => {
  for (const s of _editSessions.values()) {
    s.watcher.close()
    if (s.pendingTimer) clearTimeout(s.pendingTimer)
  }
})

ipcMain.handle('adb:zip-pull', async (event, remoteDirPath: string, folderName: string, transferId: string) => {
  // MTP has no shell, so there's no on-device `zip` to run — instead walk
  // the folder tree, pull every file into a local mirror directory, then
  // zip that mirror with macOS's own `zip` binary (a local-only operation).
  if (getConnectionType() === 'mtp') {
    const active = getActiveDevice()
    if (!active) throw new Error('No MTP device selected')
    const transport = getActiveTransport()
    const mirrorRoot = path.join(os.tmpdir(), `droidwire-zip-${transferId}`)
    fs.mkdirSync(mirrorRoot, { recursive: true })
    activeMtpTransfers.add(transferId)

    try {
      const files: { remotePath: string; localPath: string; size: number }[] = []
      async function collect(remoteDir: string, localDir: string): Promise<void> {
        const entries = await transport.listFiles(active!.serial, remoteDir)
        for (const entry of entries) {
          const localPath = path.join(localDir, entry.name)
          if (entry.type === 'dir') {
            fs.mkdirSync(localPath, { recursive: true })
            await collect(entry.path, localPath)
          } else {
            files.push({ remotePath: entry.path, localPath, size: entry.size })
          }
        }
      }
      await collect(remoteDirPath, mirrorRoot)

      const totalBytes = files.reduce((sum, f) => sum + f.size, 0)
      let transferredBytes = 0
      for (const f of files) {
        fs.mkdirSync(path.dirname(f.localPath), { recursive: true })
        await transport.pullFile(active.serial, f.remotePath, f.localPath, (sent) => {
          event.sender.send('transfer-progress', {
            id: transferId, totalBytes, transferredBytes: transferredBytes + sent, speedBps: 0, status: 'active',
          })
        })
        transferredBytes += f.size
      }

      const dest = path.join(downloadsDir(), `${folderName}.zip`)
      await new Promise<void>((resolve, reject) => {
        const proc = spawn('zip', ['-r', dest, '.'], { cwd: mirrorRoot })
        proc.on('error', reject)
        proc.on('close', code => code === 0 ? resolve() : reject(new Error('local zip failed')))
      })

      const finalSize = (() => { try { return fs.statSync(dest).size } catch { return totalBytes } })()
      event.sender.send('transfer-progress', {
        id: transferId, totalBytes: finalSize, transferredBytes: finalSize, speedBps: 0, status: 'done',
      })
      return dest
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      event.sender.send('transfer-progress', { id: transferId, status: 'error', error: msg })
      throw err
    } finally {
      activeMtpTransfers.delete(transferId)
      fs.rm(mirrorRoot, { recursive: true, force: true }, () => {})
    }
  }

  const remoteZip = '/sdcard/._droidwire_tmp.zip'
  const parent = remoteDirPath.replace(/\/$/, '').replace(/\/[^/]+$/, '') || '/'
  const base = remoteDirPath.replace(/\/$/, '').split('/').filter(Boolean).pop() ?? ''

  await adb(['shell', `cd ${parent} && zip -r ${remoteZip} ${base} 2>/dev/null`])

  const dest = path.join(downloadsDir(), `${folderName}.zip`)

  let totalBytes = 0
  try {
    const statOut = await adb(['shell', 'stat', '-c', '%s', remoteZip])
    totalBytes = parseInt(statOut.trim(), 10) || 0
  } catch { /* non-critical */ }

  const result = await new Promise<string>((resolve, reject) => {
    const proc = spawn(adbBin(), adbArgs(['pull', remoteZip, dest]))
    activeTransfers.set(transferId, proc)
    const startTime = Date.now()
    let lastBytes = 0

    proc.on('error', err => {
      clearInterval(poll)
      activeTransfers.delete(transferId)
      event.sender.send('transfer-progress', { id: transferId, status: 'error', error: err.message })
      reject(err)
    })

    const poll = setInterval(() => {
      try {
        const { size } = fs.statSync(dest)
        const elapsed = (Date.now() - startTime) / 1000
        const speedBps = elapsed > 0 ? (size - lastBytes) / 0.25 : 0
        lastBytes = size
        event.sender.send('transfer-progress', {
          id: transferId, totalBytes, transferredBytes: size, speedBps, status: 'active',
        })
      } catch { /* file not yet created */ }
    }, 250)

    proc.on('close', code => {
      clearInterval(poll)
      activeTransfers.delete(transferId)
      if (code === 0) {
        const finalSize = (() => { try { return fs.statSync(dest).size } catch { return totalBytes } })()
        event.sender.send('transfer-progress', {
          id: transferId, totalBytes: finalSize, transferredBytes: finalSize, speedBps: 0, status: 'done',
        })
        resolve(dest)
      } else {
        event.sender.send('transfer-progress', { id: transferId, status: 'error', error: 'adb pull failed' })
        reject(new Error('adb pull failed'))
      }
    })

    proc.stderr.on('data', () => { /* suppress */ })
  })

  adb(['shell', 'rm', remoteZip]).catch(() => { /* cleanup, non-blocking */ })

  return result
})

ipcMain.handle('adb:install-apk', async (_e, localPath: string) => {
  await new Promise<void>((resolve, reject) => {
    execFile(adbBin(), adbArgs(['install', '-r', localPath]), { timeout: 120000 }, (err, _stdout, stderr) => {
      if (err) reject(new Error(stderr.trim() || err.message))
      else resolve()
    })
  })
})

ipcMain.handle('persist:get', async (_e, key: string) => {
  try {
    const file = path.join(app.getPath('userData'), `${key}.json`)
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
})

ipcMain.handle('persist:set', async (_e, key: string, data: unknown) => {
  const file = path.join(app.getPath('userData'), `${key}.json`)
  fs.writeFileSync(file, JSON.stringify(data))
})

ipcMain.handle('pick-download-dir', async () => {
  if (!mainWindow) return null
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Choose download folder',
  })
  return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
})

ipcMain.handle('get-download-dir', async () => {
  return downloadsDir()
})

ipcMain.handle('set-download-dir', async (_e, dirPath: string) => {
  const file = path.join(app.getPath('userData'), 'settings.json')
  fs.writeFileSync(file, JSON.stringify({ downloadDir: dirPath }))
})

ipcMain.handle('adb:dir-size', async (_e, remotePath: string) => {
  if (getConnectionType() === 'mtp') {
    // FileGrid calls this automatically for every visible folder row. ADB's
    // `du` is a single fast on-device command; MTP has no equivalent — the
    // only option is a recursive listFiles() walk, and since the MTP worker
    // processes one synchronous native call at a time, a handful of visible
    // folders queuing walks would starve real user actions (mkdir/rename/
    // delete) behind them for however long the walks take. Not worth it for
    // a cosmetic size column — always show nothing, matching an untimed ADB
    // du that "shows nothing" per the comment below.
    return null
  }
  try {
    const out = await adb(['shell', `du -sk ${sq(remotePath)}`])
    const kb = parseInt(out.trim().split(/\s+/)[0], 10)
    return Number.isNaN(kb) ? null : kb * 1024
  } catch { return null } // huge trees can exceed the adb timeout — show nothing
})

ipcMain.handle('local-conflict-check', async (_e, fileName: string) => {
  const dir = downloadsDir()
  if (!fs.existsSync(path.join(dir, fileName))) return { exists: false, uniqueName: fileName }
  const dot = fileName.lastIndexOf('.')
  const namePart = dot > 0 ? fileName.slice(0, dot) : fileName
  const extPart = dot > 0 ? fileName.slice(dot) : ''
  let n = 1
  while (fs.existsSync(path.join(dir, `${namePart} (${n})${extPart}`))) n++
  return { exists: true, uniqueName: `${namePart} (${n})${extPart}` }
})

ipcMain.handle('adb:stat', async (_e, remotePath: string) => {
  if (getConnectionType() === 'mtp') {
    const active = getActiveDevice()
    if (!active) return null
    const transport = getActiveTransport()
    if (!transport.statObject) return null
    try {
      // MTP objects carry no Unix permission bits — only what libmtp exposes
      const modified = await transport.statObject(active.serial, remotePath)
      return { permissions: null, octal: null, modified }
    } catch {
      return null
    }
  }
  try {
    const out = await adb(['shell', `stat ${sq(remotePath)}`])
    const permsMatch = out.match(/Access:\s*\((\d+)\/([^)]+)\)/)
    const modifyMatch = out.match(/Modify:\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/)
    return {
      permissions: permsMatch ? permsMatch[2].trim() : null,
      octal: permsMatch ? permsMatch[1] : null,
      modified: modifyMatch ? modifyMatch[1] : null,
      raw: out,
    }
  } catch {
    return null
  }
})

ipcMain.handle('set-title', (_e, title: string) => {
  if (mainWindow) mainWindow.setTitle(title)
})

ipcMain.handle('new-window', () => {
  createWindow()
})

ipcMain.handle('read-local-file', async (_e, localPath: string) => {
  try {
    const content = await fs.promises.readFile(localPath, 'utf8')
    return content
  } catch {
    return null
  }
})

ipcMain.handle('adb:start-drag', async (event, dragFiles: { remotePath: string; fileName: string }[]) => {
  if (dragFiles.length === 0) return
  const tmpDir = path.join(os.tmpdir(), 'droidwire-drag')
  await fs.promises.mkdir(tmpDir, { recursive: true })
  const localPaths: string[] = []
  const mtp = getConnectionType() === 'mtp'
  const active = mtp ? getActiveDevice() : null
  if (mtp && !active) throw new Error('No MTP device selected')
  for (const f of dragFiles) {
    const localPath = path.join(tmpDir, f.fileName)
    if (mtp) await getActiveTransport().pullFile(active!.serial, f.remotePath, localPath)
    else await adb(['pull', f.remotePath, localPath])
    localPaths.push(localPath)
  }
  event.sender.startDrag({
    file: localPaths[0],
    files: localPaths,
    icon: path.join(__dirname, '../../resources/icon.png'),
  })
})

ipcMain.handle('drag:store', (_e, node: unknown) => {
  _pendingDragNode = node as FileNode
})

ipcMain.handle('drag:retrieve', () => {
  const data = _pendingDragNode
  _pendingDragNode = null
  return data
})

ipcMain.handle('delete-local-file', async (_e, localPath: string) => {
  await fs.promises.unlink(localPath)
})

// ---------------------------------------------------------------------------
// IPC: device tools — battery/device/storage detail, app list + APK export
// ---------------------------------------------------------------------------

const BATTERY_STATUS: Record<string, string> = {
  '1': 'Unknown', '2': 'Charging', '3': 'Discharging', '4': 'Not charging', '5': 'Full',
}
const BATTERY_HEALTH: Record<string, string> = {
  '1': 'Unknown', '2': 'Good', '3': 'Overheat', '4': 'Dead',
  '5': 'Over voltage', '6': 'Failure', '7': 'Cold',
}

ipcMain.handle('adb:battery-detail', async (): Promise<BatteryDetail> => {
  const out = await adb(['shell', 'dumpsys', 'battery'])
  const grab = (re: RegExp) => out.match(re)?.[1]?.trim() ?? null
  const level = parseInt(grab(/level:\s*(\d+)/) ?? '', 10)
  const temp = grab(/temperature:\s*(-?\d+)/)
  let voltageMv: number | null = null
  const volt = grab(/voltage:\s*(\d+)/)
  if (volt) {
    voltageMv = parseInt(volt, 10)
    // Some devices (e.g. Pixels) report microvolts — normalize to mV
    if (voltageMv > 100_000) voltageMv = Math.round(voltageMv / 1000)
  }
  const ac = /AC powered:\s*true/.test(out)
  const usb = /USB powered:\s*true/.test(out)
  const wireless = /Wireless powered:\s*true/.test(out)
  return {
    level: Number.isNaN(level) ? -1 : level,
    status: BATTERY_STATUS[grab(/status:\s*(\d+)/) ?? ''] ?? 'Unknown',
    health: BATTERY_HEALTH[grab(/health:\s*(\d+)/) ?? ''] ?? 'Unknown',
    temperatureC: temp ? parseInt(temp, 10) / 10 : null,
    voltageMv,
    technology: grab(/technology:\s*(.+)/),
    powerSource: ac ? 'AC' : wireless ? 'Wireless' : usb ? 'USB' : 'Battery',
  }
})

ipcMain.handle('adb:device-detail', async (): Promise<DeviceDetail> => {
  const out = await adb(['shell', 'getprop'])
  const prop = (key: string) =>
    out.match(new RegExp(`\\[${key.replace(/\./g, '\\.')}\\]:\\s*\\[([^\\]]*)\\]`))?.[1] ?? ''
  return {
    model: prop('ro.product.model'),
    manufacturer: prop('ro.product.manufacturer'),
    androidVersion: prop('ro.build.version.release'),
    sdk: prop('ro.build.version.sdk'),
    buildId: prop('ro.build.id'),
    serial: getActiveSerial() ?? '',
  }
})

ipcMain.handle('adb:storage-detail', async (): Promise<MountInfo[]> => {
  const out = await adb(['shell', 'df', '-k', '/sdcard', '/data', '/system'])
  const mounts: MountInfo[] = []
  const seen = new Set<string>()
  for (const line of out.split('\n')) {
    const parts = line.trim().split(/\s+/)
    if (parts.length < 6 || parts[0] === 'Filesystem') continue
    const total = parseInt(parts[1], 10) * 1024
    const used = parseInt(parts[2], 10) * 1024
    const free = parseInt(parts[3], 10) * 1024
    const mount = parts[parts.length - 1]
    if (Number.isNaN(total) || total <= 0 || seen.has(mount)) continue
    seen.add(mount)
    mounts.push({ mount, total, used, free })
  }
  return mounts
})

ipcMain.handle('adb:list-apps', async (_e, includeSystem: boolean): Promise<InstalledApp[]> => {
  const args = ['shell', 'pm', 'list', 'packages', '-f']
  if (!includeSystem) args.push('-3')
  const out = await adbLong(args, 30_000)
  const apps: InstalledApp[] = []
  for (const line of out.split('\n')) {
    const m = line.trim().match(/^package:(.+)=([^=]+)$/)
    if (!m) continue
    apps.push({ apkPath: m[1], pkg: m[2] })
  }
  return apps.sort((a, b) => a.pkg.localeCompare(b.pkg))
})

// ---------------------------------------------------------------------------
// IPC: storage analyzer — du one level at a time (renderer drills down)
// ---------------------------------------------------------------------------

// Sums a subtree's size via repeated listFiles() calls — MTP has no `du`
// equivalent. Shared by adb:dir-size and adb:du-children's MTP branches.
async function mtpSubtreeSize(transport: ReturnType<typeof getActiveTransport>, serial: string, dirPath: string, maxFolders = 500): Promise<number> {
  let total = 0
  let foldersVisited = 0
  async function walk(p: string): Promise<void> {
    if (foldersVisited >= maxFolders) return
    foldersVisited++
    let entries: FileNode[]
    try { entries = await transport.listFiles(serial, p) } catch { return }
    for (const entry of entries) {
      if (entry.type === 'dir') await walk(entry.path)
      else total += entry.size
      if (foldersVisited >= maxFolders) return
    }
  }
  await walk(dirPath)
  return total
}

ipcMain.handle('adb:du-children', async (_e, dirPath: string): Promise<{ entries: DuEntry[]; totalBytes: number }> => {
  if (getConnectionType() === 'mtp') {
    const active = getActiveDevice()
    if (!active) return { entries: [], totalBytes: 0 }
    const transport = getActiveTransport()
    const clean = dirPath.replace(/\/$/, '')
    const immediate = await transport.listFiles(active.serial, clean)
    const entries: DuEntry[] = []
    let looseFiles = 0
    for (const node of immediate) {
      if (node.type === 'dir') {
        const bytes = await mtpSubtreeSize(transport, active.serial, node.path)
        entries.push({ name: node.name, path: node.path, bytes, isDir: true })
      } else {
        looseFiles += node.size
      }
    }
    if (looseFiles > 0) {
      entries.push({ name: 'Files in this folder', path: clean, bytes: looseFiles, isDir: false })
    }
    entries.sort((a, b) => b.bytes - a.bytes)
    const totalBytes = entries.reduce((s, e) => s + e.bytes, 0)
    return { entries, totalBytes }
  }

  const clean = dirPath.replace(/\/$/, '')
  const out = await adbLong(['shell', `du -d 1 -k ${sq(clean)} 2>/dev/null`])
  const entries: DuEntry[] = []
  let totalBytes = 0
  for (const line of out.split('\n')) {
    const m = line.match(/^(\d+)\s+(.+)$/)
    if (!m) continue
    const bytes = parseInt(m[1], 10) * 1024
    const p = m[2].trim().replace(/\/$/, '')
    if (p === clean) { totalBytes = bytes; continue }
    const name = p.split('/').filter(Boolean).pop() ?? p
    entries.push({ name, path: p, bytes, isDir: true })
  }
  // du -d 1 only lists directories — the remainder is loose files in this folder
  const childSum = entries.reduce((s, e) => s + e.bytes, 0)
  if (totalBytes > childSum) {
    entries.push({ name: 'Files in this folder', path: clean, bytes: totalBytes - childSum, isDir: false })
  }
  entries.sort((a, b) => b.bytes - a.bytes)
  return { entries, totalBytes }
})

// ---------------------------------------------------------------------------
// IPC: wireless ADB (Android 11+) — pair & connect are host-global commands,
// so they bypass adbArgs (no -s scoping)
// ---------------------------------------------------------------------------

function adbGlobal(args: string[], timeout: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = execFile(adbBin(), args, { timeout }, (err, stdout, stderr) => {
      if (err) reject(new Error((stderr.trim() || stdout.trim() || err.message)))
      else resolve(stdout + stderr)
    })
    proc.on('error', reject)
  })
}

ipcMain.handle('adb:pair', async (_e, hostPort: string, code: string): Promise<{ ok: boolean; message: string }> => {
  try {
    const out = await adbGlobal(['pair', hostPort.trim(), code.trim()], 30_000)
    const ok = /successfully paired/i.test(out)
    return { ok, message: out.trim() || (ok ? 'Paired' : 'Pairing failed') }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
})

ipcMain.handle('adb:connect', async (_e, hostPort: string): Promise<{ ok: boolean; message: string }> => {
  try {
    const out = await adbGlobal(['connect', hostPort.trim()], 20_000)
    // "connected to x" or "already connected to x" = success; "failed to connect" = not
    const ok = /(^|\s)connected to/i.test(out) && !/failed|cannot|unable/i.test(out)
    return { ok, message: out.trim() || (ok ? 'Connected' : 'Connection failed') }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
})

// ---------------------------------------------------------------------------
// QR pairing (Android Studio flow): show a WIFI:T:ADB QR; the phone scans it
// and advertises _adb-tls-pairing over mDNS; we spot the service, pair with
// the password from the QR, then find _adb-tls-connect and connect.
// ---------------------------------------------------------------------------

type WirelessEvent = { type: 'waiting' | 'pairing' | 'connecting' | 'connected' | 'error'; message?: string }

let _qrSession: { cancelled: boolean } | null = null

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

function mdnsFind(out: string, service: string, needle: string): string | null {
  for (const line of out.split('\n')) {
    if (!line.includes(service) || !line.includes(needle)) continue
    const m = line.trim().match(/(\d+\.\d+\.\d+\.\d+:\d+)\s*$/)
    if (m) return m[1]
  }
  return null
}

async function runQrPairLoop(
  session: { cancelled: boolean },
  name: string,
  password: string,
  sender: Electron.WebContents,
): Promise<void> {
  const send = (payload: WirelessEvent) => {
    if (!session.cancelled && !sender.isDestroyed()) sender.send('wireless-event', payload)
  }
  send({ type: 'waiting' })

  const deadline = Date.now() + 180_000
  while (!session.cancelled && Date.now() < deadline) {
    let out = ''
    try { out = await adbGlobal(['mdns', 'services'], 5000) } catch { /* retry */ }
    const pairAddr = mdnsFind(out, '_adb-tls-pairing', name)
    if (!pairAddr) { await sleep(1500); continue }

    send({ type: 'pairing' })
    try {
      const pairOut = await adbGlobal(['pair', pairAddr, password], 30_000)
      if (!/successfully paired/i.test(pairOut)) throw new Error(pairOut.trim() || 'Pairing failed')
    } catch (e) {
      send({ type: 'error', message: e instanceof Error ? e.message : String(e) })
      return
    }

    // Paired — the phone now advertises its connect port on the same IP
    send({ type: 'connecting' })
    const ip = pairAddr.split(':')[0]
    const connectDeadline = Date.now() + 30_000
    while (!session.cancelled && Date.now() < connectDeadline) {
      let out2 = ''
      try { out2 = await adbGlobal(['mdns', 'services'], 5000) } catch { /* retry */ }
      const connectAddr = mdnsFind(out2, '_adb-tls-connect', ip)
      if (connectAddr) {
        try {
          const conOut = await adbGlobal(['connect', connectAddr], 20_000)
          if (/(^|\s)connected to/i.test(conOut) && !/failed|cannot|unable/i.test(conOut)) {
            send({ type: 'connected' })
          } else {
            throw new Error(conOut.trim() || 'Connection failed')
          }
        } catch (e) {
          send({ type: 'error', message: e instanceof Error ? e.message : String(e) })
        }
        return
      }
      await sleep(1500)
    }
    send({ type: 'error', message: 'Paired, but the connect port never appeared — connect manually with the IP and port from the Wireless debugging screen.' })
    return
  }
  send({ type: 'error', message: 'Timed out waiting for the phone to scan the code.' })
}

ipcMain.handle('adb:qr-pair-start', (event): string => {
  if (_qrSession) _qrSession.cancelled = true
  const session = { cancelled: false }
  _qrSession = session
  const name = `droidwire-${crypto.randomBytes(4).toString('hex')}`
  const password = crypto.randomBytes(6).toString('hex')
  void runQrPairLoop(session, name, password, event.sender)
  return `WIFI:T:ADB;S:${name};P:${password};;`
})

ipcMain.handle('adb:qr-pair-stop', () => {
  if (_qrSession) _qrSession.cancelled = true
  _qrSession = null
})

// ---------------------------------------------------------------------------
// IPC: system notifications (batch-complete etc.)
// ---------------------------------------------------------------------------

ipcMain.handle('notify', (_e, title: string, body: string) => {
  if (Notification.isSupported()) {
    new Notification({ title, body, silent: false }).show()
  }
})

ipcMain.handle('show-main-window', () => {
  if (menubarWindow && !menubarWindow.isDestroyed()) menubarWindow.hide()
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createWindow()
  } else {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
  }
  mainWindow.focus()
})

// ---------------------------------------------------------------------------
// Menu bar mode — Tray icon + mini drop-zone window
// ---------------------------------------------------------------------------

let tray: Tray | null = null
let menubarWindow: BrowserWindow | null = null

// Template tray icon drawn as a raw bitmap (no bundled asset needed).
// '#' pixels are opaque black; macOS recolors template images automatically.
const TRAY_GLYPH = [
  '................',
  '....########....',
  '...#........#...',
  '...#........#...',
  '...#..#..#..#...',
  '...#.###.#..#...',
  '...#..#..#..#...',
  '...#..#..#..#...',
  '...#..#.###.#...',
  '...#..#..#..#...',
  '...#........#...',
  '...#........#...',
  '...#...##...#...',
  '...#........#...',
  '....########....',
  '................',
]

function trayImage(): Electron.NativeImage {
  const size = 16
  const make = (scale: number): Buffer => {
    const dim = size * scale
    const buf = Buffer.alloc(dim * dim * 4)
    for (let y = 0; y < dim; y++) {
      for (let x = 0; x < dim; x++) {
        if (TRAY_GLYPH[Math.floor(y / scale)][Math.floor(x / scale)] === '#') {
          buf[(y * dim + x) * 4 + 3] = 255 // BGRA — black pixel, full alpha
        }
      }
    }
    return buf
  }
  const img = nativeImage.createFromBuffer(make(1), { width: size, height: size })
  img.addRepresentation({ scaleFactor: 2, buffer: make(2), width: size * 2, height: size * 2 })
  img.setTemplateImage(true)
  return img
}

function createMenubarWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 320,
    height: 380,
    show: false,
    frame: false,
    resizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hiddenInMissionControl: true,
    // NSPanel behavior: can take key input without activating the app —
    // otherwise clicking the tray raises the main window too
    type: 'panel',
    backgroundColor: '#111114',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  // Follow the user to whatever Space/fullscreen app is active, and float
  // above it — prevents "toggle does nothing" when the window opened on
  // another Space
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.setAlwaysOnTop(true, 'pop-up-menu')
  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'] + '#menubar')
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'), { hash: 'menubar' })
  }
  // No hide-on-blur: dragging files from Finder necessarily blurs this window.
  // It closes via Esc, its X button, or clicking the tray icon again.
  return win
}

ipcMain.handle('hide-window', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.hide()
})

function toggleMenubarWindow(): void {
  if (!menubarWindow || menubarWindow.isDestroyed()) {
    menubarWindow = createMenubarWindow()
  }
  if (menubarWindow.isVisible()) {
    menubarWindow.hide()
    return
  }
  const trayBounds = tray?.getBounds()
  const winBounds = menubarWindow.getBounds()
  if (trayBounds && trayBounds.width > 0) {
    const display = screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y })
    let x = Math.round(trayBounds.x + trayBounds.width / 2 - winBounds.width / 2)
    x = Math.min(Math.max(x, display.workArea.x + 8), display.workArea.x + display.workArea.width - winBounds.width - 8)
    menubarWindow.setPosition(x, trayBounds.y + trayBounds.height + 6)
  }
  menubarWindow.show()
  menubarWindow.focus()
}

function setupTray(): void {
  tray = new Tray(trayImage())
  tray.setToolTip('Droidwire')
  tray.on('click', toggleMenubarWindow)
  tray.on('right-click', toggleMenubarWindow)
}

ipcMain.handle('show-about', () => {
  app.showAboutPanel()
})

ipcMain.handle('app-quit', () => {
  app.quit()
})

// ---------------------------------------------------------------------------
// Auto-update (electron-updater) — silent background check in packaged
// builds; requires a signed build + GitHub release feed to actually update
// ---------------------------------------------------------------------------

function setupAutoUpdate(): void {
  if (!app.isPackaged) return
  import('electron-updater').then(({ autoUpdater }) => {
    autoUpdater.on('error', () => { /* unsigned build or offline — silent */ })
    autoUpdater.checkForUpdatesAndNotify().catch(() => {})
  }).catch(() => { /* updater unavailable */ })
}

async function checkForUpdatesInteractive(): Promise<void> {
  if (!app.isPackaged) {
    dialog.showMessageBox({ type: 'info', message: 'Updates only work in packaged builds.' })
    return
  }
  try {
    const { autoUpdater } = await import('electron-updater')
    const result = await autoUpdater.checkForUpdates()
    const next = result?.updateInfo?.version
    if (next && next !== app.getVersion()) {
      dialog.showMessageBox({
        type: 'info',
        message: `Droidwire ${next} is available`,
        detail: 'Downloading in the background — it installs when you quit the app.',
      })
    } else {
      dialog.showMessageBox({ type: 'info', message: 'Droidwire is up to date.' })
    }
  } catch (e) {
    dialog.showMessageBox({
      type: 'warning',
      message: 'Update check failed',
      detail: e instanceof Error ? e.message : String(e),
    })
  }
}

// ---------------------------------------------------------------------------
// Application menu (macOS menu bar when the app is focused)
// ---------------------------------------------------------------------------

function setupAppMenu(): void {
  app.setAboutPanelOptions({
    applicationName: 'Droidwire',
    applicationVersion: app.getVersion(),
    copyright: 'Android file transfer over USB via ADB',
  })

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'Droidwire',
      submenu: [
        { role: 'about', label: 'About Droidwire' },
        { label: 'Check for Updates…', click: () => { void checkForUpdatesInteractive() } },
        {
          label: 'Show Logs in Finder',
          click: () => { shell.showItemInFolder(path.join(app.getPath('logs'), 'main.log')) },
        },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit', label: 'Quit Droidwire' },
      ],
    },
    {
      label: 'File',
      submenu: [
        // No Cmd+W here — the renderer uses it for closing tabs
        { label: 'New Window', accelerator: 'CmdOrCtrl+N', click: () => { mainWindow = createWindow() } },
        { type: 'separator' },
        {
          label: 'Device Tools',
          accelerator: 'CmdOrCtrl+D',
          click: () => {
            const win = BrowserWindow.getFocusedWindow() ?? mainWindow
            if (win && !win.isDestroyed()) win.webContents.send('menu-action', 'device-tools')
          },
        },
      ],
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
