import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assertPersistKey, serializePersisted } from '../src/main/lib/persist.ts'
import { parseDeviceContext } from '../src/main/lib/ipc-validate.ts'
import { isAllowedExternalUrl, isAppUrl } from '../src/main/lib/url.ts'
import { adbCandidates, findAdb, findFfmpeg } from '../src/main/lib/adb-path.ts'
import { parseAdbDevices, dedupeByHardware, transportRank } from '../src/main/lib/adb-devices.ts'
import { SpeedMeter } from '../src/main/lib/speed.ts'

test('persist keys are allowlisted and cannot traverse', () => {
  assert.equal(assertPersistKey('bookmarks'), 'bookmarks')
  for (const bad of ['../settings', 'settings', 'beta-signup', '', 'a/b', 42, undefined]) {
    assert.throws(() => assertPersistKey(bad), String(bad))
  }
  assert.throws(() => serializePersisted('x'.repeat(3 * 1024 * 1024)))
  assert.throws(() => serializePersisted(undefined))
})

test('device context validation', () => {
  assert.equal(parseDeviceContext(undefined), null)
  assert.deepEqual(parseDeviceContext({ transport: 'adb', serial: 'ABC123' }), { transport: 'adb', serial: 'ABC123' })
  assert.throws(() => parseDeviceContext({ transport: 'ftp', serial: 'x' }))
  assert.throws(() => parseDeviceContext({ transport: 'adb', serial: '' }))
  assert.throws(() => parseDeviceContext('adb'))
})

test('external urls are https github only', () => {
  assert.ok(isAllowedExternalUrl('https://github.com/owner/repo/releases/latest'))
  assert.ok(!isAllowedExternalUrl('http://github.com/x'))
  assert.ok(!isAllowedExternalUrl('https://evil.example/github.com'))
  assert.ok(!isAllowedExternalUrl('https://github.com.evil.example/'))
  assert.ok(!isAllowedExternalUrl('https://user:pw@github.com/x'))
  assert.ok(!isAllowedExternalUrl('file:///etc/passwd'))
  assert.ok(!isAllowedExternalUrl('javascript:alert(1)'))
  assert.ok(!isAllowedExternalUrl(null))
})

test('renderer navigation is limited to the app page', () => {
  const app = ['file:///Applications/Droidwire.app/Contents/Resources/app.asar/out/renderer/index.html']
  assert.ok(isAppUrl(app[0] + '#menubar', app))
  assert.ok(!isAppUrl('file:///etc/passwd', app))
  assert.ok(!isAppUrl('https://example.com', app))
  assert.ok(isAppUrl('http://localhost:5173/#menubar', ['http://localhost:5173']))
  assert.ok(!isAppUrl('http://localhost:5174/', ['http://localhost:5173']))
})

test('adb lookup honours override, bundled, SDK, then brew and finally PATH', () => {
  const base = { env: {}, homeDir: '/Users/x', exists: () => false }
  assert.equal(findAdb(base), 'adb')
  const have = (paths: string[]) => ({ ...base, exists: (p: string) => paths.includes(p) })
  assert.equal(findAdb(have(['/opt/homebrew/bin/adb'])), '/opt/homebrew/bin/adb')
  assert.equal(findAdb(have(['/Users/x/Library/Android/sdk/platform-tools/adb', '/opt/homebrew/bin/adb'])), '/Users/x/Library/Android/sdk/platform-tools/adb')
  assert.equal(findAdb({ ...have(['/res/adb', '/opt/homebrew/bin/adb']), resourcesDir: '/res' }), '/res/adb')
  assert.equal(findAdb({ ...have(['/custom/adb', '/res/adb']), env: { DROIDWIRE_ADB: '/custom/adb' }, resourcesDir: '/res' }), '/custom/adb')
  assert.ok(adbCandidates({ ...base, env: { ANDROID_HOME: '/sdk' } }).includes('/sdk/platform-tools/adb'))
  assert.equal(findFfmpeg(base), null)
  assert.equal(findFfmpeg(have(['/usr/local/bin/ffmpeg'])), '/usr/local/bin/ffmpeg')
})

test('adb devices parsing and USB/wireless dedupe', () => {
  const out = 'List of devices attached\nUSB1\tdevice\n192.168.1.5:5555\tdevice\nbad\tunauthorized\n* daemon started\n'
  const rows = parseAdbDevices(out)
  assert.deepEqual(rows.map(r => r.serial), ['USB1', '192.168.1.5:5555', 'bad'])
  const online = rows.filter(r => r.state === 'device')
  const hw = (s: string) => (s === 'USB1' || s.startsWith('192.')) ? 'HW' : s
  assert.deepEqual(dedupeByHardware(online, null, hw).map(r => r.serial), ['USB1'])
  assert.deepEqual(dedupeByHardware(online, '192.168.1.5:5555', hw).map(r => r.serial), ['192.168.1.5:5555'])
  assert.ok(transportRank('USB1') < transportRank('1.2.3.4:5555'))
  assert.ok(transportRank('1.2.3.4:5555') < transportRank('adb-x._adb-tls-connect._tcp'))
})

