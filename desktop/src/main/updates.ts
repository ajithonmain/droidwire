import { dialog, shell } from 'electron'
import https from 'https'
import type { UpdateCheckResult } from '@droidwire/shared'
import { PRODUCT_VERSION, RELEASES_REPO, RELEASES_LATEST_URL } from './app-info.ts'
import { isNewerVersion, parseVersion } from './lib/version.ts'
import { readSettings } from './settings.ts'
import { updatesEnabled } from './lib/settings-schema.ts'

// The only outbound network request Droidwire makes on its own: an
// unauthenticated GET of GitHub's "latest release" endpoint for the releases
// repository. It sends no identifiers (just a generic User-Agent) and never
// downloads or installs anything - a newer version is only announced, and the
// user is sent to the GitHub release page. Background checks can be turned
// off in the Droidwire menu; the manual check is always available.

const MAX_BODY_BYTES = 1024 * 1024

export function fetchLatestReleaseTag(): Promise<string | null> {
  // Tests and the smoke driver set this so nothing ever leaves the machine
  if (process.env.DROIDWIRE_OFFLINE === '1') return Promise.resolve(null)
  return new Promise(resolve => {
    const req = https.get(
      `https://api.github.com/repos/${RELEASES_REPO}/releases/latest`,
      { headers: { 'User-Agent': 'Droidwire', Accept: 'application/vnd.github+json' }, timeout: 8000 },
      res => {
        if (res.statusCode !== 200) { res.resume(); resolve(null); return }
        let body = ''
        res.setEncoding('utf8')
        res.on('data', chunk => {
          body += chunk
          if (body.length > MAX_BODY_BYTES) { req.destroy(); resolve(null) }
        })
        res.on('end', () => {
          try {
            const tag = JSON.parse(body)?.tag_name
            resolve(typeof tag === 'string' && parseVersion(tag) ? tag : null)
          } catch {
            resolve(null)
          }
        })
      },
    )
    req.on('error', () => resolve(null))
    req.on('timeout', () => { req.destroy(); resolve(null) })
  })
}

export async function checkForUpdates(): Promise<UpdateCheckResult | null> {
  const tag = await fetchLatestReleaseTag()
  if (!tag) return null
  return { currentVersion: PRODUCT_VERSION, latestTag: tag, hasUpdate: isNewerVersion(tag, PRODUCT_VERSION) }
}

/** Launch-time check; honours the user's setting and returns null when disabled. */
export async function checkForUpdatesInBackground(): Promise<UpdateCheckResult | null> {
  if (!updatesEnabled(readSettings())) return null
  return checkForUpdates()
}

export async function checkForUpdatesInteractive(): Promise<void> {
  const result = await checkForUpdates()
  if (!result) {
    void dialog.showMessageBox({
      type: 'warning',
      message: 'Update check failed',
      detail: 'Could not reach GitHub - check your connection and try again.',
    })
    return
  }
  if (!result.hasUpdate) {
    void dialog.showMessageBox({ type: 'info', message: `Droidwire is up to date (${result.currentVersion}).` })
    return
  }
  const latest = result.latestTag.replace(/^v/i, '')
  const { response } = await dialog.showMessageBox({
    type: 'info',
    message: `Droidwire ${latest} is available`,
    detail: `You're on ${result.currentVersion}. Builds are not signed yet, so updates are not automatic - download the new version from GitHub.`,
    buttons: ['Open Download Page', 'Later'],
    defaultId: 0,
  })
  if (response === 0) void shell.openExternal(RELEASES_LATEST_URL)
}
