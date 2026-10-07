import type { DeviceContext } from '@droidwire/shared'

// The device the UI is currently showing. App keeps this in sync with the
// connection mode and active device; code that starts work reads it *at the
// moment the work is requested* and carries the value along, so a later
// switch cannot change which phone that work talks to.

let current: DeviceContext | null = null

export function setDeviceContext(ctx: DeviceContext | null): void {
  current = ctx
}

export function getDeviceContext(): DeviceContext | null {
  return current
}
