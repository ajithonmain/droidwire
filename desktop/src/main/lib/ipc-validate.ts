import type { DeviceContext, TransportKind } from '@droidwire/shared'

/** Validate an optional renderer-supplied device context. Returns null when absent. */
export function parseDeviceContext(raw: unknown): DeviceContext | null {
  if (raw === undefined || raw === null) return null
  if (typeof raw !== 'object') throw new Error('Invalid device context')
  const { transport, serial } = raw as Record<string, unknown>
  if (transport !== 'adb' && transport !== 'mtp') throw new Error('Invalid device transport')
  if (typeof serial !== 'string' || serial.length === 0 || serial.length > 256 || serial.includes('\0')) {
    throw new Error('Invalid device serial')
  }
  return { transport: transport as TransportKind, serial }
}

export function assertString(value: unknown, what: string, max = 4096): string {
  if (typeof value !== 'string' || value.length > max || value.includes('\0')) throw new Error(`Invalid ${what}`)
  return value
}

export function assertNonEmptyString(value: unknown, what: string, max = 4096): string {
  const s = assertString(value, what, max)
  if (s.length === 0) throw new Error(`Invalid ${what}`)
  return s
}

export function assertBoolean(value: unknown, what: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`Invalid ${what}`)
  return value
}
