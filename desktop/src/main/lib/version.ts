// Version handling for update checks. Release tags look like "v1.2.1" or
// "v1.3.0-beta.1"; the app reports a bare "1.2.1". Only a strictly higher
// version counts as an update - an older or equal tag must never prompt.

export interface ParsedVersion {
  major: number
  minor: number
  patch: number
  prerelease: string[]
}

export function parseVersion(input: string): ParsedVersion | null {
  const m = input.trim().replace(/^v/i, '').match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/)
  if (!m) return null
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    prerelease: m[4] ? m[4].split('.') : [],
  }
}

function comparePrerelease(a: string[], b: string[]): number {
  // A version without a prerelease tag is higher than one with it
  if (a.length === 0 && b.length === 0) return 0
  if (a.length === 0) return 1
  if (b.length === 0) return -1
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i]
    const y = b[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    const xn = /^\d+$/.test(x)
    const yn = /^\d+$/.test(y)
    if (xn && yn) {
      const d = Number(x) - Number(y)
      if (d !== 0) return d < 0 ? -1 : 1
    } else if (xn !== yn) {
      return xn ? -1 : 1
    } else if (x !== y) {
      return x < y ? -1 : 1
    }
  }
  return 0
}

/** Returns <0, 0, >0, or null when either side is not a parseable version. */
export function compareVersions(a: string, b: string): number | null {
  const pa = parseVersion(a)
  const pb = parseVersion(b)
  if (!pa || !pb) return null
  for (const key of ['major', 'minor', 'patch'] as const) {
    if (pa[key] !== pb[key]) return pa[key] < pb[key] ? -1 : 1
  }
  return comparePrerelease(pa.prerelease, pb.prerelease)
}

/** True only when `candidate` is strictly newer than `current`. Unparseable input is never an update. */
export function isNewerVersion(candidate: string, current: string): boolean {
  const c = compareVersions(candidate, current)
  return c !== null && c > 0
}

/**
 * The newest release tag in a GitHub "list releases" response. Drafts are ignored; prereleases count, because
 * GitHub's /releases/latest endpoint skips them and Droidwire's betas are published as prereleases. Entries
 * without a parseable tag are skipped. Returns null when nothing usable is listed.
 */
export function pickNewestReleaseTag(releases: unknown): string | null {
  if (!Array.isArray(releases)) return null
  let best: string | null = null
  for (const r of releases) {
    if (typeof r !== 'object' || r === null) continue
    const { tag_name: tag, draft } = r as { tag_name?: unknown; draft?: unknown }
    if (draft === true || typeof tag !== 'string' || !parseVersion(tag)) continue
    if (best === null || isNewerVersion(tag, best)) best = tag
  }
  return best
}
