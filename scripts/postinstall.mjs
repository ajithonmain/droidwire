// Runs after `npm install`: apply the local luck-node-mtp patch, then build the
// addon. Skipped when the addon is not installed or DROIDWIRE_SKIP_MTP=1, so
// `node scripts/bootstrap.mjs --no-mtp` installs cleanly without libmtp.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

if (process.env.DROIDWIRE_SKIP_MTP === '1' || !fs.existsSync(path.join(root, 'node_modules', 'luck-node-mtp'))) {
  console.log('Skipping the MTP addon (not installed or DROIDWIRE_SKIP_MTP=1).')
  process.exit(0)
}

const patch = spawnSync('npx', ['patch-package'], { cwd: root, stdio: 'inherit' })
if (patch.status !== 0) process.exit(patch.status ?? 1)

const build = spawnSync(process.execPath, [path.join(root, 'scripts', 'rebuild-mtp.mjs'), '--soft'], { cwd: root, stdio: 'inherit' })
process.exit(build.status ?? 0)
