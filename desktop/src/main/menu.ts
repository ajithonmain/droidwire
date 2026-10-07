import { app, BrowserWindow, Menu, shell } from 'electron'
import path from 'path'
import { ISSUES_URL, PRODUCT_VERSION, REPO_URL } from './app-info.ts'
import { checkForUpdatesInteractive } from './updates.ts'
import { readSettings, updateSettings } from './settings.ts'
import { updatesEnabled } from './lib/settings-schema.ts'
import { createWindow, ensureMainWindow, getMenubarWindow, isDev } from './windows.ts'
import { broadcast } from './ipc/common.ts'

// Application menu (macOS menu bar when the app is focused)

function targetWindow(): BrowserWindow {
  // Never target the menubar panel - it doesn't render modals
  const focused = BrowserWindow.getFocusedWindow()
  const menubar = getMenubarWindow()
  return focused && focused !== menubar && !focused.isDestroyed() ? focused : ensureMainWindow()
}

function sendMenuAction(action: string): void {
  const win = targetWindow()
  win.show()
  if (win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', () => win.webContents.send('menu-action', action))
  } else {
    win.webContents.send('menu-action', action)
  }
}

export function setupAppMenu(): void {
  app.setAboutPanelOptions({
    applicationName: 'Droidwire',
    applicationVersion: PRODUCT_VERSION,
    version: 'Beta',
    copyright: '© 2026 Ajith M Jose. MIT License.',
    credits: 'Android file management for macOS over ADB, wireless ADB and MTP.\nNo app required on your phone.',
  })

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'Droidwire',
      submenu: [
        { role: 'about', label: 'About Droidwire' },
        { label: 'Check for Updates…', click: () => { void checkForUpdatesInteractive() } },
        {
          label: 'Check for Updates Automatically',
          type: 'checkbox',
          checked: updatesEnabled(readSettings()),
          click: item => { updateSettings({ checkForUpdatesOnLaunch: item.checked }) },
        },
        { label: 'Licenses…', click: () => sendMenuAction('licenses') },
        { type: 'separator' },
        { role: 'hide' },
        { type: 'separator' },
        { role: 'quit', label: 'Quit Droidwire' },
      ],
    },
    {
      label: 'File',
      submenu: [
        // No Cmd+W here - the renderer uses it for closing tabs
        { label: 'New Window', accelerator: 'CmdOrCtrl+N', click: () => { createWindow() } },
        { type: 'separator' },
        {
          label: 'Device Tools',
          accelerator: 'CmdOrCtrl+D',
          click: () => broadcastToFocused('device-tools'),
        },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        ...(isDev
          ? [
              { role: 'reload' } as const,
              { role: 'forceReload' } as const,
              { role: 'toggleDevTools' } as const,
              { type: 'separator' } as const,
            ]
          : []),
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Droidwire on GitHub', click: () => { void shell.openExternal(REPO_URL) } },
        { label: 'Report an Issue…', click: () => { void shell.openExternal(ISSUES_URL) } },
        { type: 'separator' },
        { label: 'Show Logs in Finder', click: () => { shell.showItemInFolder(path.join(app.getPath('logs'), 'main.log')) } },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function broadcastToFocused(action: string): void {
  const win = BrowserWindow.getFocusedWindow() ?? ensureMainWindow()
  if (!win.isDestroyed()) win.webContents.send('menu-action', action)
  else broadcast('menu-action', action)
}
