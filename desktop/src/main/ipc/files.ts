import type { DuEntry, FileNode, StorageInfo } from '@droidwire/shared'
import { handle } from './common.ts'
import {
  activeTransportKind, getActiveContext, getConnectionType, setConnectionType, type ConnectionType,
} from '../active-device.ts'
import {
  ejectDevice, enumerateDevices, resetDeviceCaches, resolveContext, selectDevice, transportFor, uneject,
} from '../device-manager.ts'
import { adbExec, adbHost, adbShell } from '../adb-transport.ts'
import { isWirelessSerial } from '../lib/adb-devices.ts'
import { assertNonEmptyString } from '../lib/ipc-validate.ts'
import { assertRemotePath, posixBase, posixDir } from '../lib/paths.ts'
import { escapeGlob, shQuote } from '../lib/shell.ts'
import { guessMime } from '../lib/mime.ts'
import type { Transport } from '../transport.ts'

// Device selection and everything that browses or manipulates the remote
// file tree. Each handler takes an optional trailing DeviceContext; without
// one it acts on the currently selected device.

const MAX_FIND_RESULTS = 300
const MAX_WALK_FOLDERS = 500
const MAX_WALK_DEPTH = 8

/** Breadth-limited recursive walk for transports without a server-side `find`/`du`. */
async function walk(
  transport: Transport,
  serial: string,
  start: string,
  visit: (node: FileNode) => boolean | void,
  limits: { maxFolders: number; maxDepth: number },
): Promise<void> {
  let folders = 0
  async function recurse(dir: string, depth: number): Promise<boolean> {
    if (folders >= limits.maxFolders || depth > limits.maxDepth) return true
    folders++
    let entries: FileNode[]
    try { entries = await transport.listFiles(serial, dir) } catch { return true }
    for (const entry of entries) {
      if (visit(entry) === false) return false
      if (entry.type === 'dir' && !(await recurse(entry.path, depth + 1))) return false
      if (folders >= limits.maxFolders) return true
    }
    return true
  }
  await recurse(start, 0)
}

async function mtpSubtreeSize(transport: Transport, serial: string, dirPath: string): Promise<number> {
  let total = 0
  await walk(transport, serial, dirPath, n => { if (n.type === 'file') total += n.size }, {
    maxFolders: MAX_WALK_FOLDERS, maxDepth: Infinity,
  })
  return total
}

