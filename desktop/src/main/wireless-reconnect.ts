import { adbHost, adbShell } from './adb-transport.ts'
import { killAllDnssd, mdnsServices } from './lib/dnssd.ts'
import { isConnectSuccess } from './lib/wireless.ts'
import { reconnectTargets } from './lib/wireless-reconnect.ts'

// Google's adb re-connects a paired phone by itself when it comes back on the network, using mDNS. The
// bundled adb has no mDNS support, so after a Wi-Fi drop the phone stays gone until someone presses Connect.
// This restores the behaviour for phones this session already connected to: while in Wi-Fi mode with no
// wireless device present, look the phone up with dns-sd (its connect port changes whenever Wireless
// debugging restarts) and `adb connect` to it.

// ip -> hardware serial of phones connected to on purpose (manual Connect or QR pairing) in this session
const knownPhones = new Map<string, string>()
let inFlight = false
let lastTry = 0
let aborter = new AbortController()
const RETRY_MS = 8_000

/**
 * Remember a phone that was just connected to. Its hardware serial is read over that very connection, so a later
 * automatic reconnect can verify it is the same phone and never "reconnects" to somebody else's device.
 */
export async function rememberWirelessAddress(hostPort: string): Promise<void> {
  const ip = hostPort.split(':')[0]
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return
  try {
    const serial = (await adbShell(hostPort, 'getprop ro.serialno', { timeout: 8000 })).trim()
    if (/^[A-Za-z0-9]{4,40}$/.test(serial)) knownPhones.set(ip, serial)
  } catch { /* unknown identity: this phone will not be reconnected automatically */ }
}

/** Fire-and-forget; the device poll that called this simply sees the phone on a later tick. */
export function tryWirelessReconnect(): void {
  if (inFlight || knownPhones.size === 0 || Date.now() - lastTry < RETRY_MS) return
  inFlight = true; lastTry = Date.now()
  const signal = aborter.signal
  void (async () => {
    try {
      const text = await mdnsServices(['_adb-tls-connect'], undefined, undefined, signal)
      for (const addr of reconnectTargets(text, knownPhones)) {
        if (signal.aborted) return
        const out = await adbHost(['connect', addr], 15_000).catch(() => '')
        if (isConnectSuccess(out)) console.log(`[wireless] reconnected to a known phone (${addr.split(':')[0]})`)
      }
    } catch { /* try again on the next poll */ } finally { inFlight = false }
  })()
}

/** App quit: end any lookup in flight and every dns-sd child. */
export function stopWirelessReconnect(): void {
  aborter.abort(); aborter = new AbortController()
  killAllDnssd()
}
