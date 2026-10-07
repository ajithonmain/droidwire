import { app, BrowserWindow, Tray, nativeImage, screen, session, shell } from 'electron'
import path from 'path'
import fs from 'fs'
import { isAllowedExternalUrl, isAppUrl } from './lib/url.ts'

// Window creation and the renderer security boundary. contextIsolation stays
// on, nodeIntegration off and the renderer sandboxed; on top of that no
// window may navigate away from the app page or open child windows.

export const isDev = process.env.NODE_ENV === 'development'

let mainWindow: BrowserWindow | null = null
let menubarWindow: BrowserWindow | null = null
let tray: Tray | null = null

export function getMainWindow(): BrowserWindow | null { return mainWindow }
export function getMenubarWindow(): BrowserWindow | null { return menubarWindow }

function appPageUrls(): string[] {
  const urls = [`file://${path.join(__dirname, '../renderer/index.html')}`]
  if (isDev && process.env['ELECTRON_RENDERER_URL']) urls.push(process.env['ELECTRON_RENDERER_URL'])
  return urls
}

const webPreferences = (): Electron.WebPreferences => ({
  preload: path.join(__dirname, '../preload/index.js'),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  webSecurity: true,
  allowRunningInsecureContent: false,
})

/** Session-wide and per-webContents hardening. Call once after app ready. */
export function installSecurityPolicy(): void {
  // Droidwire needs no web permissions (camera, geolocation, notifications via the web API, ...)
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
  session.defaultSession.setPermissionCheckHandler(() => false)

  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
      // Never create a child window; a plain https GitHub link goes to the browser
      if (isAllowedExternalUrl(url)) void shell.openExternal(url)
      return { action: 'deny' }
    })
    contents.on('will-navigate', (event, url) => {
      if (!isAppUrl(url, appPageUrls())) event.preventDefault()
    })
    contents.on('will-attach-webview', event => event.preventDefault())
  })
}

function loadRenderer(win: BrowserWindow, hash?: string): void {
  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'] + (hash ? `#${hash}` : ''))
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/index.html'), hash ? { hash } : undefined)
  }
}

export function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 760,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#111114',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: webPreferences(),
  })
  loadRenderer(win)
  win.on('closed', () => { if (mainWindow === win) mainWindow = null })
  mainWindow = win
  return win
}

/** The main window, recreated if the user closed it. */
export function ensureMainWindow(): BrowserWindow {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : createWindow()
}

// --- menu bar mode ------------------------------------------------------------------

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
          buf[(y * dim + x) * 4 + 3] = 255 // BGRA - black pixel, full alpha
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
    // NSPanel behavior: can take key input without activating the app -
    // otherwise clicking the tray raises the main window too
    type: 'panel',
    backgroundColor: '#111114',
    webPreferences: webPreferences(),
  })
  // Follow the user to whatever Space/fullscreen app is active, and float
  // above it - prevents "toggle does nothing" when the window opened on
  // another Space
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.setAlwaysOnTop(true, 'pop-up-menu')
  loadRenderer(win, 'menubar')
  // No hide-on-blur: dragging files from Finder necessarily blurs this window.
  // It closes via Esc, its X button, or clicking the tray icon again.
  win.on('closed', () => { if (menubarWindow === win) menubarWindow = null })
  return win
}

function toggleMenubarWindow(): void {
  if (!menubarWindow || menubarWindow.isDestroyed()) menubarWindow = createMenubarWindow()
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

export function setupTray(): void {
  tray = new Tray(trayImage())
  tray.setToolTip('Droidwire')
  tray.on('click', toggleMenubarWindow)
  tray.on('right-click', toggleMenubarWindow)
}

export function hideMenubarWindow(): void {
  if (menubarWindow && !menubarWindow.isDestroyed()) menubarWindow.hide()
}

export function setDevDockIcon(): void {
  // Packaged builds pick up mac.icon from electron-builder automatically;
  // dev runs launch the raw Electron binary, which shows the stock Electron
  // dock icon unless set explicitly.
  if (!isDev) return
  const devIcon = path.join(__dirname, '../../resources/icon.png')
  if (fs.existsSync(devIcon)) app.dock?.setIcon(nativeImage.createFromPath(devIcon))
}


