import path from 'node:path'

/** Written into Resources/ by the release build, in place of the MTP addon, worker and libmtp. */
export const MTP_MARKER_FILE = 'MTP-NOT-INCLUDED.txt'

export const MTP_EXCLUDED_MESSAGE = 'MTP is not included in this release (deferred). Use USB (ADB) or Wi-Fi instead.'

export function isMtpExcluded(resourcesDir: string, exists: (p: string) => boolean): boolean {
  return exists(path.join(resourcesDir, MTP_MARKER_FILE))
}
