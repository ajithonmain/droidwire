#!/usr/bin/env node
// Package check: fails (exit 1) if a built Droidwire.app is missing something it
// advertises, or would only run on the machine that built it.
//
//   node scripts/check-package.mjs [path/to/Droidwire.app] [--require-signed]
//
// Checks
//   * every required executable/library/notice is inside Contents/Resources
//   * every Mach-O in the bundle has the expected CPU architecture and does not
//     require a newer macOS than the supported floor (native/versions.env)
//   * our staged binaries depend only on system libraries or on libraries that
//     are actually present next to them (@loader_path), never Homebrew paths
//   * no developer-machine paths are embedded in the staged binaries
//   * app.asar contains no native addon / node_modules copy and stays small
//   * Info.plist's minimum macOS matches the floor
//   * code-signature state is reported; --require-signed demands a Developer ID
//     signature, hardened runtime and a stapled notarization ticket
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const desktop = path.resolve(here, '..')
const repo = path.resolve(desktop, '..')
const args = process.argv.slice(2)
const requireSigned = args.includes('--require-signed')
const appPath = path.resolve(args.find(a => !a.startsWith('--')) ?? path.join(desktop, 'release', `mac-${process.arch === 'arm64' ? 'arm64' : 'x64'}`, 'Droidwire.app'))

const versions = Object.fromEntries(
  fs.readFileSync(path.join(repo, 'native', 'versions.env'), 'utf8')
    .split('\n').map(l => l.replace(/#.*/, '').trim()).filter(Boolean)
    .map(l => l.split('=').map(s => s.trim())),
)
const FLOOR = versions.DEPLOYMENT_TARGET
const EXPECT_ARCH = process.env.NATIVE_ARCH ?? 'arm64'
const MAX_ASAR_BYTES = 50 * 1024 * 1024

const failures = []
const notes = []
const fail = msg => failures.push(msg)

// stdout + stderr together (codesign reports on stderr)
const run = (cmd, a) => {
  const r = spawnSync(cmd, a, { encoding: 'utf8' })
  return `${r.stdout ?? ''}${r.stderr ?? ''}`
}
const cmpVersion = (a, b) => {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

if (!fs.existsSync(appPath)) {
  console.error(`No app bundle at ${appPath}. Build one first (npm run dist:release).`)
  process.exit(1)
}
const resources = path.join(appPath, 'Contents', 'Resources')
console.log(`Checking ${appPath}\n  floor macOS ${FLOOR}, arch ${EXPECT_ARCH}\n`)

// --- required files -------------------------------------------------------------------------
const REQUIRED = [
  ['adb', 'bundled adb (USB and wireless modes)'],
  ['libusb-1.0.0.dylib', 'libusb (adb and libmtp)'],
  ['libmtp.9.dylib', 'libmtp (MTP mode)'],
  ['luck-node-mtp.node', 'MTP native addon'],
  ['mtp-worker.cjs', 'MTP worker'],
  ['droidwire-thumb', 'native video thumbnails'],
  ['THIRD-PARTY-NOTICES.md', 'notices shown in the app'],
  ['THIRD-PARTY-LICENSES.txt', 'full license texts for bundled components'],
  ['ELECTRON-LICENSE.txt', 'Electron license (required to accompany every Electron app)'],
  ['LICENSES.chromium.html', 'Chromium third-party notices (required to accompany every Electron app)'],
  ['app.asar', 'application code'],
]
for (const [file, why] of REQUIRED) {
  if (!fs.existsSync(path.join(resources, file))) fail(`missing Resources/${file} (${why})`)
}
for (const exe of ['adb', 'droidwire-thumb']) {
  const p = path.join(resources, exe)
  if (fs.existsSync(p) && !(fs.statSync(p).mode & 0o111)) fail(`Resources/${exe} is not executable`)
}

// --- Mach-O inventory ----------------------------------------------------------------------------
function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isSymbolicLink()) continue
    if (e.isDirectory()) yield* walk(p)
    else if (e.isFile()) yield p
  }
}
const isMachO = file => {
  let fd
  try {
    fd = fs.openSync(file, 'r')
    const b = Buffer.alloc(4)
    if (fs.readSync(fd, b, 0, 4, 0) < 4) return false
    const m = b.readUInt32BE(0)
    return [0xfeedfacf, 0xcffaedfe, 0xcafebabe, 0xbebafeca].includes(m)
  } catch { return false } finally { if (fd !== undefined) fs.closeSync(fd) }
}
const minosOf = file => run('otool', ['-l', file]).match(/LC_BUILD_VERSION[\s\S]*?minos\s+([\d.]+)/)?.[1] ?? null

const machos = [...walk(path.join(appPath, 'Contents'))].filter(isMachO)
let checkedArch = 0
for (const f of machos) {
  const rel = path.relative(appPath, f)
  const archs = run('lipo', ['-archs', f]).trim()
  if (archs && archs !== EXPECT_ARCH && !archs.split(' ').includes(EXPECT_ARCH)) fail(`${rel}: architectures [${archs}], expected ${EXPECT_ARCH}`)
  const minos = minosOf(f)
  if (minos && cmpVersion(minos, FLOOR) > 0) fail(`${rel}: requires macOS ${minos}, above the supported floor ${FLOOR}`)
  checkedArch++
}
notes.push(`${checkedArch} Mach-O files checked for architecture and minimum macOS`)

