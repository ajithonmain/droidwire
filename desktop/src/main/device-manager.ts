import type { TransportKind } from '@droidwire/shared'
import type { Transport } from './transport.ts'
import { AdbTransport, addEjectedSerial, adbDeviceRows, clearEjectedSerials, forgetDeviceCaches } from './adb-transport.ts'
import { MtpTransport } from './mtp-transport.ts'
import { activeTransportKind, getActiveSerial, setActiveSerial } from './active-device.ts'

export { resolveContext } from './active-device.ts'

export function transportFor(kind: TransportKind): Transport {
  return kind === 'mtp' ? MtpTransport : AdbTransport
}

export interface DeviceListEntry {
  serial: string
  state: 'device'
  model: string
}

/** Enumerate devices for the current connection mode and keep the active one valid. */
export async function enumerateDevices(): Promise<{
  devices: DeviceListEntry[]
  active: string | null
  /** adb saw a device but it is not usable yet (unauthorized, offline, ...) */
  issues: { serial: string; state: string }[]
}> {
  const kind = activeTransportKind()
  const found = await transportFor(kind).getDevices()
  const current = getActiveSerial(kind)
  if (!current || !found.some(d => d.serial === current)) {
    setActiveSerial(kind, found[0]?.serial ?? null)
  }
  let issues: { serial: string; state: string }[] = []
  if (kind === 'adb' && found.length === 0) {
    try { issues = (await adbDeviceRows()).filter(r => r.state !== 'device') } catch { /* adb itself is the problem; diagnostics reports it */ }
  }
  return {
    devices: found.map(d => ({ serial: d.serial, state: 'device' as const, model: d.name })),
    active: getActiveSerial(kind),
    issues,
  }
}

export function selectDevice(serial: string): void {
  setActiveSerial(activeTransportKind(), serial)
}

export function ejectDevice(serial: string): void {
  addEjectedSerial(serial)
  if (getActiveSerial('adb') === serial) setActiveSerial('adb', null)
}

export function uneject(): void {
  clearEjectedSerials()
}

export function resetDeviceCaches(): void {
  forgetDeviceCaches()
}
