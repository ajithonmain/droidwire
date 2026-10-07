import { app, shell } from 'electron'
import fs from 'fs'
import os from 'os'
import path from 'path'
import type { DeviceContext } from '@droidwire/shared'
import { broadcast, handle } from './ipc/common.ts'
import { resolveContext, transportFor } from './device-manager.ts'
import { assertRemotePath, joinInside, safeFileName } from './lib/paths.ts'
import { isOpenableFileName } from './lib/openable.ts'
import { deviceScopedKey, scopedDirName } from './lib/session-keys.ts'

// Open & edit round-trip: pull the file to a temp dir, open it in its Mac
// app, watch for saves, push changes back to the phone automatically.

interface EditSession {
  localPath: string
  remotePath: string
  // Pinned at open time: a later device or connection-mode switch must not
  // redirect the sync-back to a different phone.
  device: DeviceContext
  lastMtimeMs: number
  pushing: boolean
  pendingTimer: ReturnType<typeof setTimeout> | null
  watcher: fs.FSWatcher
}

const sessions = new Map<string, EditSession>()

function sendEditEvent(payload: { type: 'opened' | 'synced' | 'failed'; fileName: string; error?: string }): void {
  broadcast('edit-event', payload)
}

function pushEditSession(session: EditSession, fileName: string): void {
  let st: fs.Stats
  try { st = fs.statSync(session.localPath) } catch { return }
  if (st.mtimeMs <= session.lastMtimeMs || session.pushing) return
  session.pushing = true
  transportFor(session.device.transport)
    .pushFile(session.device.serial, session.localPath, session.remotePath)
    .then(() => {
      session.lastMtimeMs = st.mtimeMs
      sendEditEvent({ type: 'synced', fileName })
    })
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : 'push failed - is the device connected?'
      sendEditEvent({ type: 'failed', fileName, error: msg })
    })
    .finally(() => { session.pushing = false })
}

function closeSession(key: string): void {
  const s = sessions.get(key)
  if (!s) return
  s.watcher.close()
  if (s.pendingTimer) clearTimeout(s.pendingTimer)
  sessions.delete(key)
}

export function registerEditHandlers(): void {
  handle('edit-open', async (_e, remotePathRaw, fileNameRaw, ctxRaw) => {
    const remotePath = assertRemotePath(remotePathRaw)
    const fileName = safeFileName(fileNameRaw)
    if (!isOpenableFileName(fileName)) throw new Error('Droidwire will not open executable file types automatically')
    const device = resolveContext(ctxRaw)

    const key = deviceScopedKey(device, remotePath)
    const existing = sessions.get(key)
    if (existing) {
      await shell.openPath(existing.localPath)
      return
    }

    const dir = path.join(os.tmpdir(), 'droidwire-edit', scopedDirName(device, remotePath))
    fs.mkdirSync(dir, { recursive: true })
    const localPath = joinInside(dir, fileName)
    await transportFor(device.transport).pullFile(device.serial, remotePath, localPath)

    const session: EditSession = {
      localPath,
      remotePath,
      device,
      lastMtimeMs: fs.statSync(localPath).mtimeMs,
      pushing: false,
      pendingTimer: null,
      // Watch the directory, not the file - most editors save via
      // write-temp-then-rename, which breaks a direct file watch
      watcher: fs.watch(dir, (_event, changed) => {
        if (changed !== fileName) return
        if (session.pendingTimer) clearTimeout(session.pendingTimer)
        session.pendingTimer = setTimeout(() => pushEditSession(session, fileName), 600)
      }),
    }
    sessions.set(key, session)

    const err = await shell.openPath(localPath)
    if (err) {
      closeSession(key)
      throw new Error(err)
    }
    sendEditEvent({ type: 'opened', fileName })
  })

  app.on('will-quit', () => {
    for (const key of [...sessions.keys()]) closeSession(key)
  })
}
