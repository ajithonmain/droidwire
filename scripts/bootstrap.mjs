#!/usr/bin/env node
// One-command dependency install for contributors:   node scripts/bootstrap.mjs
//
// Why this exists: the luck-node-mtp dependency compiles a native addon during
// `npm install`, and that compile fails unless the compiler can find libmtp -
// which Homebrew keeps outside the default search path. This script finds
// libmtp, exposes it to the build, then runs `npm ci` (or `npm install` when
// there is no lockfile). The root postinstall then patches and rebuilds the addon.
//
// Without libmtp it installs everything else and skips the addon: Droidwire
// then runs over USB ADB and wireless ADB, with MTP reporting itself unavailable.
//
//   node scripts/bootstrap.mjs            auto-detect
//   node scripts/bootstrap.mjs --no-mtp   skip the MTP addon even if libmtp exists

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildEnvFor, findLibmtpPrefix } from './lib/libmtp.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const skipMtp = process.argv.includes('--no-mtp') || process.env.DROIDWIRE_SKIP_MTP === '1'
const install = fs.existsSync(path.join(root, 'package-lock.json')) ? 'ci' : 'install'

function npm(args, env = {}) {
  const r = spawnSync('npm', args, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

const prefix = skipMtp ? null : findLibmtpPrefix()

if (prefix) {
  console.log(`libmtp found at ${prefix} - installing with MTP support`)
  npm([install], buildEnvFor(prefix))
} else {
  console.warn(skipMtp
    ? 'MTP skipped by request - installing without the native MTP addon.'
    : 'libmtp not found (brew install libmtp libusb) - installing without MTP; ADB and wireless ADB are unaffected.')
  // --ignore-scripts keeps the failing addon compile from aborting the install,
  // so run the one script the app needs (the Electron binary download) by hand.
  npm([install, '--ignore-scripts'], { DROIDWIRE_SKIP_MTP: '1' })
  const r = spawnSync(process.execPath, [path.join(root, 'node_modules', 'electron', 'install.js')], { cwd: root, stdio: 'inherit' })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

console.log('\nDone. Next: npm run verify   (typecheck, tests, build)')
