#!/usr/bin/env node
// Builds the luck-node-mtp native addon (libmtp bindings) for this machine.
//
// MTP support needs libmtp (and libusb, which libmtp links) installed:
//     brew install libmtp libusb
// plus the Xcode command line tools (a C++ compiler and python3 for node-gyp).
//
// Usage:
//   node scripts/rebuild-mtp.mjs          strict: exit 1 if MTP cannot be built
//   node scripts/rebuild-mtp.mjs --soft   used by `npm install`: print what is
//                                         missing and exit 0 - Droidwire still
//                                         works over ADB without MTP
//
// Environment:
//   LIBMTP_PREFIX   prefix containing include/libmtp.h and lib/libmtp.dylib
//                   (default: detected via Homebrew, pkg-config or the usual
//                   /opt/homebrew and /usr/local locations)
//   DROIDWIRE_SKIP_MTP=1   skip entirely
//
// The addon is N-API, so it is ABI-stable across Node.js and Electron
// versions: one build serves the Electron runtime and the host Node.

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildEnvFor, findLibmtpPrefix } from './lib/libmtp.mjs'

const soft = process.argv.includes('--soft')
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const addonDir = path.join(root, 'node_modules', 'luck-node-mtp')

function finish(code, message) {
  if (message) console[code === 0 ? 'warn' : 'error'](message)
  process.exit(soft ? 0 : code)
}

if (process.env.DROIDWIRE_SKIP_MTP === '1') finish(0, 'DROIDWIRE_SKIP_MTP=1: skipping the MTP addon build.')

if (process.platform !== 'darwin') {
  finish(0, `MTP addon build skipped: Droidwire targets macOS (this is ${process.platform}).`)
}

if (!fs.existsSync(addonDir)) {
  finish(1, 'luck-node-mtp is not installed. Run `npm install` at the repository root first.')
}

const prefix = findLibmtpPrefix()
if (!prefix) {
  finish(1, [
    'MTP support was not built: libmtp was not found.',
    '  Install it with:  brew install libmtp libusb',
    '  Then run:         npm run rebuild:mtp',
    '  (or set LIBMTP_PREFIX to a prefix containing include/libmtp.h and lib/libmtp.dylib).',
    'Droidwire still works over USB ADB and wireless ADB without MTP.',
  ].join('\n'))
}

console.log(`Building luck-node-mtp for ${process.arch} against libmtp at ${prefix}`)
const result = spawnSync('npx', ['node-gyp', 'rebuild'], {
  cwd: addonDir,
  stdio: 'inherit',
  env: { ...process.env, ...buildEnvFor(prefix) },
})

if (result.status !== 0) {
  finish(1, [
    'node-gyp failed to build luck-node-mtp.',
    '  Check that the Xcode command line tools are installed (xcode-select --install)',
    '  and that python3 is available, then run: npm run rebuild:mtp',
  ].join('\n'))
}

console.log('luck-node-mtp built: build/Release/luck-node-mtp.node')
