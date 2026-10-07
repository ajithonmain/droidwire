#!/usr/bin/env node
// Packages the app with electron-builder and then checks the result.
//
// Signing mode is decided from the environment, and stated loudly:
//   * Developer ID identity present (CSC_LINK, or one in the login keychain)
//       -> signed with the hardened runtime
//       * and notarization credentials present -> notarized and stapled
//   * no identity -> an UNSIGNED build: macOS Gatekeeper will block the first
//     launch of a downloaded copy until the user clears the quarantine flag.
//
// Notarization credentials (any one set; see electron-builder's mac docs):
//   APPLE_API_KEY + APPLE_API_KEY_ID + APPLE_API_ISSUER     (App Store Connect API key)
//   APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID
//   APPLE_KEYCHAIN + APPLE_KEYCHAIN_PROFILE
// Nothing here reads, prints or stores credentials; they are only passed through
// the environment to electron-builder.
//
//   node scripts/dist.mjs                    package whatever the environment allows
//   node scripts/dist.mjs --require-signed   fail unless the result is Developer ID signed + notarized
import { spawnSync, execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const requireSigned = process.argv.includes('--require-signed')
const env = { ...process.env }

const haveIdentity = (() => {
  if (env.CSC_LINK) return true
  try {
    return /Developer ID Application/.test(execFileSync('security', ['find-identity', '-v', '-p', 'codesigning'], { encoding: 'utf8' }))
  } catch { return false }
})()
const haveNotary = !!((env.APPLE_API_KEY && env.APPLE_API_KEY_ID && env.APPLE_API_ISSUER)
  || (env.APPLE_ID && env.APPLE_APP_SPECIFIC_PASSWORD && env.APPLE_TEAM_ID)
  || (env.APPLE_KEYCHAIN && env.APPLE_KEYCHAIN_PROFILE))

const builderArgs = ['electron-builder', '--publish', 'never']
let mode
if (!haveIdentity) {
  // Ad-hoc signature only: gives the bundle a valid seal (required on Apple Silicon) without
  // pretending to be a distribution signature. The hardened runtime is off because its library
  // validation would refuse to load our ad-hoc-signed libraries.
  builderArgs.push('-c.mac.identity=null', '-c.mac.hardenedRuntime=false')
  env.DROIDWIRE_ADHOC_SIGN = '1' // see scripts/after-pack.cjs
  mode = 'UNSIGNED / ad-hoc (no Developer ID identity found)'
} else if (!haveNotary) {
  mode = 'signed with Developer ID, NOT notarized (no notarization credentials in the environment)'
} else {
  builderArgs.push('-c.mac.notarize=true')
  mode = 'signed with Developer ID and submitted for notarization'
}
console.log(`\nPackaging: ${mode}\n`)
if (requireSigned && !(haveIdentity && haveNotary)) {
  console.error('--require-signed was given but signing/notarization credentials are not available. Nothing was built.')
  process.exit(1)
}

const build = spawnSync('npx', builderArgs, { cwd: desktop, stdio: 'inherit', env })
if (build.status !== 0) process.exit(build.status ?? 1)

const check = spawnSync(process.execPath, [path.join(desktop, 'scripts', 'check-package.mjs'), ...(requireSigned ? ['--require-signed'] : [])], { cwd: desktop, stdio: 'inherit' })
process.exit(check.status ?? 1)
