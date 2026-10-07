// Files pulled from a phone are untrusted. Opening one with its default Mac
// app is a user action, but for formats that macOS *executes* on open there is
// no safe "default app", so those are refused outright.
const EXECUTABLE_EXT = new Set([
  'app', 'command', 'tool', 'sh', 'zsh', 'bash', 'csh', 'ksh', 'pkg', 'mpkg', 'dmg', 'terminal',
  'workflow', 'action', 'scpt', 'scptd', 'applescript', 'jar', 'webloc', 'inetloc', 'fileloc',
  'prefpane', 'saver', 'dylib', 'kext', 'exe', 'bat', 'cmd', 'msi', 'vbs', 'ps1', 'apk',
])

export function isOpenableFileName(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return !EXECUTABLE_EXT.has(ext)
}
