import { app } from 'electron'
import fs from 'node:fs'
import { isMtpExcluded, MTP_EXCLUDED_MESSAGE } from './lib/mtp-excluded.ts'

export { MTP_EXCLUDED_MESSAGE }

/** True when this packaged build deliberately ships without MTP (see scripts/lib/builder-config.ts). */
export function mtpExcluded(): boolean {
  return app.isPackaged && isMtpExcluded(process.resourcesPath, fs.existsSync)
}

export function assertMtpIncluded(): void {
  if (mtpExcluded()) throw new Error(MTP_EXCLUDED_MESSAGE)
}
