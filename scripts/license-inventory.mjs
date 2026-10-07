#!/usr/bin/env node
// Generates the license material for exactly what Droidwire ships.
//
//   node scripts/license-inventory.mjs [--native-licenses <dir>]
//
// Writes:
//   desktop/resources/THIRD-PARTY-LICENSES.txt   full texts, shipped inside the app
//                                                (git-ignored; regenerated at packaging time)
//   docs/third-party-inventory.md                human-readable table (committed)
//
// What is covered
//   * JavaScript the app actually contains: the `usb` module (loaded at runtime) and
//     everything the renderer bundle pulls in (react, react-dom, qrcode), with their
//     transitive dependencies, resolved from node_modules.
//   * Electron (and a pointer to Chromium's own notices, which ship with Electron).
//   * The native components built by native/build.sh, from the license files collected
//     into <native-licenses>, plus their pinned versions.
//   * luck-node-mtp (MTP addon) and the artwork attribution.
// Development tooling is not shipped and is not listed here; see
// `npm run license:scan` for a scan of the whole dependency tree.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const desktopDir = path.join(root, 'desktop')
const req = createRequire(path.join(desktopDir, 'package.json'))
const args = process.argv.slice(2)
const nativeDir = args.includes('--native-licenses') ? path.resolve(args[args.indexOf('--native-licenses') + 1]) : null

// --- JavaScript dependencies ----------------------------------------------------------------------
const desktopPkg = JSON.parse(fs.readFileSync(path.join(desktopDir, 'package.json'), 'utf8'))
// The renderer's dependencies are compiled into out/renderer, so they ship even
// though package.json lists them as devDependencies.
const RENDERER_BUNDLED = ['react', 'react-dom', 'qrcode']
const roots = [...Object.keys(desktopPkg.dependencies ?? {}), ...RENDERER_BUNDLED]

function resolvePkgDir(name, fromDir) {
  try {
    const entry = createRequire(path.join(fromDir, 'package.json')).resolve(`${name}/package.json`)
    return path.dirname(entry)
  } catch {
    // packages with an "exports" map that hides package.json: walk up node_modules instead
    let dir = fromDir
    while (dir !== path.dirname(dir)) {
      const candidate = path.join(dir, 'node_modules', name)
      if (fs.existsSync(path.join(candidate, 'package.json'))) return candidate
      dir = path.dirname(dir)
    }
    return null
  }
}

const seen = new Map()
function visit(name, fromDir, optional = false) {
  const dir = resolvePkgDir(name, fromDir)
  if (!dir) {
    if (!optional) console.warn(`warning: could not resolve ${name} from ${fromDir}`)
    return
  }
  if (seen.has(dir)) return
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
  const licenseField = typeof pkg.license === 'string' ? pkg.license
    : pkg.license?.type ?? (Array.isArray(pkg.licenses) ? pkg.licenses.map(l => l.type).join(' OR ') : 'UNKNOWN')
  const files = fs.readdirSync(dir).filter(f => /^(licen[cs]e|copying|notice)/i.test(f) && fs.statSync(path.join(dir, f)).isFile())
  seen.set(dir, {
    name: pkg.name, version: pkg.version, license: licenseField, homepage: pkg.homepage ?? pkg.repository?.url ?? '',
    texts: files.map(f => fs.readFileSync(path.join(dir, f), 'utf8').trim()),
  })
  for (const dep of Object.keys(pkg.dependencies ?? {})) visit(dep, dir)
  for (const dep of Object.keys(pkg.optionalDependencies ?? {})) {
    // only the build machine's platform package is installed, and only it ships
    visit(dep, dir, true)
  }
}
for (const r of roots) visit(r, desktopDir)
const jsPackages = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name))