export function registerFileHandlers(): void {
  // --- connection & device selection ------------------------------------------

  handle('set-connection-type', (_e, type) => {
    if (type !== 'adb' && type !== 'mtp' && type !== 'wireless') throw new Error(`Invalid connection type: ${String(type)}`)
    setConnectionType(type as ConnectionType)
    resetDeviceCaches()
  })

  handle('get-connection-type', () => getConnectionType())

  handle('adb:devices', () => enumerateDevices())

  handle('adb:set-device', (_e, serial) => {
    selectDevice(assertNonEmptyString(serial, 'serial', 256))
  })

  handle('adb:eject-device', (_e, serialRaw) => {
    const serial = assertNonEmptyString(serialRaw, 'serial', 256)
    ejectDevice(serial)
    // Wireless devices have a real session to tear down - disconnect properly
    // so the phone stops showing an active connection
    if (activeTransportKind() === 'adb' && isWirelessSerial(serial)) {
      adbHost(['disconnect', serial], 10_000).catch(() => { /* already gone */ })
    }
  })

  handle('adb:uneject-all', () => uneject())

  handle('adb:device-info', async () => {
    const ctx = getActiveContext()
    if (!ctx) throw new Error('No device selected')
    const info = await transportFor(ctx.transport).getDeviceInfo(ctx.serial)
    return { name: info.model, battery: info.battery }
  })

  // --- browsing ------------------------------------------------------------------

  handle('adb:list-files', async (_e, dirPath, ctxRaw) => {
    const ctx = resolveContext(ctxRaw)
    return transportFor(ctx.transport).listFiles(ctx.serial, assertRemotePath(dirPath))
  })

  handle('adb:storage', async (_e, ctxRaw): Promise<StorageInfo> => {
    const ctx = resolveContext(ctxRaw)
    return transportFor(ctx.transport).getStorage(ctx.serial)
  })

  // --- file management -----------------------------------------------------------

  handle('adb:delete', async (_e, remotePath, ctxRaw) => {
    const ctx = resolveContext(ctxRaw)
    await transportFor(ctx.transport).deleteFile(ctx.serial, assertRemotePath(remotePath))
  })

  // Rename changes the name within the same folder. Cross-folder moves go
  // through adb:move - on MTP a rename only edits the object's name.
  handle('adb:rename', async (_e, oldPath, newPath, ctxRaw) => {
    const ctx = resolveContext(ctxRaw)
    const from = assertRemotePath(oldPath)
    const to = assertRemotePath(newPath)
    if (posixDir(from) !== posixDir(to)) throw new Error('Rename cannot change folders; use move')
    await transportFor(ctx.transport).renameFile(ctx.serial, from, posixBase(to))
  })

  handle('adb:move', async (_e, srcPath, destPath, ctxRaw) => {
    const ctx = resolveContext(ctxRaw)
    await transportFor(ctx.transport).moveFile(ctx.serial, assertRemotePath(srcPath), assertRemotePath(destPath))
  })

  handle('adb:mkdir', async (_e, dirPath, ctxRaw) => {
    const ctx = resolveContext(ctxRaw)
    await transportFor(ctx.transport).makeDir(ctx.serial, assertRemotePath(dirPath))
  })

  handle('adb:copy', async (_e, src, dest, ctxRaw) => {
    const ctx = resolveContext(ctxRaw)
    await transportFor(ctx.transport).copy(ctx.serial, assertRemotePath(src), assertRemotePath(dest))
  })

  // --- search --------------------------------------------------------------------

  handle('adb:find', async (_e, dirPathRaw, queryRaw, ctxRaw): Promise<FileNode[]> => {
    const ctx = resolveContext(ctxRaw)
    const dirPath = assertRemotePath(dirPathRaw)
    const query = assertNonEmptyString(queryRaw, 'query', 256)
    const transport = transportFor(ctx.transport)

    if (ctx.transport === 'mtp') {
      const q = query.toLowerCase()
      const results: FileNode[] = []
      await walk(transport, ctx.serial, dirPath, node => {
        if (node.name.toLowerCase().includes(q)) results.push(node)
        return results.length < MAX_FIND_RESULTS
      }, { maxFolders: MAX_WALK_FOLDERS, maxDepth: MAX_WALK_DEPTH })
      return results
    }

    const pattern = `*${escapeGlob(query)}*`
    const out = await adbShell(
      ctx.serial,
      `find ${shQuote(dirPath)} -maxdepth 8 -iname ${shQuote(pattern)} -exec stat -c '%n|%F|%s|%Y' {} ';' 2>/dev/null`,
      { timeout: 60_000 },
    )
    const results: FileNode[] = []
    for (const line of out.split('\n')) {
      if (!line.trim()) continue
      // The last three fields are fixed-format; the path itself may contain '|'
      const parts = line.split('|')
      if (parts.length < 4) continue
      const tsStr = parts.pop()!
      const sizeStr = parts.pop()!
      const rawType = parts.pop()!
      const nodePath = parts.join('|')
      const isDir = rawType.trim() === 'directory'
      const name = posixBase(nodePath) || nodePath
      results.push({
        name,
        path: nodePath,
        size: isDir ? 0 : parseInt(sizeStr, 10) || 0,
        type: isDir ? 'dir' : 'file',
        mimeType: isDir ? null : guessMime(name),
        modified: (parseInt(tsStr, 10) || 0) * 1000,
      })
      if (results.length >= MAX_FIND_RESULTS) break
    }
    return results
  })

  // --- metadata ------------------------------------------------------------------

  handle('adb:stat', async (_e, remotePath, ctxRaw) => {
    let ctx
    try { ctx = resolveContext(ctxRaw) } catch { return null }
    const target = assertRemotePath(remotePath)
    if (ctx.transport === 'mtp') {
      const transport = transportFor('mtp')
      if (!transport.statObject) return null
      try {
        // MTP objects carry no Unix permission bits - only what libmtp exposes
        return { permissions: null, octal: null, modified: await transport.statObject(ctx.serial, target) }
      } catch {
        return null
      }
    }
    try {
      const out = await adbShell(ctx.serial, `stat ${shQuote(target)}`)
      const permsMatch = out.match(/Access:\s*\((\d+)\/([^)]+)\)/)
      const modifyMatch = out.match(/Modify:\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/)
      return {
        permissions: permsMatch ? permsMatch[2].trim() : null,
        octal: permsMatch ? permsMatch[1] : null,
        modified: modifyMatch ? modifyMatch[1] : null,
      }
    } catch {
      return null
    }
  })

  handle('adb:dir-size', async (_e, remotePath, ctxRaw): Promise<number | null> => {
    const ctx = resolveContext(ctxRaw)
    // FileGrid asks for this for every visible folder row. ADB's `du` is one
    // fast on-device command; MTP has no equivalent and a recursive walk would
    // starve real user actions queued behind it in the single-threaded worker,
    // so MTP always reports "unknown" for this cosmetic column.
    if (ctx.transport === 'mtp') return null
    try {
      const out = await adbShell(ctx.serial, `du -sk ${shQuote(assertRemotePath(remotePath))}`)
      const kb = parseInt(out.trim().split(/\s+/)[0], 10)
      return Number.isNaN(kb) ? null : kb * 1024
    } catch {
      return null // huge trees can exceed the adb timeout - show nothing
    }
  })

  handle('adb:du-children', async (_e, dirPathRaw, ctxRaw): Promise<{ entries: DuEntry[]; totalBytes: number }> => {
    const ctx = resolveContext(ctxRaw)
    const clean = assertRemotePath(dirPathRaw).replace(/\/$/, '') || '/'
    const entries: DuEntry[] = []

    if (ctx.transport === 'mtp') {
      const transport = transportFor('mtp')
      let looseFiles = 0
      for (const node of await transport.listFiles(ctx.serial, clean)) {
        if (node.type === 'dir') {
          entries.push({ name: node.name, path: node.path, bytes: await mtpSubtreeSize(transport, ctx.serial, node.path), isDir: true })
        } else {
          looseFiles += node.size
        }
      }
      if (looseFiles > 0) entries.push({ name: 'Files in this folder', path: clean, bytes: looseFiles, isDir: false })
      entries.sort((a, b) => b.bytes - a.bytes)
      return { entries, totalBytes: entries.reduce((s, e) => s + e.bytes, 0) }
    }

    const out = await adbExec(ctx.serial, ['shell', `du -d 1 -k ${shQuote(clean)} 2>/dev/null`], {
      timeout: 120_000, maxBuffer: 32 * 1024 * 1024,
    })
    let totalBytes = 0
    for (const line of out.split('\n')) {
      const m = line.match(/^(\d+)\s+(.+)$/)
      if (!m) continue
      const bytes = parseInt(m[1], 10) * 1024
      const p = m[2].trim().replace(/\/$/, '')
      if (p === clean) { totalBytes = bytes; continue }
      entries.push({ name: posixBase(p) || p, path: p, bytes, isDir: true })
    }
    // du -d 1 only lists directories - the remainder is loose files in this folder
    const childSum = entries.reduce((s, e) => s + e.bytes, 0)
    if (totalBytes > childSum) entries.push({ name: 'Files in this folder', path: clean, bytes: totalBytes - childSum, isDir: false })
    entries.sort((a, b) => b.bytes - a.bytes)
    return { entries, totalBytes }
  })
}
