import type { DeviceContext, TransportKind } from '@droidwire/shared'
import { parseDeviceContext } from './lib/ipc-validate.ts'

// The user's current selection: which connection mode is chosen and which
// device is active under each transport. This is only the *ambient* default
// for operations that do not carry an explicit DeviceContext - queued and
// long-running work always carries its own (see device-manager resolveContext).

export type ConnectionType = 'adb' | 'mtp' | 'wireless'

let connectionType: ConnectionType = 'adb'
const active: Record<TransportKind, string | null> = { adb: null, mtp: null }

export function setConnectionType(type: ConnectionType): void {
  connectionType = type
}

export function getConnectionType(): ConnectionType {
  return connectionType
}

/** Wireless ADB uses the adb transport; only 'mtp' selects the MTP one. */
export function activeTransportKind(): TransportKind {
  return connectionType === 'mtp' ? 'mtp' : 'adb'
}

export function getActiveSerial(kind: TransportKind = activeTransportKind()): string | null {
  return active[kind]
}

export function setActiveSerial(kind: TransportKind, serial: string | null): void {
  active[kind] = serial
}

export function getActiveContext(): DeviceContext | null {
  const transport = activeTransportKind()
  const serial = active[transport]
  return serial ? { transport, serial } : null
}

/**
 * The device an operation should act on. An explicit context from the
 * renderer always wins - it was captured when the work was queued, so it stays
 * correct after the user switches device or connection mode. Only
 * context-free calls fall back to whatever is active right now.
 */
export function resolveContext(raw?: unknown): DeviceContext {
  const explicit = parseDeviceContext(raw)
  if (explicit) return explicit
  const ambient = getActiveContext()
  if (!ambient) throw new Error('No device selected')
  return ambient
}
