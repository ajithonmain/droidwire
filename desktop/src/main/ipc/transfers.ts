import { dialog, BrowserWindow, shell, type WebContents } from 'electron'
import { spawn } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import type { FileNode } from '@droidwire/shared'
import { handle, safeSend } from './common.ts'
import { resolveContext, transportFor } from '../device-manager.ts'
import { adbExec, adbShell, deviceHasZip, pullTree } from '../adb-transport.ts'
import { beginOperation, cancelOperation, endOperation } from '../operations.ts'
import { downloadsDir } from '../settings.ts'
import { cancelledError, throwIfAborted, type TransferOptions } from '../transport.ts'
import { assertLocalPath, assertRemotePath, joinInside, safeFileName } from '../lib/paths.ts'
import { moveFile } from '../lib/fsx.ts'
import { SpeedMeter } from '../lib/speed.ts'
import { zipFolder } from '../zip-folder.ts'

// Downloads, uploads, folder zips, drag-out, APK install and the local-file
// housekeeping that goes with them. Every long-running handler:
//   * resolves its device from the context the renderer captured at queue time
//   * registers an AbortController synchronously (see operations.ts)
//   * writes to a temp name and renames on success, so a failed or cancelled
//     transfer never destroys an existing file of the same name
//   * reports status through safeSend, which tolerates closed windows

const LOCAL_ZIP = '/usr/bin/zip'

// Local files the user chose to "move" to the phone: only those whose upload
// actually completed may later be deleted through delete-local-file. The
// renderer cannot use that channel to remove arbitrary files.
const deletableAfterUpload = new Set<string>()

function reporter(sender: WebContents, id: string, fallbackTotal = 0): NonNullable<TransferOptions['onProgress']> {
  const meter = new SpeedMeter()
  return (sent, total) => safeSend(sender, 'transfer-progress', {
    id, totalBytes: total || fallbackTotal, transferredBytes: sent, speedBps: meter.sample(sent), status: 'active',
  })
}

function reportDone(sender: WebContents, id: string, bytes: number): void {
  safeSend(sender, 'transfer-progress', { id, totalBytes: bytes, transferredBytes: bytes, speedBps: 0, status: 'done' })
}

function reportError(sender: WebContents, id: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err)
  safeSend(sender, 'transfer-progress', { id, status: 'error', error: message })
}

function fileSize(p: string): number {
  try { return fs.statSync(p).size } catch { return 0 }
}

function removeQuietly(p: string): void {
  try { fs.rmSync(p, { recursive: true, force: true }) } catch { /* nothing to clean */ }
}

// --- folder zip ------------------------------------------------------------------

function runLocalZip(cwd: string, outFile: string, entry: string, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(cancelledError()); return }
    const proc = spawn(LOCAL_ZIP, ['-r', '-q', '-y', outFile, entry], { cwd, signal })
    let stderr = ''
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString() })
    proc.on('error', err => reject(signal.aborted ? cancelledError() : err))
    proc.on('close', code => code === 0 ? resolve() : reject(new Error(stderr.trim() || `zip failed (exit ${code})`)))
  })
}

/** MTP has no shell: pull every file into a local mirror, then zip that. */
async function mirrorMtpFolder(
  serial: string,
  remoteDir: string,
  localDir: string,
  signal: AbortSignal,
  onProgress: NonNullable<TransferOptions['onProgress']>,
): Promise<void> {
  const transport = transportFor('mtp')
  const files: { remotePath: string; localPath: string; size: number }[] = []
  async function collect(remote: string, local: string): Promise<void> {
    throwIfAborted(signal)
    fs.mkdirSync(local, { recursive: true })
    const entries: FileNode[] = await transport.listFiles(serial, remote)
    for (const entry of entries) {
      const target = joinInside(local, entry.name)
      if (entry.type === 'dir') await collect(entry.path, target)
      else files.push({ remotePath: entry.path, localPath: target, size: entry.size })
    }
  }
  await collect(remoteDir, localDir)

  const total = files.reduce((sum, f) => sum + f.size, 0)
  let done = 0
  for (const f of files) {
    throwIfAborted(signal)
    await transport.pullFile(serial, f.remotePath, f.localPath, {
      signal,
      onProgress: sent => onProgress(done + sent, total),
    })
    done += f.size
  }
}

// --- handlers --------------------------------------------------------------------

