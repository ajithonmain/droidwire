import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { TransportKind } from '@droidwire/shared'
import { buildRemoteZipCommand, remoteTempZipPath, shQuote } from './lib/shell.ts'
import { moveFile } from './lib/fsx.ts'
import { cancelledError, throwIfAborted } from './transport.ts'

// Download a remote folder as one .zip. The orchestration is separate from the
// I/O it performs (ZipEffects) so cleanup-on-failure/cancel, per-operation
// scratch space and quoting can be tested without a phone.
//
// Three strategies:
//   * ADB, device has `zip`  - archive on the device, pull the single file
//   * ADB, no `zip` (most Android builds) - pull the tree, zip on the Mac
//   * MTP (no shell)         - pull every file into a mirror, zip on the Mac
//
// Guarantees: the final file only appears (atomically) once the archive is
// complete; per-operation names mean concurrent zips never share a path; the
// scratch directory, partial archive and remote temp archive are removed on
// success, failure and cancellation alike.

export interface ZipEffects {
  deviceHasZip(): Promise<boolean>
  /** Run a pre-quoted shell command on the device (abortable). */
  runRemote(command: string): Promise<void>
  pullFile(remotePath: string, localPath: string): Promise<void>
  /** Pull `remoteDir` into `mirrorParent/<basename>`; returns the pulled path. */
  pullTree(remoteDir: string, mirrorParent: string): Promise<string>
  /** MTP: recreate `remoteDir` under `localDir` file by file. */
  mirrorMtp(remoteDir: string, localDir: string): Promise<void>
  localZip(cwd: string, outFile: string, entry: string): Promise<void>
  /** Best-effort removal of the temp archive on the device. */
  removeRemote(command: string): Promise<void>
}

export interface ZipRequest {
  transport: TransportKind
  remoteDir: string
  /** Sanitised single path component, used for the archive's top-level entry. */
  folderName: string
  destZip: string
  operationId: string
  signal: AbortSignal
  /** Where per-operation scratch directories are created. */
  scratchRoot?: string
}

function removeQuietly(p: string): void {
  try { fs.rmSync(p, { recursive: true, force: true }) } catch { /* nothing to clean */ }
}

export async function zipFolder(req: ZipRequest, fx: ZipEffects): Promise<string> {
  const { signal, folderName } = req
  const part = `${req.destZip}.part-${req.operationId}`
  const scratch = fs.mkdtempSync(path.join(req.scratchRoot ?? os.tmpdir(), 'droidwire-zip-'))
  let remoteZip: string | null = null

  const mirrorThenZip = async (fill: (mirror: string) => Promise<void>): Promise<void> => {
    const mirror = path.join(scratch, 'mirror')
    fs.mkdirSync(mirror)
    await fill(mirror)
    throwIfAborted(signal)
    await fx.localZip(mirror, part, folderName)
  }

  try {
    throwIfAborted(signal)
    if (req.transport === 'mtp') {
      await mirrorThenZip(mirror => fx.mirrorMtp(req.remoteDir, path.join(mirror, folderName)))
    } else if (await fx.deviceHasZip()) {
      remoteZip = remoteTempZipPath(req.operationId)
      await fx.runRemote(buildRemoteZipCommand(req.remoteDir, remoteZip))
      throwIfAborted(signal)
      await fx.pullFile(remoteZip, part)
    } else {
      await mirrorThenZip(async mirror => {
        const pulled = await fx.pullTree(req.remoteDir, mirror)
        // The pulled folder keeps the remote basename; the archive entry uses folderName
        if (path.basename(pulled) !== folderName) fs.renameSync(pulled, path.join(mirror, folderName))
      })
    }
    throwIfAborted(signal)
    if (!fs.existsSync(part)) throw new Error('Archive was not created')
    await moveFile(part, req.destZip)
    return req.destZip
  } catch (err) {
    throw signal.aborted && !(err instanceof Error && err.message === cancelledError().message) ? cancelledError() : err
  } finally {
    removeQuietly(part)
    removeQuietly(scratch)
    if (remoteZip) await fx.removeRemote(`rm -f ${shQuote(remoteZip)}`).catch(() => { /* gone or unplugged */ })
  }
}
