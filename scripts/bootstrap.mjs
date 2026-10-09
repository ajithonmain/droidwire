#!/usr/bin/env node
// Dependency install for contributors.
//
//   node scripts/bootstrap.mjs             same as `npm ci`: no MTP addon, no libmtp, nothing to compile
//   node scripts/bootstrap.mjs --with-mtp  additionally installs, patches and builds luck-node-mtp
//                                          (needs `brew install libmtp libusb` and the Xcode command line tools)
//
// The release configuration ships no MTP, so luck-node-mtp is deliberately NOT in any package.json: a plain
// `npm ci` on a clean Mac must not try to compile a native addon against libmtp. Only --with-mtp brings it in,
// as an unsaved install pinned to the version patches/luck-node-mtp+1.0.0.patch applies to.
//
// --no-mtp is accepted and does nothing (it was the default-off switch in earlier revisions).

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildEnvFor, findLibmtpPrefix } from './lib/libmtp.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const withMtp = process.argv.includes('--with-mtp') && !process.argv.includes('--no-mtp')
const install = fs.existsSync(path.join(root, 'package-lock.json')) ? 'ci' : 'install'

function run(cmd, args, env = {}) {
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

if (!withMtp) {
  run('npm', [install])
  console.log('\nDone (no MTP addon; USB/ADB and Wi-Fi only). Next: npm run verify   (typecheck, tests, build)')
  process.exit(0)
}

const prefix = findLibmtpPrefix()
if (!prefix) {
  console.error('--with-mtp needs libmtp: brew install libmtp libusb (or set LIBMTP_PREFIX). Nothing was installed.')
  process.exit(1)
}
console.log(`libmtp found at ${prefix} - installing with the MTP addon`)
run('npm', [install])
// --no-save keeps the addon out of package.json and the lockfile; --ignore-scripts skips its source-build
// fallback so the build below is the only compile, against the libmtp found above
run('npm', ['install', '--no-save', '--ignore-scripts', 'luck-node-mtp@1.0.0'])
run('npx', ['patch-package'])
run(process.execPath, [path.join(root, 'scripts', 'rebuild-mtp.mjs')], buildEnvFor(prefix))
console.log('\nDone (with the MTP addon). Next: npm run verify')