// Staged binaries: dependencies and embedded paths
const staged = fs.readdirSync(resources).map(n => path.join(resources, n)).filter(p => fs.statSync(p).isFile() && isMachO(p))
for (const f of staged) {
  const rel = `Resources/${path.basename(f)}`
  const deps = run('otool', ['-L', f]).split('\n').slice(1).map(l => l.trim().split(' ')[0]).filter(Boolean)
  for (const dep of deps) {
    if (dep.startsWith('/usr/lib/') || dep.startsWith('/System/Library/')) continue
    const m = dep.match(/^@(?:loader_path|executable_path)\/(.+)$/)
    if (m) {
      // adb sits in Resources/, so both prefixes resolve to Resources/<name>
      if (!fs.existsSync(path.join(resources, m[1]))) fail(`${rel}: ${dep} does not exist in the bundle`)
      continue
    }
    fail(`${rel}: depends on ${dep}, which will not exist on a user's Mac`)
  }
  const text = fs.readFileSync(f).toString('latin1')
  for (const bad of ['/opt/homebrew', '/usr/local/Cellar', '/Users/', '/private/tmp/', '/native-build/.out']) {
    if (text.includes(bad)) fail(`${rel}: contains the build-machine path fragment "${bad}"`)
  }
}
notes.push(`${staged.length} staged binaries checked for dependency resolution and embedded paths`)

// The MTP addon must carry our patch: without it a phone held by another app crashes the worker
const addon = path.join(resources, 'luck-node-mtp.node')
if (fs.existsSync(addon) && !fs.readFileSync(addon).includes('its USB interface is held by another process')) {
  fail('Resources/luck-node-mtp.node was built without patches/luck-node-mtp+1.0.0.patch')
}

// --- app.asar ----------------------------------------------------------------------------------------
const asarFile = path.join(resources, 'app.asar')
if (fs.existsSync(asarFile)) {
  const size = fs.statSync(asarFile).size
  if (size > MAX_ASAR_BYTES) fail(`app.asar is ${(size / 1048576).toFixed(0)} MB (limit ${MAX_ASAR_BYTES / 1048576} MB) - something large was packed by mistake`)
  try {
    const asar = createRequire(path.join(repo, 'package.json'))('@electron/asar')
    const entries = asar.listPackage(asarFile)
    for (const e of entries) {
      if (/luck-node-mtp|\/native\/|\.node$/.test(e) && !e.includes('@node-usb')) fail(`app.asar contains ${e}; native code must be loaded from Resources/`)
      if (/^\/(release|dist|\.git)\//.test(e)) fail(`app.asar contains ${e}`)
    }
    notes.push(`app.asar: ${(size / 1024).toFixed(0)} KB, ${entries.length} entries`)
  } catch (e) {
    fail(`could not inspect app.asar: ${e.message}`)
  }
}

// --- Info.plist -----------------------------------------------------------------------------------------
const plist = run('plutil', ['-extract', 'LSMinimumSystemVersion', 'raw', path.join(appPath, 'Contents', 'Info.plist')]).trim()
if (plist !== FLOOR) fail(`Info.plist LSMinimumSystemVersion is "${plist}", expected ${FLOOR} (set build.mac.minimumSystemVersion)`)

// --- signature ---------------------------------------------------------------------------------------------
const sigInfo = run('codesign', ['-dv', '--verbose=4', appPath])
const adhoc = /Signature=adhoc/.test(sigInfo) || /code object is not signed/i.test(sigInfo)
const developerId = /Authority=Developer ID Application/.test(sigInfo)
const hardened = /flags=0x[0-9a-f]+\([^)]*runtime/.test(sigInfo)
const verify = run('codesign', ['--verify', '--deep', '--strict', appPath]).trim()
let stapled = false
if (developerId) stapled = /validate action worked/i.test(run('xcrun', ['stapler', 'validate', appPath]))
const status = developerId
  ? `Developer ID signed${hardened ? ', hardened runtime' : ', NO hardened runtime'}${stapled ? ', notarization ticket stapled' : ', not notarized/stapled'}`
  : adhoc ? 'ad-hoc / unsigned (users must clear the Gatekeeper quarantine themselves)' : 'signed with a non-distribution identity'
notes.push(`signature: ${status}`)
if (verify) (developerId || requireSigned ? fail : x => notes.push(x))(`codesign --verify: ${verify.split('\n')[0]}`)
if (requireSigned) {
  if (!developerId) fail('--require-signed: not signed with a Developer ID Application identity')
  if (developerId && !hardened) fail('--require-signed: hardened runtime is not enabled')
  if (developerId && !stapled) fail('--require-signed: no stapled notarization ticket')
}

// --- report ----------------------------------------------------------------------------------------------------
for (const n of notes) console.log(`  ${n}`)
if (failures.length) {
  console.error(`\n${failures.length} problem(s):`)
  for (const f of failures) console.error(`  FAIL ${f}`)
  process.exit(1)
}
console.log('\nPackage check passed.')
