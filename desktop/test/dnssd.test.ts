import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mdnsServices, parseAddress, parseBrowse, parseLookup, type DnssdRunner } from '../src/main/lib/dnssd.ts'
import { mdnsFind } from '../src/main/lib/wireless.ts'

// Output shapes of macOS /usr/bin/dns-sd
const BROWSE = `Browsing for _adb-tls-pairing._tcp
DATE: ---Thu 08 Oct 2026---
15:34:20.231  ...STARTING...
Timestamp     A/R    Flags  if Domain               Service Type         Instance Name
15:34:20.512  Add        3   8 local.               _adb-tls-pairing._tcp. droidwire-ab12cd
15:34:21.000  Rmv        0   8 local.               _adb-tls-pairing._tcp. gone-instance
`
const LOOKUP = `Lookup droidwire-ab12cd._adb-tls-pairing._tcp.local
15:34:20.700  droidwire-ab12cd._adb-tls-pairing._tcp.local. can be reached at Android.local.:41234 (interface 8)
 `
const ADDR = `15:34:20.900  Add  2  8 Android.local.  192.168.68.112  120
`

test('browse output yields only announced instances', () => {
  assert.deepEqual(parseBrowse(BROWSE, '_adb-tls-pairing'), ['droidwire-ab12cd'])
  assert.deepEqual(parseBrowse('nothing here', '_adb-tls-pairing'), [])
})

test('lookup and address output are parsed', () => {
  assert.deepEqual(parseLookup(LOOKUP), { host: 'Android.local.', port: 41234 })
  assert.equal(parseLookup('garbage'), null)
  assert.equal(parseAddress(ADDR), '192.168.68.112')
  assert.equal(parseAddress('15:34 Add 2 8 h.local. 169.254.1.2 120'), null, 'link-local addresses are ignored')
})

test('discovered services have the format mdnsFind expects, so the QR flow finds the pairing address', async () => {
  const run: DnssdRunner = async args => (args[0] === '-B' ? BROWSE : args[0] === '-L' ? LOOKUP : ADDR)
  const text = await mdnsServices(['_adb-tls-pairing'], run, 1)
  assert.equal(mdnsFind(text, '_adb-tls-pairing', 'droidwire-ab12cd'), '192.168.68.112:41234')
  assert.equal(mdnsFind(text, '_adb-tls-pairing', 'someone-else'), null)
})

test('nothing announced means empty output, not an error', async () => {
  assert.equal(await mdnsServices(['_adb-tls-connect'], async () => '', 1), '')
})

import { reconnectTargets } from '../src/main/lib/wireless-reconnect.ts'
import { runDnssd } from '../src/main/lib/dnssd.ts'

test('reconnect needs the same phone: IP and hardware serial must both match', () => {
  const text = [
    'adb-AAA111-x1y2z3\t_adb-tls-connect._tcp.\t192.168.68.112:44001',
    'adb-BBB222-q9w8e7\t_adb-tls-connect._tcp.\t192.168.68.200:39999',
    'studio\t_adb-tls-pairing._tcp.\t192.168.68.112:5555',
  ].join('\n')
  assert.deepEqual(reconnectTargets(text, new Map([['192.168.68.112', 'AAA111']])), ['192.168.68.112:44001'])
  assert.deepEqual(reconnectTargets(text, new Map()), [], 'nothing is known, nothing is reconnected')
})

test('a different phone that now has a known phone\'s old IP is NOT reconnected', () => {
  const text = 'adb-OTHER999-zzzzzz\t_adb-tls-connect._tcp.\t192.168.68.112:41000'
  assert.deepEqual(reconnectTargets(text, new Map([['192.168.68.112', 'AAA111']])), [])
})

test('a serial that merely starts the same does not match another phone', () => {
  const text = 'adb-AAA1112-abcdef\t_adb-tls-connect._tcp.\t192.168.68.112:41000'
  assert.deepEqual(reconnectTargets(text, new Map([['192.168.68.112', 'AAA111']])), [])
})

test('lookups are bounded: an aborted discovery returns at once and starts no process', async () => {
  const ac = new AbortController(); ac.abort()
  const t0 = Date.now()
  assert.equal(await runDnssd(['-B', '_adb-tls-pairing._tcp', 'local'], 5000, ac.signal), '')
  assert.ok(Date.now() - t0 < 500)
})

test('a lookup that never ends is killed at its timeout and a hostile network cannot trigger unbounded lookups', async () => {
  const t0 = Date.now()
  await runDnssd(['-B', '_droidwire-no-such-service._tcp', 'local'], 300)
  assert.ok(Date.now() - t0 < 2000, 'the dns-sd child must be killed at the timeout')
  const calls: string[] = []
  const flood = Array.from({ length: 50 }, (_, i) => `15:34:20.512  Add        3   8 local.               _adb-tls-pairing._tcp. n${i}`).join('\n')
  await mdnsServices(['_adb-tls-pairing'], async args => { calls.push(args[0]); return args[0] === '-B' ? flood : '' }, 1)
  assert.ok(calls.filter(c => c === '-L').length <= 8, `looked up ${calls.filter(c => c === '-L').length} instances`)
})
