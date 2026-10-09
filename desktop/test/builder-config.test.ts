import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { builderConfig, bundleMtpFromEnv, MTP_ONLY_RESOURCES, type BuilderBuild } from '../scripts/lib/builder-config.ts'

const pkg = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'package.json'), 'utf8')) as { build: BuilderBuild }
const tos = (b: BuilderBuild) => b.extraResources.map(r => r.to)

test('the release configuration ships none of the MTP-only resources, and says why', () => {
  const release = builderConfig(pkg.build, { bundleMtp: false })
  for (const f of MTP_ONLY_RESOURCES) assert.ok(!tos(release).includes(f), `${f} must not ship`)
  assert.ok(tos(release).includes('MTP-NOT-INCLUDED.txt'))
  for (const f of ['adb', 'libusb-1.0.0.dylib', 'droidwire-thumb', 'THIRD-PARTY-LICENSES.txt', 'ELECTRON-LICENSE.txt', 'LICENSES.chromium.html']) {
    assert.ok(tos(release).includes(f), `${f} is still needed by USB/Wi-Fi mode and must ship`)
  }
})

test('the release configuration explicitly excludes the luck-node-mtp package from app.asar', () => {
  const release = builderConfig(pkg.build, { bundleMtp: false })
  assert.ok((release.files ?? []).some(f => f.startsWith('!node_modules/luck-node-mtp')))
  assert.ok(!(builderConfig(pkg.build, { bundleMtp: true }).files ?? []).some(f => f.includes('luck-node-mtp')))
})

test('the MTP variant ships all MTP resources and no marker', () => {
  const withMtp = builderConfig(pkg.build, { bundleMtp: true })
  for (const f of MTP_ONLY_RESOURCES) assert.ok(tos(withMtp).includes(f), `${f} should ship in the MTP variant`)
  assert.ok(!tos(withMtp).includes('MTP-NOT-INCLUDED.txt'))
})

test('deriving a configuration does not modify package.json data, and MTP is off unless explicitly requested', () => {
  const before = JSON.stringify(pkg.build)
  builderConfig(pkg.build, { bundleMtp: false })
  assert.equal(JSON.stringify(pkg.build), before)
  assert.equal(bundleMtpFromEnv({}), false)
  assert.equal(bundleMtpFromEnv({ DROIDWIRE_BUNDLE_MTP: '0' }), false)
  assert.equal(bundleMtpFromEnv({ DROIDWIRE_BUNDLE_MTP: '1' }), true)
})

test('the marker file the app looks for exists in resources/', () => {
  assert.ok(fs.existsSync(path.join(import.meta.dirname, '..', 'resources', 'MTP-NOT-INCLUDED.txt')))
})
