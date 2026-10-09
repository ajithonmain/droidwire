import { app, BrowserWindow } from 'electron'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { PRODUCT_VERSION } from './app-info.ts'
import { cancelAllOperations } from './operations.ts'
import { registerFileHandlers } from './ipc/files.ts'
import { registerTransferHandlers } from './ipc/transfers.ts'
import { registerPreviewHandlers, shutdownPreview } from './ipc/preview.ts'
import { registerDeviceToolHandlers } from './ipc/device-tools.ts'
import { registerWirelessHandlers, stopQrPairing } from './ipc/wireless.ts'
import { stopWirelessReconnect } from './wireless-reconnect.ts'
import { registerAppHandlers } from './ipc/app.ts'
import { registerEditHandlers } from './edit-sessions.ts'
import { clearEjectedSerials } from './adb-transport.ts'
import { createWindow, getMainWindow, installSecurityPolicy, setDevDockIcon, setupTray } from './windows.ts'
import { setupAppMenu } from './menu.ts'
import { removeStaleDirs } from './lib/fsx.ts'
import { collectDiagnostics, formatDiagnostics } from './diagnostics.ts'

// Android USB vendor IDs - covers all major manufacturers
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

const MAX_LOG_BYTES = 5 * 1024 * 1024

// Mirror main-process console output to ~/Library/Logs/Droidwire/main.log so a
// bug report can attach something concrete (the packaged app has no
// terminal). The log can contain device file names and paths; it never leaves
// the machine unless the user attaches it. Logging must never take the app down.
function setupFileLog(): void {
  try {
    const dir = app.getPath('logs')
    fs.mkdirSync(dir, { recursive: true })
    const file = path.join(dir, 'main.log')
    // Keep one previous log instead of growing forever
    if (fs.existsSync(file) && fs.statSync(file).size > MAX_LOG_BYTES) fs.renameSync(file, `${file}.1`)
    const stream = fs.createWriteStream(file, { flags: 'a' })
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
    console.log(`Droidwire ${PRODUCT_VERSION} starting (packaged=${app.isPackaged}, electron=${process.versions.electron}, arch=${process.arch})`)
  } catch { /* no log file is better than no app */ }
}
setupFileLog()

// Prevent EAGAIN / transient spawn errors from crashing the whole main process.
// Individual handlers reject their own promises; this catches anything that
// slips through (e.g. race between error emission and listener attachment).
process.on('uncaughtException', err => {
  console.error('[droidwire] uncaught exception (suppressed):', err)
})
process.on('unhandledRejection', reason => {
  console.error('[droidwire] unhandled rejection (suppressed):', reason)
})

registerFileHandlers()
registerTransferHandlers()
registerPreviewHandlers()
registerDeviceToolHandlers()
registerWirelessHandlers()
registerAppHandlers()
registerEditHandlers()

interface UsbAttach {
  on(event: 'attach', cb: (device: { deviceDescriptor: { idVendor: number } }) => void): void
}

function setupUsbAutoOpen(): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { usb } = require('usb') as { usb: UsbAttach }
    usb.on('attach', device => {
      if (!ANDROID_VENDOR_IDS.has(device.deviceDescriptor.idVendor)) return
      // Physically replugging a phone is an explicit reconnect request -
      // bring back any individually ejected devices
      clearEjectedSerials()
      const win = getMainWindow()
      if (!win || win.isDestroyed()) return
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
    })
  } catch {
    // usb native module unavailable - skip auto-open
  }
}

/** Temp directories older than a day are leftovers from earlier runs. */
function cleanStaleTemp(): void {
  const day = 24 * 60 * 60 * 1000
  const tmp = os.tmpdir()
  for (const prefix of ['droidwire-preview-', 'droidwire-drag-', 'droidwire-zip-', 'droidwire-push-']) {
    void removeStaleDirs(tmp, prefix, day)
  }
}

app.whenReady().then(() => {
  setDevDockIcon()
  installSecurityPolicy()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
  setupUsbAutoOpen()
  setupTray()
  setupAppMenu()
  cleanStaleTemp()
  // Record what this install can do at the top of every log
  void collectDiagnostics().then(d => console.log(`[diagnostics]\n${formatDiagnostics(d)}`)).catch(() => {})
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Child-process shutdown: in-flight transfers (adb pull/push), the video range
// server with its dd readers, QR pairing and the MTP worker (stopped from
// mtp-worker-client) must not outlive the app.
app.on('before-quit', () => {
  cancelAllOperations()
  stopQrPairing()
  stopWirelessReconnect()
  shutdownPreview()
})
