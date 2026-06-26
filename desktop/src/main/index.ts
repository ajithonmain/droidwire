import { app, BrowserWindow, ipcMain, shell } from 'electron'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { DOWNLOAD_DIR } from '@droidwire/shared'

const isDev = process.env.NODE_ENV === 'development'

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 760,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0A0A0A',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../../dist/index.html'))
  }

  return win
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

ipcMain.handle('download-file', async (_event, url: string, fileName: string) => {
  const dir = path.join(os.homedir(), 'Downloads', 'Droidwire')
  fs.mkdirSync(dir, { recursive: true })
  const dest = path.join(dir, fileName)

  const response = await fetch(url)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const buffer = Buffer.from(await response.arrayBuffer())
  fs.writeFileSync(dest, buffer)

  return dest
})

ipcMain.handle('open-downloads', async () => {
  const dir = path.join(os.homedir(), 'Downloads', 'Droidwire')
  fs.mkdirSync(dir, { recursive: true })
  await shell.openPath(dir)
})