// --- native components -------------------------------------------------------------------------------------
const versionsFile = path.join(root, 'native', 'versions.env')
const versions = Object.fromEntries(
  fs.readFileSync(versionsFile, 'utf8').split('\n').map(l => l.replace(/\s+#.*$/, '').trim()).filter(l => l && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)] }),
)
const NATIVE = [
  { name: 'adb (Android Debug Bridge)', version: `platform-tools ${versions.ANDROID_TOOLS_VERSION}, built from AOSP source with android-tools`, license: 'Apache-2.0 (plus the third-party code below, statically linked)', files: ['android-tools-LICENSE.txt', 'aosp-adb-NOTICE.txt', 'aosp-libbase-NOTICE.txt'], source: versions.ANDROID_TOOLS_URL },
  { name: 'BoringSSL (inside adb)', version: 'vendored with android-tools', license: 'OpenSSL / ISC / SSLeay-style (see text)', files: ['aosp-boringssl-LICENSE.txt'], source: 'https://boringssl.googlesource.com/boringssl' },
  { name: '{fmt} (inside adb)', version: 'vendored with android-tools', license: 'MIT', files: ['aosp-fmtlib-LICENSE.txt'], source: 'https://github.com/fmtlib/fmt' },
  { name: 'libusb', version: versions.LIBUSB_VERSION, license: 'LGPL-2.1-or-later (shared library: you may replace it)', files: ['libusb-COPYING.txt'], source: versions.LIBUSB_URL },
  { name: 'libmtp', version: versions.LIBMTP_VERSION, license: 'LGPL-2.1-or-later (shared library: you may replace it)', files: ['libmtp-COPYING.txt'], source: versions.LIBMTP_URL },
  { name: 'zstd (inside adb)', version: versions.ZSTD_VERSION, license: 'BSD-3-Clause (dual-licensed; BSD option used)', files: ['zstd-LICENSE.txt'], source: versions.ZSTD_URL },
  { name: 'LZ4 (inside adb)', version: versions.LZ4_VERSION, license: 'BSD-2-Clause (library)', files: ['lz4-LICENSE.txt'], source: versions.LZ4_URL },
  { name: 'Brotli (inside adb)', version: versions.BROTLI_VERSION, license: 'MIT', files: ['brotli-LICENSE.txt'], source: versions.BROTLI_URL },
  { name: 'PCRE2 (inside adb)', version: versions.PCRE2_VERSION, license: 'BSD-3-Clause with PCRE2 exception', files: ['pcre2-LICENCE.md.txt'], source: versions.PCRE2_URL },
  { name: 'Abseil (inside adb)', version: versions.ABSEIL_VERSION, license: 'Apache-2.0', files: ['abseil-LICENSE.txt'], source: versions.ABSEIL_URL },
  { name: 'Protocol Buffers (inside adb)', version: versions.PROTOBUF_VERSION, license: 'BSD-3-Clause', files: ['protobuf-LICENSE.txt'], source: versions.PROTOBUF_URL },
  { name: 'googletest header gtest_prod.h (compile-time only, nothing linked)', version: versions.GOOGLETEST_VERSION, license: 'BSD-3-Clause', files: ['googletest-LICENSE.txt'], source: versions.GOOGLETEST_URL },
  { name: 'droidwire-thumb (video poster frames)', version: 'part of Droidwire', license: 'MIT (Droidwire); uses only macOS system frameworks', files: [], source: 'native/thumb/droidwire-thumb.swift in the Droidwire repository' },
]

const LUCK_NODE_MTP = `luck-node-mtp 1.0.0 (MTP native addon, with a small local patch)
Declared license: ISC (package.json "license"). Author: lucksoft. Source: https://github.com/lucksoft-yungui/luck-node-mtp
The upstream repository contains no LICENSE file and names no copyright holder or year beyond the
"author" field, so the copyright line below follows that field; no year is claimed.

ISC License

Copyright (c) lucksoft

Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee
is hereby granted, provided that the above copyright notice and this permission notice appear in all
copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS
SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE
AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE
OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

The addon includes a copy of libmtp's header (libmtp.h, LGPL-2.1-or-later, (C) Linus Walleij and others)
and links the libmtp shared library listed above.`

const ROBOT = `The Android robot is reproduced or modified from work created and shared by Google and used
according to terms described in the Creative Commons 3.0 Attribution License
(https://creativecommons.org/licenses/by/3.0/). Android is a trademark of Google LLC. Droidwire is not
affiliated with or endorsed by Google.`

// --- full text file ---------------------------------------------------------------------------------------------
const rule = '='.repeat(78)
const out = []
out.push('Droidwire - third-party licenses', '',
  'Droidwire itself is MIT licensed (see the LICENSE file in the project repository).',
  'The components below are distributed inside the app under their own licenses.',
  'This file is generated by scripts/license-inventory.mjs for the exact build it ships with.', '')

out.push(rule, 'Electron and Chromium', rule,
  `Electron ${desktopPkg.devDependencies.electron.replace('^', '')} - MIT. Electron bundles Chromium and many other components; their notices ship with Electron`,
  'in the app bundle as Resources/LICENSES.chromium.html (Electron\'s own license is Resources/ELECTRON-LICENSE.txt).', '')
const electronLicense = path.join(root, 'node_modules', 'electron', 'dist', 'LICENSE')
if (fs.existsSync(electronLicense)) out.push(fs.readFileSync(electronLicense, 'utf8').trim(), '')

out.push(rule, 'Native components', rule, '')
let missingNative = 0
for (const n of NATIVE) {
  out.push(`--- ${n.name}`, `Version: ${n.version}`, `License: ${n.license}`, `Source: ${n.source}`, '')
  for (const f of n.files) {
    const p = nativeDir ? path.join(nativeDir, f) : null
    if (p && fs.existsSync(p)) out.push(fs.readFileSync(p, 'utf8').trim(), '')
    else if (nativeDir) { missingNative++; out.push(`(license file ${f} not found in the build output)`, '') }
  }
}
if (nativeDir && missingNative > 0) console.warn(`warning: ${missingNative} native license file(s) were not found in ${nativeDir}`)
out.push('LGPL notice: libusb and libmtp are shipped as separate shared libraries (libusb-1.0.0.dylib, libmtp.9.dylib in the app\'s',
  'Resources folder). You may replace them with your own build of the same libraries. Their complete source is at the URLs above;',
  'the exact build recipe is native/build.sh in the Droidwire repository.', '')

out.push(rule, 'luck-node-mtp', rule, LUCK_NODE_MTP, '')
out.push(rule, 'Artwork', rule, ROBOT, '')

out.push(rule, 'JavaScript packages shipped in the app', rule, '')
for (const p of jsPackages) {
  out.push(`--- ${p.name} ${p.version} - ${p.license}`, p.homepage, '')
  for (const t of p.texts) out.push(t, '')
}

const textPath = path.join(desktopDir, 'resources', 'THIRD-PARTY-LICENSES.txt')
fs.writeFileSync(textPath, out.join('\n'))
console.log(`wrote ${path.relative(root, textPath)} (${jsPackages.length} JS packages, ${NATIVE.length} native components)`)

// --- committed inventory --------------------------------------------------------------------------------------------
const md = []
md.push('# Third-party inventory of the distributed app', '',
  'Generated by `scripts/license-inventory.mjs` from the exact dependency tree and pinned native sources.',
  'Development-only tooling is not shipped and is covered by `npm run license:scan`. Full license texts are in',
  '`THIRD-PARTY-LICENSES.txt` inside the app. Droidwire itself is MIT.', '',
  '## Native components (built by `native/build.sh`, pinned in `native/versions.env`)', '',
  '| Component | Version | License | How it is shipped |', '|---|---|---|---|')
const how = n => /libusb|libmtp/.test(n.name) ? 'separate shared library (replaceable)' : /droidwire-thumb/.test(n.name) ? 'separate executable' : /inside adb|BoringSSL/.test(n.name) ? 'statically linked into adb' : 'separate executable'
for (const n of NATIVE) md.push(`| ${n.name} | ${n.version} | ${n.license} | ${how(n)} |`)
md.push('', '## Runtime and bundled JavaScript', '', '| Package | Version | License |', '|---|---|---|')
md.push(`| electron (runtime; Chromium notices ship with it) | ${desktopPkg.devDependencies.electron.replace('^', '')} | MIT |`)
for (const p of jsPackages) md.push(`| ${p.name} | ${p.version} | ${p.license} |`)
md.push('', '## Other', '',
  '- **luck-node-mtp** 1.0.0 (MTP addon, patched): declared ISC; upstream ships no license file (see `docs/LICENSING.md`).',
  '- **Android robot artwork**: CC BY 3.0 (Google); attribution is in the README, the app notices and the site.',
  '- **Fonts**: none are bundled or downloaded.', '')
fs.writeFileSync(path.join(root, 'docs', 'third-party-inventory.md'), md.join('\n'))
console.log('wrote docs/third-party-inventory.md')

const unknown = jsPackages.filter(p => !p.license || /UNKNOWN|UNLICENSED/.test(p.license))
if (unknown.length) {
  console.error(`packages without a declared license: ${unknown.map(p => p.name).join(', ')}`)
  process.exit(1)
}