export function registerTransferHandlers(): void {
  handle('adb:pull', async (event, remotePathRaw, fileNameRaw, transferIdRaw, ctxRaw) => {
    const { id, signal } = beginOperation(transferIdRaw)
    const sender = event.sender
    let part = ''
    try {
      const remotePath = assertRemotePath(remotePathRaw)
      const ctx = resolveContext(ctxRaw)
      const dest = joinInside(downloadsDir(), fileNameRaw)
      part = `${dest}.part-${id}`

      await transportFor(ctx.transport).pullFile(ctx.serial, remotePath, part, {
        signal, onProgress: reporter(sender, id),
      })
      await moveFile(part, dest)
      reportDone(sender, id, fileSize(dest))
      return dest
    } catch (err) {
      if (part) removeQuietly(part)
      reportError(sender, id, err)
      throw err
    } finally {
      endOperation(id)
    }
  })

  handle('adb:push', async (event, localPathRaw, remotePathRaw, transferIdRaw, ctxRaw) => {
    const { id, signal } = beginOperation(transferIdRaw)
    const sender = event.sender
    try {
      const localPath = assertLocalPath(localPathRaw)
      const remotePath = assertRemotePath(remotePathRaw)
      const ctx = resolveContext(ctxRaw)
      const totalBytes = fileSize(localPath)

      await transportFor(ctx.transport).pushFile(ctx.serial, localPath, remotePath, {
        signal, onProgress: reporter(sender, id, totalBytes),
      })
      deletableAfterUpload.add(localPath)
      reportDone(sender, id, totalBytes)
    } catch (err) {
      reportError(sender, id, err)
      throw err
    } finally {
      endOperation(id)
    }
  })

  handle('adb:cancel-transfer', (_e, transferId) => {
    cancelOperation(transferId)
  })

  handle('adb:zip-pull', async (event, remoteDirRaw, folderNameRaw, transferIdRaw, ctxRaw) => {
    const { id, signal } = beginOperation(transferIdRaw)
    const sender = event.sender
    try {
      const remoteDir = assertRemotePath(remoteDirRaw)
      const ctx = resolveContext(ctxRaw)
      const folderName = safeFileName(folderNameRaw)
      const onProgress = reporter(sender, id)
      onProgress(0, 0)
      const adb = transportFor('adb')

      const dest = await zipFolder(
        {
          transport: ctx.transport,
          remoteDir,
          folderName,
          destZip: joinInside(downloadsDir(), `${folderName}.zip`),
          operationId: id,
          signal,
        },
        {
          deviceHasZip: () => deviceHasZip(ctx.serial),
          runRemote: async command => { await adbShell(ctx.serial, command, { timeout: 30 * 60_000, signal }) },
          pullFile: (remote, local) => adb.pullFile(ctx.serial, remote, local, { signal, onProgress }),
          pullTree: (dir, parent) => pullTree(ctx.serial, dir, parent, { signal, onProgress }),
          mirrorMtp: (dir, local) => mirrorMtpFolder(ctx.serial, dir, local, signal, onProgress),
          localZip: (cwd, out, entry) => runLocalZip(cwd, out, entry, signal),
          // Deliberately not tied to the (possibly aborted) signal
          removeRemote: async command => { await adbShell(ctx.serial, command, { timeout: 15_000 }) },
        },
      )
      reportDone(sender, id, fileSize(dest))
      return dest
    } catch (err) {
      reportError(sender, id, err)
      throw err
    } finally {
      endOperation(id)
    }
  })

  handle('adb:install-apk', async (_e, localPathRaw, ctxRaw) => {
    const localPath = assertLocalPath(localPathRaw)
    if (!/\.apk$/i.test(localPath) || !fs.statSync(localPath).isFile()) throw new Error('Not an APK file')
    const ctx = resolveContext(ctxRaw)
    if (ctx.transport !== 'adb') throw new Error('APK install needs an ADB connection')
    try {
      await adbExec(ctx.serial, ['install', '-r', localPath], { timeout: 120_000 })
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : String(err))
    }
  })

  // Native drag-out: pull into a private temp directory, then hand the paths to the OS.
  handle('adb:start-drag', async (event, dragFilesRaw, ctxRaw) => {
    if (!Array.isArray(dragFilesRaw) || dragFilesRaw.length === 0 || dragFilesRaw.length > 500) return
    const ctx = resolveContext(ctxRaw)
    const transport = transportFor(ctx.transport)
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'droidwire-drag-'))
    const localPaths: string[] = []
    for (const item of dragFilesRaw as { remotePath?: unknown; fileName?: unknown }[]) {
      const remote = assertRemotePath(item?.remotePath)
      const localPath = joinInside(dir, item?.fileName)
      await transport.pullFile(ctx.serial, remote, localPath)
      localPaths.push(localPath)
    }
    event.sender.startDrag({
      file: localPaths[0],
      files: localPaths,
      icon: path.join(__dirname, '../../resources/icon.png'),
    })
  })

  // --- local housekeeping ----------------------------------------------------------

  handle('open-downloads', async () => {
    await shell.openPath(downloadsDir())
  })

  handle('show-in-finder', (_e, filePath) => {
    const p = assertLocalPath(filePath)
    if (fs.existsSync(p)) shell.showItemInFolder(p)
  })

  handle('local-conflict-check', (_e, fileNameRaw) => {
    const fileName = safeFileName(fileNameRaw)
    const dir = downloadsDir()
    if (!fs.existsSync(path.join(dir, fileName))) return { exists: false, uniqueName: fileName }
    const dot = fileName.lastIndexOf('.')
    const namePart = dot > 0 ? fileName.slice(0, dot) : fileName
    const extPart = dot > 0 ? fileName.slice(dot) : ''
    let n = 1
    while (fs.existsSync(path.join(dir, `${namePart} (${n})${extPart}`))) n++
    return { exists: true, uniqueName: `${namePart} (${n})${extPart}` }
  })

  handle('delete-local-file', async (_e, localPathRaw) => {
    const p = assertLocalPath(localPathRaw)
    if (!deletableAfterUpload.delete(p)) throw new Error('Refusing to delete a file that was not just uploaded')
    await fs.promises.unlink(p)
  })

  handle('show-open-dialog', async event => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options: Electron.OpenDialogOptions = {
      properties: ['openFile', 'multiSelections'],
      title: 'Choose files to upload',
    }
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    return result.canceled ? [] : result.filePaths
  })

  handle('pick-download-dir', async event => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options: Electron.OpenDialogOptions = { properties: ['openDirectory', 'createDirectory'], title: 'Choose download folder' }
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
  })

}
