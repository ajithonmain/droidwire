#!/usr/bin/env node
// Checks the files people actually download (the .dmg and the .zip), not just the unpacked app:
// both must contain the same Resources as the checked app bundle, and - in the release configuration - no MTP
// component at all (no luck-node-mtp addon, no libmtp, no MTP worker), plus the "MTP not included" marker.
//
//   node scripts/check-archives.mjs [--with-mtp]
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const withMtp = process.argv.includes('--with-mtp')
const version = JSON.parse(fs.readFileSync(path.join(desktop, 'package.json'), 'utf8')).version
const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
const release = path.join(desktop, 'release')
const appResources = path.join(release, `mac-${arch}`, 'Droidwire.app', 'Contents', 'Resources')
const zipFile = path.join(release, `Droidwire-${version}-${arch}-mac.zip`)
const dmgFile = path.join(release, `Droidwire-${version}-${arch}.dmg`)

const failures = []
const fail = m => failures.push(m)
const FORBIDDEN = /luck-node-mtp|libmtp|mtp-worker/i
const lsDir = d => fs.readdirSync(d).filter(n => !n.endsWith('.lproj')).sort()

function inspect(label, relPaths) {
  // relPaths: every path inside the archive, relative to the archive root
  const bad = relPaths.filter(p => FORBIDDEN.test(path.basename(p)))
  if (!withMtp) for (const b of bad) fail(`${label}: contains ${b}`)
  const resources = relPaths.filter(p => /Droidwire\.app\/Contents\/Resources\/[^/]+\/?$/.test(p)).map(p => path.basename(p.replace(/\/$/, ''))).filter(n => !n.endsWith('.lproj')).sort()
  const expected = lsDir(appResources)
  const missing = expected.filter(n => !resources.includes(n)), extra = resources.filter(n => !expected.includes(n))
  if (missing.length) fail(`${label}: Resources is missing ${missing.join(', ')} compared with the checked app`)
  if (extra.length) fail(`${label}: Resources has extra ${extra.join(', ')} compared with the checked app`)
  if (!withMtp && !resources.includes('MTP-NOT-INCLUDED.txt')) fail(`${label}: MTP-NOT-INCLUDED.txt marker is missing`)
  return `${label}: ${relPaths.length} entries, ${resources.length} Resources items identical to the checked app${withMtp ? '' : ', no MTP component'}`
}

const notes = []
if (!fs.existsSync(appResources)) fail(`no checked app at ${appResources}`)
if (!fs.existsSync(zipFile)) fail(`missing ${zipFile}`)
else notes.push(inspect('zip', spawnSync('unzip', ['-Z1', zipFile], { encoding: 'utf8', maxBuffer: 1 << 28 }).stdout.split('\n').filter(Boolean)))

if (!fs.existsSync(dmgFile)) fail(`missing ${dmgFile}`)
else {
  const mount = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-dmg-check-'))
  const attach = spawnSync('hdiutil', ['attach', '-nobrowse', '-readonly', '-noverify', '-noautoopen', '-mountpoint', mount, dmgFile], { encoding: 'utf8' })
  if (attach.status !== 0) fail(`could not mount the dmg: ${(attach.stderr || attach.stdout).trim().split('\n')[0]}`)
  else {
    try {
      const all = []
      const walk = (d, rel) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.posix.join(rel, e.name); all.push(p); if (e.isDirectory() && !e.isSymbolicLink() && !/\.lproj$/.test(e.name)) walk(path.join(d, e.name), p) } }
      walk(mount, '')
      notes.push(inspect('dmg', all.map(p => p.replace(/^\//, ''))))
    } finally { spawnSync('hdiutil', ['detach', mount, '-force'], { stdio: 'ignore' }); fs.rmSync(mount, { recursive: true, force: true }) }
  }
}

for (const n of notes) console.log(`  ${n}`)
if (failures.length) { console.error(`\n${failures.length} archive problem(s):`); for (const f of failures) console.error(`  FAIL ${f}`); process.exit(1) }
console.log('\nArchive check passed.')
