// Wireless ADB argument validation and output parsing.

const HOST_PORT = /^(?:\d{1,3}(?:\.\d{1,3}){3}|[A-Za-z0-9][A-Za-z0-9.-]{0,252}):\d{1,5}$/

export function assertHostPort(value: unknown): string {
  const v = typeof value === 'string' ? value.trim() : ''
  if (!HOST_PORT.test(v)) throw new Error('Enter the address as IP:port, e.g. 192.168.1.20:37099')
  const port = Number(v.slice(v.lastIndexOf(':') + 1))
  if (port < 1 || port > 65535) throw new Error('Port must be between 1 and 65535')
  return v
}

export function assertPairingCode(value: unknown): string {
  const v = typeof value === 'string' ? value.trim() : ''
  if (!/^\d{6}$/.test(v)) throw new Error('The pairing code is 6 digits')
  return v
}

export function isPairSuccess(output: string): boolean {
  return /successfully paired/i.test(output)
}

/** "connected to x" / "already connected to x" succeed; "failed to connect" does not. */
export function isConnectSuccess(output: string): boolean {
  return /(^|\s)connected to/i.test(output) && !/failed|cannot|unable/i.test(output)
}

/** Find `ip:port` for an mDNS service line mentioning `needle`. */
export function mdnsFind(output: string, service: string, needle: string): string | null {
  for (const line of output.split('\n')) {
    if (!line.includes(service) || !line.includes(needle)) continue
    const m = line.trim().match(/(\d+\.\d+\.\d+\.\d+:\d+)\s*$/)
    if (m) return m[1]
  }
  return null
}
