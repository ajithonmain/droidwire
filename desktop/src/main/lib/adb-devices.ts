// Pure helpers for turning `adb devices` output into the device list the UI
// shows. Kept free of I/O so the dedupe rules can be tested.

export interface AdbDeviceRow {
  serial: string
  state: string
}

export function parseAdbDevices(output: string): AdbDeviceRow[] {
  return output
    .split('\n')
    .slice(1)
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('*') && l.includes('\t'))
    .map(l => {
      const [serial, state] = l.split('\t')
      return { serial: serial.trim(), state: state.trim() }
    })
}

export function isWirelessSerial(serial: string): boolean {
  return serial.includes(':') || serial.startsWith('adb-') || serial.includes('_adb-tls-connect')
}

/** Lower is faster: USB, then ip:port wireless, then mDNS wireless. */
export function transportRank(serial: string): number {
  if (!isWirelessSerial(serial)) return 0
  return serial.includes(':') && !serial.includes('_adb-tls-connect') ? 1 : 2
}

/**
 * One entry per physical phone. A phone reachable over both USB and Wi-Fi
 * appears twice in `adb devices`; keep the entry the user is actively using,
 * otherwise the fastest transport. `hwSerialOf` maps an adb serial to the
 * phone's hardware serial (or the adb serial itself when unknown).
 */
export function dedupeByHardware<T extends { serial: string }>(
  online: T[],
  activeSerial: string | null,
  hwSerialOf: (serial: string) => string,
): T[] {
  const byHw = new Map<string, T>()
  for (const d of online) {
    const hw = hwSerialOf(d.serial)
    const existing = byHw.get(hw)
    if (!existing) { byHw.set(hw, d); continue }
    const keepNew = d.serial === activeSerial
      || (existing.serial !== activeSerial && transportRank(d.serial) < transportRank(existing.serial))
    if (keepNew) byHw.set(hw, d)
  }
  return online.filter(d => byHw.get(hwSerialOf(d.serial)) === d)
}
