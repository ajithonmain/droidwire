import path from 'node:path'

export interface BinaryLookup {
  /** Directory holding bundled binaries (Resources/ in a packaged app). */
  resourcesDir?: string
  env: Record<string, string | undefined>
  homeDir: string
  exists: (p: string) => boolean
}

/**
 * Candidate locations for `adb`, in priority order:
 *  1. DROIDWIRE_ADB override
 *  2. the copy bundled into a packaged app
 *  3. Android SDK platform-tools (ANDROID_HOME / ANDROID_SDK_ROOT / default SDK location)
 *  4. Homebrew (Apple Silicon and Intel prefixes)
 * The caller falls back to a bare `adb` (resolved through PATH) if none exist.
 * GUI-launched macOS apps do not inherit the shell PATH, hence the explicit list.
 */
export function adbCandidates(lookup: BinaryLookup): string[] {
  const { env, homeDir, resourcesDir } = lookup
  const list: string[] = []
  if (env.DROIDWIRE_ADB) list.push(env.DROIDWIRE_ADB)
  if (resourcesDir) list.push(path.join(resourcesDir, 'adb'))
  for (const sdk of [env.ANDROID_HOME, env.ANDROID_SDK_ROOT, path.join(homeDir, 'Library', 'Android', 'sdk')]) {
    if (sdk) list.push(path.join(sdk, 'platform-tools', 'adb'))
  }
  list.push('/opt/homebrew/bin/adb', '/usr/local/bin/adb')
  return list
}

export function findAdb(lookup: BinaryLookup): string {
  return adbCandidates(lookup).find(lookup.exists) ?? 'adb'
}

/** ffmpeg is optional (video thumbnails only); null means "not available". */
export function findFfmpeg(lookup: BinaryLookup): string | null {
  const list = [
    ...(lookup.env.DROIDWIRE_FFMPEG ? [lookup.env.DROIDWIRE_FFMPEG] : []),
    ...(lookup.resourcesDir ? [path.join(lookup.resourcesDir, 'ffmpeg')] : []),
    '/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg',
  ]
  return list.find(lookup.exists) ?? null
}

export type BinarySource = 'override' | 'bundled' | 'sdk' | 'homebrew' | 'path'

/** Where a resolved adb path came from, for diagnostics and support. */
export function adbSource(adbPath: string, lookup: BinaryLookup): BinarySource {
  if (lookup.env.DROIDWIRE_ADB && adbPath === lookup.env.DROIDWIRE_ADB) return 'override'
  if (lookup.resourcesDir && adbPath === path.join(lookup.resourcesDir, 'adb')) return 'bundled'
  if (adbPath.startsWith('/opt/homebrew/') || adbPath.startsWith('/usr/local/')) return 'homebrew'
  if (adbPath === 'adb') return 'path'
  return 'sdk'
}

/**
 * The native video-thumbnail helper (AVFoundation). Packaged builds ship it in
 * Resources/; a development checkout uses the build output of native/thumb.
 */
export function findThumbHelper(lookup: BinaryLookup, devBuildDir?: string): string | null {
  const list = [
    ...(lookup.env.DROIDWIRE_THUMB ? [lookup.env.DROIDWIRE_THUMB] : []),
    ...(lookup.resourcesDir ? [path.join(lookup.resourcesDir, 'droidwire-thumb')] : []),
    ...(devBuildDir ? [path.join(devBuildDir, 'droidwire-thumb')] : []),
  ]
  return list.find(lookup.exists) ?? null
}
