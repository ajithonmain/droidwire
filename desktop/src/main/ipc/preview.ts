import { spawn, type ChildProcess } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'
import type { PreviewResult } from '@droidwire/shared'
import { handle } from './common.ts'
import { resolveContext, transportFor } from '../device-manager.ts'
import { adbSpawn } from '../adb-transport.ts'
import { assertRemotePath, joinInside, safeFileName } from '../lib/paths.ts'
import { shQuote } from '../lib/shell.ts'
import { previewKind } from '../lib/preview-kind.ts'
import { findFfmpeg } from '../lib/adb-path.ts'
import { buildPreview } from '../preview-build.ts'
import { createStreamServer } from '../stream-server.ts'

// Preview contract (adb:preview -> PreviewResult | null) is documented in
// preview-build.ts. The file is pulled into a private temp directory that is
// deleted before the handler returns, so the renderer never touches a path.
//
// Video thumbnails use the loopback range server in stream-server.ts (see its
// header for the hardening) with ffmpeg reading from it.

const streamServer = createStreamServer({
  spawnReader: (entry, blockSize, blockStart, blockCount) => adbSpawn(entry.serial, [
    'exec-out',
    `dd if=${shQuote(entry.remotePath)} bs=${blockSize} skip=${blockStart} count=${blockCount} 2>/dev/null`,
  ]),
})

// ffmpeg concurrency limiter - each extraction spawns its own adb readers
let ffSlots = 0
const ffQueue: Array<() => void> = []
const ffProcs = new Set<ChildProcess>()
function withFfSlot<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const run = () => {
      ffSlots++
      fn().then(resolve, reject).finally(() => { ffSlots--; ffQueue.shift()?.() })
    }
    if (ffSlots < 2) run()
    else ffQueue.push(run)
  })
}

function ffmpegBin(): string | null {
  return findFfmpeg({ resourcesDir: process.resourcesPath, env: process.env, homeDir: os.homedir(), exists: fs.existsSync })
}

/** Stop the range server and every child it started (called on quit). */
export function shutdownPreview(): void {
  for (const proc of ffProcs) { try { proc.kill() } catch { /* gone */ } }
  ffProcs.clear()
  streamServer.shutdown()
}

export function registerPreviewHandlers(): void {
  handle('adb:preview', async (_e, remotePathRaw, fileNameRaw, ctxRaw): Promise<PreviewResult | null> => {
    const remotePath = assertRemotePath(remotePathRaw)
    const fileName = safeFileName(fileNameRaw)
    if (previewKind(fileName) === 'none') return null
    const ctx = resolveContext(ctxRaw)
    // One private directory per call: previews for same-named files, or the
    // same path on two phones, can never overwrite each other.
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'droidwire-preview-'))
    try {
      const local = joinInside(dir, fileName)
      await transportFor(ctx.transport).pullFile(ctx.serial, remotePath, local)
      return await buildPreview(local, fileName)
    } catch {
      return null
    } finally {
      fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {})
    }
  })

  handle('adb:video-thumb', async (_e, remotePathRaw, sizeRaw, ctxRaw): Promise<string | null> => {
    const remotePath = assertRemotePath(remotePathRaw)
    const size = typeof sizeRaw === 'number' && Number.isFinite(sizeRaw) && sizeRaw > 0 ? Math.floor(sizeRaw) : 0
    const ctx = resolveContext(ctxRaw)
    const ff = ffmpegBin()
    // The range server speaks adb; MTP devices have no adb path to read from
    if (!ff || !size || ctx.transport !== 'adb') return null

    const cacheDir = path.join(os.tmpdir(), 'droidwire-vthumbs')
    fs.mkdirSync(cacheDir, { recursive: true })
    // Device identity is part of the key: the same /sdcard path differs per phone
    const key = crypto.createHash('sha256').update(`${ctx.serial}\0${remotePath}\0${size}`).digest('hex').slice(0, 32)
    const out = path.join(cacheDir, `${key}.jpg`)
    const fromCache = () => `data:image/jpeg;base64,${fs.readFileSync(out).toString('base64')}`
    if (fs.existsSync(out)) return fromCache()

    await streamServer.ensure()
    const url = streamServer.register({ serial: ctx.serial, remotePath, size })

    return withFfSlot(() => new Promise<string | null>(resolve => {
      // The protocol whitelist stops a crafted "video" (e.g. an HLS/concat
      // playlist) from making ffmpeg read local files or other hosts
      const proc = spawn(ff, [
        '-nostdin', '-y', '-v', 'error', '-protocol_whitelist', 'http,tcp',
        '-i', url, '-frames:v', '1', '-vf', 'scale=320:-2', out,
      ])
      ffProcs.add(proc)
      const timer = setTimeout(() => { proc.kill('SIGKILL'); resolve(null) }, 20_000)
      const finish = (value: string | null) => { clearTimeout(timer); ffProcs.delete(proc); resolve(value) }
      proc.on('error', () => finish(null))
      proc.on('close', code => finish(code === 0 && fs.existsSync(out) ? fromCache() : null))
    }))
  })
}
