import type { Transport, TransportDevice } from './transport'
import { AdbTransport } from './adb-transport'
import { MtpTransport } from './mtp-transport'

export type ConnectionType = 'adb' | 'mtp' | 'wireless'

let _connectionType: ConnectionType = 'adb'
let _activeDevice: TransportDevice | null = null

export function setConnectionType(type: ConnectionType) {
  _connectionType = type
}

export function getConnectionType(): ConnectionType {
  return _connectionType
}

export function getActiveTransport(): Transport {
  switch (_connectionType) {
    case 'mtp':
      return MtpTransport
    case 'wireless':
    case 'adb':
    default:
      return AdbTransport
  }
}

export async function listDevices(): Promise<{ devices: TransportDevice[]; active: TransportDevice | null }> {
  const transport = getActiveTransport()
  const devices = await transport.getDevices()

  if (devices.length === 0) {
    _activeDevice = null
    return { devices, active: null }
  }

  if (!_activeDevice || !devices.some(d => d.serial === _activeDevice?.serial)) {
    _activeDevice = devices[0]
  }

  return { devices, active: _activeDevice }
}

export function setActiveDevice(serial: string | null) {
  if (!serial) {
    _activeDevice = null
  } else {
    // In real scenario would validate serial exists in current device list
    _activeDevice = { serial, name: serial, type: _connectionType === 'mtp' ? 'mtp' : 'adb' }
  }
}

export function getActiveDevice(): TransportDevice | null {
  return _activeDevice
}
