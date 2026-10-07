import { app } from 'electron'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFile } from 'child_process'
import type { Diagnostics } from '@droidwire/shared'
import { getAdbBinary } from './adb-transport.ts'
import { callMtp } from './mtp-worker-client.ts'
import { adbSource } from './lib/adb-path.ts'
import { ffmpegBin, thumbHelperBin } from './ipc/preview.ts'
import { PRODUCT_VERSION } from './app-info.ts'

// A self-check of the installed app: can the bundled adb run, does the MTP
// addon load with its libraries, are the thumbnail tools present. Used for the
// first-run health banner, the "Copy Diagnostics" menu item (paste it into a
// bug report) and the packaged-app smoke test.

function runVersion(bin: string): Promise<{ version: string | null; error: string | null }> {
  return new Promise(resolve => {
    execFile(bin, ['version'], { timeout: 8000 }, (err, stdout, stderr) => {
      if (err) resolve({ version: null, error: (stderr || err.message).trim().split('\n')[0] })
      else resolve({ version: stdout.trim().split('\n')[0], error: null })
    })
  })
}

export async function collectDiagnostics(): Promise<Diagnostics> {
  const adbPath = getAdbBinary()
  const lookup = { resourcesDir: process.resourcesPath, env: process.env, homeDir: os.homedir(), exists: fs.existsSync }
  const [adb, mtp] = await Promise.all([
    runVersion(adbPath),
    callMtp<{ available: boolean; error: string | null; addon: string | null }>('status', [])
      .catch((e: unknown) => ({ available: false, error: e instanceof Error ? e.message : String(e), addon: null })),
  ])
  return {
    app: {
      version: PRODUCT_VERSION,
      packaged: app.isPackaged,
      electron: process.versions.electron,
      arch: process.arch,
      macos: os.release(),
    },
    adb: { path: adbPath, source: adbSource(adbPath, lookup), version: adb.version, error: adb.error },
    mtp,
    thumbnails: { native: thumbHelperBin(), ffmpeg: ffmpegBin() },
  }
}

export function formatDiagnostics(d: Diagnostics): string {
  return [
    `Droidwire ${d.app.version} (${d.app.packaged ? 'packaged' : 'development'}), Electron ${d.app.electron}, ${d.app.arch}, Darwin ${d.app.macos}`,
    `adb: ${d.adb.version ?? 'NOT RUNNING'} [${d.adb.source}] ${d.adb.path}${d.adb.error ? ` - ${d.adb.error}` : ''}`,
    `mtp: ${d.mtp.available ? 'available' : 'UNAVAILABLE'}${d.mtp.error ? ` - ${d.mtp.error}` : ''}${d.mtp.addon ? ` (${path.basename(d.mtp.addon)})` : ''}`,
    `video thumbnails: native ${d.thumbnails.native ? 'yes' : 'no'}, ffmpeg ${d.thumbnails.ffmpeg ? 'yes' : 'no (optional)'}`,
  ].join('\n')
}
