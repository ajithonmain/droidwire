import type { AppSettings } from '@droidwire/shared'

/** Read an untrusted settings document, keeping only known, correctly typed fields. */
export function normalizeSettings(raw: unknown): AppSettings {
  const out: AppSettings = {}
  if (raw && typeof raw === 'object') {
    const r = raw as Record<string, unknown>
    if (typeof r.downloadDir === 'string' && r.downloadDir.length > 0) out.downloadDir = r.downloadDir
    if (typeof r.checkForUpdatesOnLaunch === 'boolean') out.checkForUpdatesOnLaunch = r.checkForUpdatesOnLaunch
  }
  return out
}

/** Merge a patch onto the stored settings without clobbering unrelated keys. */
export function mergeSettings(existing: AppSettings, patch: Partial<AppSettings>): AppSettings {
  return normalizeSettings({ ...existing, ...patch })
}

export function updatesEnabled(settings: AppSettings): boolean {
  return settings.checkForUpdatesOnLaunch !== false
}
