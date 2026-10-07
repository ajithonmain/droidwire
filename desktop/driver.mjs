// Headless Electron smoke test: launches the BUILT app (run `npm run build`
// first) with a throwaway profile, checks the first-run experience and the
// renderer security boundary, and saves a screenshot.
//
//   npm run smoke                 offline: asserts the app makes no network connections
//   npm run smoke -- --allow-update-check
//                                 lets the single GitHub release lookup happen and
//                                 asserts it is the only host contacted
//
// This verifies UI start-up only. It cannot verify USB, wireless ADB or MTP
// transfers - there is no phone in CI; see CONTRIBUTING.md for the hardware checklist.
import { _electron as electron } from 'playwright-core'
import { createRequire } from 'node:module'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const electronBin = require('electron') // resolves to the Electron executable path
const mainEntry = path.join(here, 'out', 'main', 'index.js')
const shotDir = process.env.DROIDWIRE_SHOT_DIR ?? path.join(os.tmpdir(), 'droidwire-shots')
const allowUpdateCheck = process.argv.includes('--allow-update-check')

if (!fs.existsSync(mainEntry)) {
  console.error(`Missing ${mainEntry} - run \`npm run build\` first.`)
  process.exit(1)
}
fs.mkdirSync(shotDir, { recursive: true })

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'droidwire-smoke-profile-'))

// Electron must not run as plain Node, and must not inherit that flag from a parent
const env = { ...process.env, NODE_ENV: 'production' }
delete env.ELECTRON_RUN_AS_NODE
if (!allowUpdateCheck) env.DROIDWIRE_OFFLINE = '1'

const failures = []
const check = (name, fn) => Promise.resolve().then(fn).then(
  () => console.log(`  ok   ${name}`),
  err => { failures.push(name); console.log(`  FAIL ${name}: ${err.message}`) },
)

async function main() {
  let hosts = []
  console.log(`Launching Droidwire (${allowUpdateCheck ? 'update check allowed' : 'offline'})...`)
  const app = await electron.launch({
    executablePath: electronBin,
    args: [mainEntry, `--user-data-dir=${profile}`],
    env,
    timeout: 30_000,
  })

  try {
    // Record every outbound socket the main process opens from here on. The
    // only network activity the app starts on its own is the update check,
    // which begins after the renderer has mounted - well after this hook.
    await app.evaluate(() => {
      const net = process.getBuiltinModule('net')
      const seen = (globalThis.__dwConnections = ['__recorder__'])
      const original = net.Socket.prototype.connect
      net.Socket.prototype.connect = function (...args) {
        const first = args[0]
        const opts = typeof first === 'object' && first !== null ? first : { port: first, host: args[1] }
        seen.push(String(opts.host ?? opts.path ?? 'unknown'))
        return original.apply(this, args)
      }
    })
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(allowUpdateCheck ? 4000 : 2500)
    await page.screenshot({ path: path.join(shotDir, '01-first-run.png') })
    const bodyText = await page.evaluate(() => document.body?.innerText ?? '')

    await check('fresh profile opens straight into the app (no registration gate)', async () => {
      assert.ok(bodyText.includes('Droidwire'), `unexpected body: ${bodyText.slice(0, 120)}`)
      assert.equal(await page.locator('input[type="email"], input[type="password"]').count(), 0)
      assert.ok(!/email|register|sign ?up|beta tester/i.test(bodyText), 'body mentions registration')
    })

    await check('renderer exposes only the typed bridge', async () => {
      const info = await page.evaluate(() => ({
        hasBridge: typeof window.droidwire === 'object',
        keys: Object.keys(window.droidwire ?? {}),
        hasRequire: typeof window.require !== 'undefined',
        hasProcess: typeof window.process !== 'undefined',
      }))
      assert.ok(info.hasBridge)
      assert.ok(!info.hasRequire && !info.hasProcess, 'Node leaked into the renderer')
      for (const gone of ['getBetaSignup', 'registerBeta', 'fetchBetaMessages', 'readLocalFile', 'openExternalUrl']) {
        assert.ok(!info.keys.includes(gone), `${gone} should no longer exist`)
      }
      for (const wanted of ['moveFile', 'pullFile', 'previewFile', 'checkUpdateSilent']) {
        assert.ok(info.keys.includes(wanted), `${wanted} missing from the bridge`)
      }
    })

    await check('IPC rejects unknown persistence keys and malformed arguments', async () => {
      const r = await page.evaluate(async () => {
        const out = {}
        try { await window.droidwire.persistGet('../settings'); out.traversal = 'accepted' } catch { out.traversal = 'rejected' }
        try { await window.droidwire.persistGet('beta-signup'); out.legacy = 'accepted' } catch { out.legacy = 'rejected' }
        try { await window.droidwire.listFiles('relative/path'); out.relative = 'accepted' } catch { out.relative = 'rejected' }
        try { await window.droidwire.deleteLocalFile('/etc/hosts'); out.localDelete = 'accepted' } catch { out.localDelete = 'rejected' }
        return out
      })
      assert.deepEqual(r, { traversal: 'rejected', legacy: 'rejected', relative: 'rejected', localDelete: 'rejected' })
    })

    await check('renderer cannot navigate away or open windows', async () => {
      const before = page.url()
      await page.evaluate(() => { location.href = 'https://example.com/' })
      await page.waitForTimeout(500)
      assert.equal(page.url(), before)
      const opened = await page.evaluate(() => window.open('https://example.com/') === null)
      assert.ok(opened, 'window.open should be denied')
      assert.equal(app.windows().length, 1)
    })

    await check('no registration file is written', async () => {
      assert.ok(!fs.existsSync(path.join(profile, 'beta-signup.json')))
    })
    hosts = [...new Set(await app.evaluate(() => globalThis.__dwConnections ?? []))]
  } finally {
    await app.close()
  }
  await check('network recorder was active in the app process', async () => {
    assert.ok(hosts.includes('__recorder__'), 'recorder did not load; the network checks below would be meaningless')
  })
  const external = hosts.filter(h => !['127.0.0.1', 'localhost', '::1', 'unknown', '__recorder__'].includes(h))
  await check(allowUpdateCheck ? 'only api.github.com is contacted' : 'no outbound connections at all', async () => {
    const expected = allowUpdateCheck ? external.filter(h => h !== 'api.github.com') : external
    assert.deepEqual(expected, [], `unexpected hosts: ${external.join(', ')}`)
    if (allowUpdateCheck) assert.ok(external.includes('api.github.com'), 'the update check never ran')
  })
  console.log(`  hosts contacted: ${external.length ? external.join(', ') : '(none)'}`)

  fs.rmSync(profile, { recursive: true, force: true })
  if (failures.length) {
    console.error(`\n${failures.length} check(s) failed. Screenshot: ${shotDir}`)
    process.exit(1)
  }
  console.log(`\nSmoke test passed. Screenshot: ${path.join(shotDir, '01-first-run.png')}`)
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1) })
