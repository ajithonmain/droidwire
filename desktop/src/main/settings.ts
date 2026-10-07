import { app } from 'electron'
import fs from 'fs'
import os from 'os'
import path from 'path'
import type { AppSettings } from '@droidwire/shared'
import { mergeSettings, normalizeSettings } from './lib/settings-schema.ts'
import { assertPersistKey, serializePersisted } from './lib/persist.ts'

function userData(file: string): string {
  return path.join(app.getPath('userData'), file)
}

/** Write via a temp file + rename so a crash mid-write cannot corrupt the document. */
function writeFileAtomic(file: string, data: string): void {
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, data)
  fs.renameSync(tmp, file)
}

export function readSettings(): AppSettings {
  try {
    return normalizeSettings(JSON.parse(fs.readFileSync(userData('settings.json'), 'utf8')))
  } catch {
    return {}
  }
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  const next = mergeSettings(readSettings(), patch)
  writeFileAtomic(userData('settings.json'), JSON.stringify(next))
  return next
}

export function downloadsDir(): string {
  const configured = readSettings().downloadDir
  if (configured && fs.existsSync(configured)) return configured
  const dir = path.join(os.homedir(), 'Downloads', 'Droidwire')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function persistRead(key: unknown): unknown {
  const k = assertPersistKey(key)
  try {
    return JSON.parse(fs.readFileSync(userData(`${k}.json`), 'utf8'))
  } catch {
    return null
  }
}

export function persistWrite(key: unknown, data: unknown): void {
  const k = assertPersistKey(key)
  writeFileAtomic(userData(`${k}.json`), serializePersisted(data))
}
