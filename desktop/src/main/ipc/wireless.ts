import crypto from 'crypto'
import type { WebContents } from 'electron'
import { handle, safeSend } from './common.ts'
import { adbHost } from '../adb-transport.ts'
import {
  assertHostPort, assertPairingCode, isConnectSuccess, isPairSuccess, mdnsFind,
} from '../lib/wireless.ts'

// Wireless ADB (Android 11+). Pair and connect are host-global adb commands,
// so they are not scoped to a device serial.

type WirelessEvent = { type: 'waiting' | 'pairing' | 'connecting' | 'connected' | 'error'; message?: string }

let qrSession: { cancelled: boolean } | null = null

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))

// QR pairing (Android Studio flow): show a WIFI:T:ADB QR; the phone scans it
// and advertises _adb-tls-pairing over mDNS; we spot the service, pair with
// the password from the QR, then find _adb-tls-connect and connect.
async function runQrPairLoop(
  session: { cancelled: boolean },
  name: string,
  password: string,
  sender: WebContents,
): Promise<void> {
  const send = (payload: WirelessEvent) => {
    if (!session.cancelled) safeSend(sender, 'wireless-event', payload)
  }
  send({ type: 'waiting' })

  const deadline = Date.now() + 180_000
  while (!session.cancelled && Date.now() < deadline) {
    let out = ''
    try { out = await adbHost(['mdns', 'services'], 5000) } catch { /* retry */ }
    const pairAddr = mdnsFind(out, '_adb-tls-pairing', name)
    if (!pairAddr) { await sleep(1500); continue }

    send({ type: 'pairing' })
    try {
      const pairOut = await adbHost(['pair', pairAddr, password], 30_000)
      if (!isPairSuccess(pairOut)) throw new Error(pairOut.trim() || 'Pairing failed')
    } catch (e) {
      send({ type: 'error', message: errText(e) })
      return
    }

    // Paired - the phone now advertises its connect port on the same IP
    send({ type: 'connecting' })
    const ip = pairAddr.split(':')[0]
    const connectDeadline = Date.now() + 30_000
    while (!session.cancelled && Date.now() < connectDeadline) {
      let out2 = ''
      try { out2 = await adbHost(['mdns', 'services'], 5000) } catch { /* retry */ }
      const connectAddr = mdnsFind(out2, '_adb-tls-connect', ip)
      if (connectAddr) {
        try {
          const conOut = await adbHost(['connect', connectAddr], 20_000)
          if (isConnectSuccess(conOut)) send({ type: 'connected' })
          else throw new Error(conOut.trim() || 'Connection failed')
        } catch (e) {
          send({ type: 'error', message: errText(e) })
        }
        return
      }
      await sleep(1500)
    }
    send({ type: 'error', message: 'Paired, but the connect port never appeared - connect manually with the IP and port from the Wireless debugging screen.' })
    return
  }
  if (!session.cancelled) send({ type: 'error', message: 'Timed out waiting for the phone to scan the code.' })
}

export function stopQrPairing(): void {
  if (qrSession) qrSession.cancelled = true
  qrSession = null
}

export function registerWirelessHandlers(): void {
  handle('adb:pair', async (_e, hostPort, code): Promise<{ ok: boolean; message: string }> => {
    try {
      const out = await adbHost(['pair', assertHostPort(hostPort), assertPairingCode(code)], 30_000)
      const ok = isPairSuccess(out)
      return { ok, message: out.trim() || (ok ? 'Paired' : 'Pairing failed') }
    } catch (e) {
      return { ok: false, message: errText(e) }
    }
  })

  handle('adb:connect', async (_e, hostPort): Promise<{ ok: boolean; message: string }> => {
    try {
      const out = await adbHost(['connect', assertHostPort(hostPort)], 20_000)
      const ok = isConnectSuccess(out)
      return { ok, message: out.trim() || (ok ? 'Connected' : 'Connection failed') }
    } catch (e) {
      return { ok: false, message: errText(e) }
    }
  })

  handle('adb:qr-pair-start', event => {
    stopQrPairing()
    const session = { cancelled: false }
    qrSession = session
    // The window closing ends the session; nobody is left to show progress to
    event.sender.once('destroyed', () => { session.cancelled = true })
    const name = `droidwire-${crypto.randomBytes(4).toString('hex')}`
    const password = crypto.randomBytes(6).toString('hex')
    void runQrPairLoop(session, name, password, event.sender)
    return `WIFI:T:ADB;S:${name};P:${password};;`
  })

  handle('adb:qr-pair-stop', () => stopQrPairing())
}
