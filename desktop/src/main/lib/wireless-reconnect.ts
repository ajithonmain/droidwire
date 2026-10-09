/**
 * `ip:port` for every discovered `_adb-tls-connect` service that belongs to a phone this session connected to on
 * purpose. Identity is the phone's hardware serial, which adb embeds in the mDNS instance name
 * ("adb-<serial>-<suffix>"): an IP address alone is not enough, because DHCP can hand a known phone's old address
 * to a different phone. Phones whose serial is unknown are never reconnected automatically.
 */
export function reconnectTargets(servicesText: string, known: ReadonlyMap<string, string>): string[] {
  const out: string[] = []
  for (const line of servicesText.split('\n')) {
    if (!line.includes('_adb-tls-connect')) continue
    const m = line.trim().match(/^(\S+)\s.*?(\d+\.\d+\.\d+\.\d+):(\d+)\s*$/)
    if (!m) continue
    const [, instance, ip, port] = m
    const serial = known.get(ip)
    if (serial && instance.startsWith(`adb-${serial}-`)) out.push(`${ip}:${port}`)
  }
  return out
}
