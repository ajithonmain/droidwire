import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFile, spawn } from 'child_process'
import type { FileNode, TransferProgress, StorageInfo } from '@droidwire/shared'

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

// Prevent EAGAIN / transient spawn errors from crashing the whole main process.
// Individual handlers already reject their own promises; this catches anything
// that slips through (e.g. race between error emission and listener attachment).
process.on('uncaughtException', (err) => {
  console.error('[droidwire] uncaught exception (suppressed):', err.message)
})
process.on('unhandledRejection', (reason) => {
  console.error('[droidwire] unhandled rejection (suppressed):', reason)
})

// ---------------------------------------------------------------------------
// ADB concurrency limiter — prevents EAGAIN on large folders
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// ADB helpers
// ---------------------------------------------------------------------------

function adbBin(): string {
  const bundled = path.join(process.resourcesPath ?? '', 'adb')
  if (fs.existsSync(bundled)) return bundled
  for (const p of ['/opt/homebrew/bin/adb', '/usr/local/bin/adb']) {
    if (fs.existsSync(p)) return p
  }
  return 'adb'
}

function adb(args: string[]): Promise<string> {
  return withAdbSlot(() => new Promise((resolve, reject) => {
    const proc = execFile(adbBin(), args, { timeout: 15000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr.trim() || err.message))
      else resolve(stdout)
    })
    proc.on('error', reject)
  }))
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

function sq(p: string): string {
  return `'${p.replace(/'/g, "'\\''")}'`
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

function previewDir(): string {
  const dir = path.join(os.tmpdir(), 'droidwire-preview')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

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
})

function setupUsbAutoOpen(): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { usb } = require('usb') as typeof import('usb')
    usb.on('attach', (device) => {
      if (!ANDROID_VENDOR_IDS.has(device.deviceDescriptor.idVendor)) return
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

ipcMain.handle('adb:devices', async () => {
  const out = await adb(['devices'])
  return out
    .split('\n')
    .slice(1)
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('*') && l.includes('\t'))
    .map(l => {
      const [serial, state] = l.split('\t')
      return { serial: serial.trim(), state: state.trim() }
    })
})

ipcMain.handle('adb:device-info', async () => {
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
  const out = await adb(['shell', `ls -la --color=never ${sq(dirPath)}`])
  return parseLsLa(out, dirPath)
})

ipcMain.handle('adb:storage', async () => {
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

  // Get remote file size for progress
  let totalBytes = 0
  try {
    const statOut = await adb(['shell', `stat -c '%s' ${sq(remotePath)}`])
    totalBytes = parseInt(statOut.trim(), 10) || 0
  } catch { /* non-critical */ }

  return new Promise<string>((resolve, reject) => {
    const proc = spawn(adbBin(), ['pull', remotePath, dest])
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
        let errMsg = 'adb pull failed'
        proc.stderr.on('data', (d: Buffer) => { errMsg = d.toString().trim() })
        event.sender.send('transfer-progress', { id: transferId, status: 'error', error: errMsg })
        reject(new Error(errMsg))
      }
    })

    proc.stderr.on('data', () => { /* suppress */ })
  })
})

ipcMain.handle('adb:push', async (event, localPath: string, remotePath: string, transferId: string) => {
  const totalBytes = (() => { try { return fs.statSync(localPath).size } catch { return 0 } })()

  return new Promise<void>((resolve, reject) => {
    const proc = spawn(adbBin(), ['push', localPath, remotePath])
    const startTime = Date.now()

    proc.on('error', err => {
      event.sender.send('transfer-progress', { id: transferId, status: 'error', error: err.message })
      reject(err)
    })

    // Parse [ XX%] lines from adb stderr for progress
    let stderr = ''
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
      const match = stderr.match(/\[\s*(\d+)%\]/)
      if (match) {
        const pct = parseInt(match[1], 10)
        const transferredBytes = Math.round(totalBytes * pct / 100)
        const elapsed = (Date.now() - startTime) / 1000
        const speedBps = elapsed > 0 ? transferredBytes / elapsed : 0
        event.sender.send('transfer-progress', {
          id: transferId, totalBytes, transferredBytes, speedBps, status: 'active',
        })
      }
    })

    proc.stdout.on('data', () => { /* suppress */ })

    proc.on('close', code => {
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
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(adbBin(), ['pull', remotePath, dest])
      proc.on('error', reject)
      proc.on('close', code => code === 0 ? resolve() : reject(new Error('pull failed')))
      proc.stderr.on('data', () => {})
    })

    const ext = path.extname(fileName).toLowerCase().replace('.', '')

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
  await adb(['shell', `rm -rf ${sq(remotePath)}`])
})

ipcMain.handle('adb:rename', async (_e, oldPath: string, newPath: string) => {
  await adb(['shell', `mv ${sq(oldPath)} ${sq(newPath)}`])
})

ipcMain.handle('adb:mkdir', async (_e, dirPath: string) => {
  await adb(['shell', `mkdir -p ${sq(dirPath)}`])
})

ipcMain.handle('adb:copy', async (_e, src: string, dest: string) => {
  await adb(['shell', `cp -r ${sq(src)} ${sq(dest)}`])
})

ipcMain.handle('adb:find', async (_e, dirPath: string, query: string) => {
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
  }
})

ipcMain.handle('adb:screenshot', async () => {
  const dest = path.join(downloadsDir(), `screenshot-${Date.now()}.png`)
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(adbBin(), ['exec-out', 'screencap', '-p'])
    const out = fs.createWriteStream(dest)
    proc.stdout.pipe(out)
    proc.stderr.on('data', () => { /* suppress */ })
    proc.on('error', err => reject(err))
    out.on('finish', () => resolve())
    out.on('error', err => reject(err))
    proc.on('close', code => {
      if (code !== 0) reject(new Error('screencap failed'))
    })
  })
  return dest
})

ipcMain.handle('adb:zip-pull', async (event, remoteDirPath: string, folderName: string, transferId: string) => {
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
    const proc = spawn(adbBin(), ['pull', remoteZip, dest])
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
    execFile(adbBin(), ['install', '-r', localPath], { timeout: 120000 }, (err, _stdout, stderr) => {
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

ipcMain.handle('adb:stat', async (_e, remotePath: string) => {
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

ipcMain.handle('adb:start-drag', async (event, remotePath: string, fileName: string) => {
  const tmpDir = path.join(os.tmpdir(), 'droidwire-drag')
  await fs.promises.mkdir(tmpDir, { recursive: true })
  const localPath = path.join(tmpDir, fileName)
  await adb(['pull', remotePath, localPath])
  event.sender.startDrag({ file: localPath, icon: path.join(__dirname, '../../resources/icon.png') })
  return localPath
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
