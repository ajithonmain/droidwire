import { spawn } from 'node:child_process'

// The bundled adb is built from AOSP source without mDNS support ("adb: mdns is not supported by this
// version of adb"), so `adb mdns services` - which the QR pairing flow used to find the phone's
// _adb-tls-pairing / _adb-tls-connect services - returns nothing and the phone's pairing spinner never
// finishes. macOS ships a Bonjour client, /usr/bin/dns-sd, so the services are discovered with that and
// rendered in the same one-line-per-service format `adb mdns services` uses, which mdnsFind already parses.

export interface DnssdRunner {
  /** Run `dns-sd <args>` for `ms` milliseconds (it never exits by itself) and return its stdout. */
  (args: string[], ms: number, signal?: AbortSignal): Promise<string>
}

// Every dns-sd child ever started and not yet finished, so quitting the app (or cancelling pairing) cannot leave
// browsers running: dns-sd never exits on its own.
const running = new Set<ReturnType<typeof spawn>>()

/** Kill every dns-sd process this module started (app quit). */
export function killAllDnssd(): void {
  for (const p of running) { try { p.kill() } catch { /* gone */ } }
  running.clear()
}

export const runDnssd: DnssdRunner = (args, ms, signal) => new Promise(resolve => {
  let out = ''
  if (signal?.aborted) { resolve(''); return }
  let proc: ReturnType<typeof spawn>
  try { proc = spawn('/usr/bin/dns-sd', args, { stdio: ['ignore', 'pipe', 'ignore'] }) } catch { resolve(''); return }
  running.add(proc)
  proc.stdout?.on('data', d => { out += d.toString() })
  const stop = () => { try { proc.kill() } catch { /* gone */ } finish() }
  const finish = () => { clearTimeout(timer); signal?.removeEventListener('abort', stop); running.delete(proc); resolve(out) }
  const timer = setTimeout(stop, ms)
  signal?.addEventListener('abort', stop, { once: true })
  proc.on('error', finish)
  proc.on('close', finish)
})

/** A hostile or noisy network must not make us spawn an unbounded number of lookups. */
const MAX_INSTANCES = 8

/** Instance names announced for a service type, from `dns-sd -B` output (only "Add" lines). */
export function parseBrowse(output: string, type: string): string[] {
  const names = new Set<string>()
  for (const line of output.split('\n')) {
    if (!/\sAdd\s/.test(line)) continue
    const m = line.match(new RegExp(`${type}\\._tcp\\.\\s+(.+?)\\s*$`))
    if (m) names.add(m[1].replace(/\\(\d{3})/g, (_, o: string) => String.fromCharCode(parseInt(o, 10))))
  }
  return [...names]
}

/** `host.local.` and port from `dns-sd -L` output ("... can be reached at host.local.:port (interface N)"). */
export function parseLookup(output: string): { host: string; port: number } | null {
  const m = output.match(/can be reached at\s+(\S+?):(\d+)\b/)
  return m ? { host: m[1], port: Number(m[2]) } : null
}

/** First IPv4 address from `dns-sd -G v4` output. */
export function parseAddress(output: string): string | null {
  for (const line of output.split('\n')) {
    if (!/\sAdd\s/.test(line)) continue
    const m = line.match(/\b(\d{1,3}(?:\.\d{1,3}){3})\b/)
    if (m && !m[1].startsWith('169.254.')) return m[1]
  }
  return null
}

/**
 * Discover `_adb-tls-pairing` / `_adb-tls-connect` services and return text in the format of
 * `adb mdns services`: "<instance>\t<type>._tcp.\t<ip>:<port>" per line.
 */
export async function mdnsServices(types = ['_adb-tls-pairing', '_adb-tls-connect'], run: DnssdRunner = runDnssd, browseMs = 2500, signal?: AbortSignal): Promise<string> {
  const lines: string[] = []
  await Promise.all(types.map(async type => {
    const names = parseBrowse(await run(['-B', `${type}._tcp`, 'local'], browseMs, signal), type).slice(0, MAX_INSTANCES)
    await Promise.all(names.map(async name => {
      if (signal?.aborted) return
      const where = parseLookup(await run(['-L', name, `${type}._tcp`, 'local'], 2000, signal))
      if (!where) return
      const ip = parseAddress(await run(['-G', 'v4', where.host], 2000, signal))
      if (ip) lines.push(`${name}\t${type}._tcp.\t${ip}:${where.port}`)
    }))
  }))
  return lines.join('\n')
}
