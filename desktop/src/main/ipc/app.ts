import { app, BrowserWindow, Notification, shell } from 'electron'
import fs from 'fs'
import path from 'path'
import type { FileNode } from '@droidwire/shared'
import { handle } from './common.ts'
import { downloadsDir, persistRead, persistWrite, updateSettings } from '../settings.ts'
import { checkForUpdatesInBackground } from '../updates.ts'
import { RELEASES_LATEST_URL } from '../app-info.ts'
import { collectDiagnostics } from '../diagnostics.ts'
import { ensureMainWindow, hideMenubarWindow } from '../windows.ts'
import { assertLocalPath } from '../lib/paths.ts'
import { assertString } from '../lib/ipc-validate.ts'

// App-level services: persistence, settings, notifications, window actions,
// update check, licenses and the cross-window drag payload.

/** Packaged builds get bundled files via extraResources; dev runs read the source tree. */
function resourcePath(name: string): string {
  const packaged = path.join(process.resourcesPath ?? '', name)
  if (fs.existsSync(packaged)) return packaged
  return path.join(__dirname, '../../resources', name)
}

// Cross-window drag data (set when a drag starts, read on drop)
let pendingDrag: { nodes: FileNode[]; ts: number } | null = null

function parseDragPayload(raw: unknown): { nodes: FileNode[]; ts: number } | null {
  if (raw === null || raw === undefined) return null
  const r = raw as { nodes?: unknown; ts?: unknown }
  if (!Array.isArray(r.nodes) || r.nodes.length > 2000 || typeof r.ts !== 'number') throw new Error('Invalid drag payload')
  const nodes = r.nodes.map(n => {
    const node = n as Partial<FileNode>
    if (typeof node?.name !== 'string' || typeof node.path !== 'string' || (node.type !== 'file' && node.type !== 'dir')) {
      throw new Error('Invalid drag node')
    }
    return node as FileNode
  })
  return { nodes, ts: r.ts }
}

export function registerAppHandlers(): void {
  handle('persist:get', (_e, key) => persistRead(key))
  handle('persist:set', (_e, key, data) => { persistWrite(key, data) })

  handle('get-download-dir', () => downloadsDir())
  handle('set-download-dir', (_e, dirPath) => {
    const dir = assertLocalPath(dirPath)
    if (!fs.statSync(dir).isDirectory()) throw new Error('Not a folder')
    updateSettings({ downloadDir: dir })
  })

  handle('notify', (_e, title, body) => {
    if (Notification.isSupported()) {
      new Notification({ title: assertString(title, 'title', 200), body: assertString(body, 'body', 500), silent: false }).show()
    }
  })

  handle('set-title', (event, title) => {
    BrowserWindow.fromWebContents(event.sender)?.setTitle(assertString(title, 'title', 200))
  })

  handle('new-window', () => { ensureMainWindow() })

  handle('hide-window', event => { BrowserWindow.fromWebContents(event.sender)?.hide() })

  handle('show-main-window', () => {
    hideMenubarWindow()
    const win = ensureMainWindow()
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
    // The menubar popup is a non-activating panel, so a click inside it never
    // makes Droidwire the active app - without stealing focus here the menu
    // bar keeps showing the previous app's menus
    app.focus({ steal: true })
  })

  handle('show-about', () => { app.showAboutPanel() })
  handle('app-quit', () => { app.quit() })
  handle('get-licenses', () => fs.readFileSync(resourcePath('THIRD-PARTY-NOTICES.md'), 'utf8'))

  handle('app:diagnostics', () => collectDiagnostics())
  handle('update:check-silent', () => checkForUpdatesInBackground())
  handle('open-release-page', () => { void shell.openExternal(RELEASES_LATEST_URL) })

  handle('drag:store', (_e, payload) => { pendingDrag = parseDragPayload(payload) })
  handle('drag:retrieve', () => {
    const data = pendingDrag
    pendingDrag = null
    return data
  })
}