test('speed meter uses measured intervals', () => {
  let t = 1000
  const m = new SpeedMeter(() => t)
  t = 1500
  assert.equal(m.sample(500), 1000)
  t = 3500
  assert.equal(m.sample(2500), 1000)
  t = 3500
  assert.equal(m.sample(2600), 0)
})

import { assertHostPort, assertPairingCode, isConnectSuccess, isPairSuccess, mdnsFind } from '../src/main/lib/wireless.ts'
import { isOpenableFileName } from '../src/main/lib/openable.ts'
import { decodeTextPreview, previewKind } from '../src/main/lib/preview-kind.ts'
import { mergeSettings, normalizeSettings, updatesEnabled } from '../src/main/lib/settings-schema.ts'

test('wireless arguments are validated before reaching adb', () => {
  assert.equal(assertHostPort(' 192.168.1.20:37099 '), '192.168.1.20:37099')
  assert.equal(assertHostPort('phone.local:5555'), 'phone.local:5555')
  for (const bad of ['', 'nohost', '1.2.3.4', '1.2.3.4:0', '1.2.3.4:99999', '-s x:1', '1.2.3.4:5555 extra', 7]) {
    assert.throws(() => assertHostPort(bad), String(bad))
  }
  assert.equal(assertPairingCode('123456'), '123456')
  assert.throws(() => assertPairingCode('12345'))
  assert.throws(() => assertPairingCode('abcdef'))
  assert.ok(isPairSuccess('Successfully paired to 1.2.3.4:5 [guid=x]'))
  assert.ok(isConnectSuccess('already connected to 1.2.3.4:5555'))
  assert.ok(!isConnectSuccess('failed to connect to 1.2.3.4:5555'))
  assert.equal(mdnsFind('droidwire-ab _adb-tls-pairing._tcp 192.168.1.9:40000\n', '_adb-tls-pairing', 'droidwire-ab'), '192.168.1.9:40000')
  assert.equal(mdnsFind('x', '_adb-tls-pairing', 'y'), null)
})

test('executable file types are not auto-opened', () => {
  for (const n of ['x.command', 'y.APP', 'z.sh', 'a.pkg', 'b.terminal']) assert.ok(!isOpenableFileName(n), n)
  for (const n of ['notes.txt', 'photo.jpg', 'noext', 'doc.pdf']) assert.ok(isOpenableFileName(n), n)
})

test('preview kinds and text decoding', () => {
  assert.equal(previewKind('a.JPG'), 'image')
  assert.equal(previewKind('a.heic'), 'convert-image')
  assert.equal(previewKind('a.pdf'), 'pdf')
  assert.equal(previewKind('a.mp3'), 'audio')
  assert.equal(previewKind('a.txt'), 'text')
  assert.equal(previewKind('a.json'), 'text')
  assert.equal(previewKind('a.sh'), 'text')
  assert.equal(previewKind('a.apk'), 'none')
  assert.equal(previewKind('a.mp4'), 'none')
  assert.deepEqual(decodeTextPreview(Buffer.from('héllo'), 6), { text: 'héllo', truncated: false })
  assert.deepEqual(decodeTextPreview(Buffer.from('abc'), 100), { text: 'abc', truncated: true })
  assert.equal(decodeTextPreview(Buffer.from([0x89, 0x50, 0x00, 0x01]), 4), null)
})

test('settings keep unrelated keys and ignore bad values', () => {
  assert.deepEqual(normalizeSettings({ downloadDir: '/x', checkForUpdatesOnLaunch: false, junk: 1 }), { downloadDir: '/x', checkForUpdatesOnLaunch: false })
  assert.deepEqual(normalizeSettings({ downloadDir: 5, checkForUpdatesOnLaunch: 'yes' }), {})
  assert.deepEqual(normalizeSettings(null), {})
  // Legacy files held only downloadDir; changing the update flag must not drop it
  assert.deepEqual(mergeSettings({ downloadDir: '/x' }, { checkForUpdatesOnLaunch: false }), { downloadDir: '/x', checkForUpdatesOnLaunch: false })
  assert.equal(updatesEnabled({}), true)
  assert.equal(updatesEnabled({ checkForUpdatesOnLaunch: false }), false)
})
