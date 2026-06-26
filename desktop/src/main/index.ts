import { app, BrowserWindow, ipcMain, shell } from 'electron'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { Readable } from 'stream'
import type { TransferProgress } from '@droidwire/shared'

const isDev = process.env.NODE_ENV === 'development'
let mainWindow: BrowserWindow | null = null

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 760,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0A0A0A',
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
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

function downloadsDir(): string {
  const dir = path.join(os.homedir(), 'Downloads', 'Droidwire')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

ipcMain.handle('download-file', async (event, url: string, fileName: string, transferId: string) => {
  const dest = path.join(downloadsDir(), fileName)
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Device returned HTTP ${response.status}`)
  if (!response.body) throw new Error('No response body')

  const totalBytes = Number(response.headers.get('content-length') ?? 0)
  let transferredBytes = 0
  let lastReportTime = Date.now()
  let lastReportBytes = 0

  const fileStream = fs.createWriteStream(dest)
  const reader = response.body.getReader()

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      fileStream.write(Buffer.from(value))
      transferredBytes += value.length

      const now = Date.now()
      const elapsed = (now - lastReportTime) / 1000
      if (elapsed >= 0.25) {
        const speedBps = (transferredBytes - lastReportBytes) / elapsed
        lastReportTime = now
        lastReportBytes = transferredBytes

        const progress: Partial<TransferProgress> & { id: string } = {
          id: transferId,
          totalBytes,
          transferredBytes,
          speedBps,
          status: 'active',
        }
        event.sender.send('transfer-progress', progress)
      }
    }
  } finally {
    await new Promise<void>((resolve, reject) => {
      fileStream.end((err?: Error | null) => (err ? reject(err) : resolve()))
    })
  }

  const finalProgress: Partial<TransferProgress> & { id: string } = {
    id: transferId,
    totalBytes: transferredBytes,
    transferredBytes,
    speedBps: 0,
    status: 'done',
  }
  event.sender.send('transfer-progress', finalProgress)

  return dest
})

ipcMain.handle('upload-file', async (event, localPath: string, fileName: string, destPath: string, transferId: string) => {
  const stat = fs.statSync(localPath)
  const totalBytes = stat.size

  const progress: Partial<TransferProgress> & { id: string } = {
    id: transferId,
    totalBytes,
    transferredBytes: 0,
    speedBps: 0,
    status: 'active',
  }
  event.sender.send('transfer-progress', progress)

  const fileBuffer = fs.readFileSync(localPath)
  const formData = new FormData()
  formData.append('file', new Blob([fileBuffer]), fileName)

  // destPath comes from renderer — already validated as a path string
  const uploadDest = destPath.endsWith('/') ? destPath : destPath + '/'
  const response = await fetch(
    `${process.env.DROIDWIRE_BASE_URL ?? ''}/upload?path=${encodeURIComponent(uploadDest)}`,
    { method: 'POST', body: formData }
  )
  if (!response.ok) throw new Error(`Upload failed: HTTP ${response.status}`)

  const done: Partial<TransferProgress> & { id: string } = {
    id: transferId,
    totalBytes,
    transferredBytes: totalBytes,
    speedBps: 0,
    status: 'done',
  }
  event.sender.send('transfer-progress', done)
})

ipcMain.handle('open-downloads', async () => {
  await shell.openPath(downloadsDir())
})
