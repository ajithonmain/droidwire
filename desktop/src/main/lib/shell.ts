// Helpers for building commands that run inside `adb shell`.
//
// `adb shell <string>` hands the string to the device's sh, so any remote
// path or user-supplied text embedded in it is hostile input: a folder may
// legitimately be named `it's here`, `a; rm -rf /sdcard` or `$(reboot)`.
// Always quote with shQuote(); never concatenate raw values.

/** POSIX single-quote escaping: the result is always exactly one shell word. */
export function shQuote(value: string): string {
  if (value.includes('\0')) throw new Error('Argument contains a NUL byte')
  return `'${value.replace(/'/g, `'\\''`)}'`
}

/** Escape fnmatch metacharacters so a user query matches literally inside `-iname`. */
export function escapeGlob(value: string): string {
  return value.replace(/[\\*?[\]]/g, ch => `\\${ch}`)
}

/**
 * Command that creates a zip of `remoteDir` (stored under its own folder name)
 * at `remoteZip`. Runs on the device, so everything is quoted.
 */
export function buildRemoteZipCommand(remoteDir: string, remoteZip: string): string {
  const trimmed = remoteDir.replace(/\/+$/, '')
  const base = trimmed.split('/').filter(Boolean).pop()
  if (!base) throw new Error('Cannot zip the storage root')
  const parent = trimmed.slice(0, trimmed.length - base.length).replace(/\/+$/, '') || '/'
  return `cd ${shQuote(parent)} && zip -r -q ${shQuote(remoteZip)} ${shQuote(base)}`
}

/** Hidden, per-operation temp archive on shared storage. `operationId` must be a safe token. */
export function remoteTempZipPath(operationId: string): string {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(operationId)) throw new Error('Invalid operation id')
  return `/sdcard/.droidwire-zip-${operationId}.zip`
}
