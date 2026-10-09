import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Diagnostics } from '@droidwire/shared'
import { guideNotices, guideSteps } from '../src/renderer/lib/setupGuidance.ts'
import { adbSource, findThumbHelper } from '../src/main/lib/adb-path.ts'

const diag = (over: Partial<Diagnostics> = {}): Diagnostics => ({
  app: { version: '1.0.0', packaged: true, electron: '42', arch: 'arm64', macos: '24' },
  adb: { path: '/Applications/Droidwire.app/Contents/Resources/adb', source: 'bundled', version: 'Android Debug Bridge version 1.0.41', error: null },
  mtp: { available: true, error: null, addon: '/x/luck-node-mtp.node' },
  thumbnails: { native: '/x/droidwire-thumb', ffmpeg: null },
  ...over,
})

test('an unauthorized phone gets the specific "tap Allow" instruction, once', () => {
  const n = guideNotices('adb', [{ serial: 'A', state: 'unauthorized' }, { serial: 'B', state: 'unauthorized' }], diag())
  assert.equal(n.length, 1)
  assert.match(n[0].title, /not authorized/)
  assert.match(n[0].body, /Allow/)
})

test('offline and unknown states are explained rather than ignored', () => {
  const n = guideNotices('adb', [{ serial: 'A', state: 'offline' }, { serial: 'B', state: 'recovery' }], diag())
  assert.equal(n.length, 2)
  assert.match(n[0].title, /not responding/)
  assert.match(n[1].title, /recovery/)
})

test('a bundled adb that cannot start is reported as an install problem with a next step', () => {
  const n = guideNotices('adb', [], diag({ adb: { path: '/x/adb', source: 'bundled', version: null, error: 'Bad CPU type in executable' } }))
  assert.equal(n[0].tone, 'error')
  assert.match(n[0].body, /Bad CPU type/)
  assert.match(n[0].body, /Reinstall|Copy Diagnostics/)
})

test('a missing MTP component is reported in MTP mode only', () => {
  const broken = diag({ mtp: { available: false, error: 'dlopen failed: libmtp', addon: null } })
  assert.equal(guideNotices('mtp', [], broken)[0].tone, 'error')
  assert.deepEqual(guideNotices('adb', [], broken), [])
  assert.deepEqual(guideNotices('mtp', [], diag()), [])
})

test('each mode has its own phone-side steps', () => {
  const adb = guideSteps('adb').map(s => s.title).join(' | ')
  const mtp = guideSteps('mtp').map(s => s.title).join(' | ')
  const wifi = guideSteps('wireless').map(s => s.title).join(' | ')
  assert.match(adb, /USB Debugging/)
  assert.match(mtp, /File Transfer/)
  assert.doesNotMatch(mtp, /USB Debugging/)
  assert.match(wifi, /Wireless debugging/)
})

test('adb resolution prefers the bundled copy and reports where it came from', () => {
  const res = '/Applications/Droidwire.app/Contents/Resources'
  const base = { resourcesDir: res, env: {}, homeDir: '/Users/x', exists: (p: string) => [`${res}/adb`, '/opt/homebrew/bin/adb'].includes(p) }
  // Minimal PATH, no system adb: only the bundled one exists
  const only = { ...base, exists: (p: string) => p === `${res}/adb` }
  assert.equal(adbSource(`${res}/adb`, only), 'bundled')
  assert.equal(adbSource('/opt/homebrew/bin/adb', base), 'homebrew')
  assert.equal(adbSource('adb', base), 'path')
  assert.equal(adbSource('/custom/adb', { ...base, env: { DROIDWIRE_ADB: '/custom/adb' } }), 'override')
})

test('the native thumbnail helper is found in Resources, with an env override for development', () => {
  const res = '/Applications/Droidwire.app/Contents/Resources'
  const look = (paths: string[], env: Record<string, string> = {}) => ({ resourcesDir: res, env, homeDir: '/h', exists: (p: string) => paths.includes(p) })
  assert.equal(findThumbHelper(look([`${res}/droidwire-thumb`])), `${res}/droidwire-thumb`)
  assert.equal(findThumbHelper(look([]), '/dev/out'), null)
  assert.equal(findThumbHelper(look(['/dev/out/droidwire-thumb']), '/dev/out'), '/dev/out/droidwire-thumb')
  assert.equal(findThumbHelper(look(['/mine']), '/dev/out'), null)
  assert.equal(findThumbHelper(look(['/mine'], { DROIDWIRE_THUMB: '/mine' })), '/mine')
})

test('MTP guidance states the experimental status and the cancel/replug limitation before connecting', () => {
  const steps = guideSteps('mtp')
  const limitation = steps.find(s => /limitation/i.test(s.title))
  assert.ok(limitation, 'no limitation step')
  assert.match(limitation!.body, /experimental/i)
  assert.match(limitation!.body, /unplug/i)
  assert.ok(!guideSteps('adb').some(s => /limitation/i.test(s.title)), 'ADB has no such limitation')
})

test('a release built without MTP says so plainly and points to USB or Wi-Fi instead of suggesting a reinstall', () => {
  const diag = { app: { version: '1', packaged: true, electron: '', arch: 'arm64', macos: '' }, adb: { path: '', source: 'bundled', version: 'v', error: null }, thumbnails: { native: null, ffmpeg: null },
    mtp: { available: false, error: 'MTP is not included in this release (deferred). Use USB (ADB) or Wi-Fi instead.', addon: null, excluded: true } } as unknown as Parameters<typeof guideNotices>[2]
  const n = guideNotices('mtp', [], diag)
  assert.equal(n.length, 1)
  assert.match(n[0].title, /not included in this release/i)
  assert.match(n[0].body, /USB.*Wi-Fi/)
  assert.ok(!/reinstall/i.test(n[0].body))
})
