import crypto from 'node:crypto'
import type { DeviceContext } from '@droidwire/shared'

// Two phones can expose the very same path (/sdcard/DCIM/IMG_0001.jpg), and the
// same phone can be reached over ADB and MTP. Anything cached or tracked by
// remote path must therefore be keyed by device identity as well.

/** Stable, unambiguous key for (device, remote path). */
export function deviceScopedKey(device: DeviceContext, remotePath: string): string {
  return `${device.transport}\0${device.serial}\0${remotePath}`
}

/** Short filesystem-safe directory name derived from a scoped key. */
export function scopedDirName(device: DeviceContext, remotePath: string): string {
  return crypto.createHash('sha256').update(deviceScopedKey(device, remotePath)).digest('hex').slice(0, 16)
}
