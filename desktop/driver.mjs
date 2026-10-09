// Headless Electron smoke test.
//
//   npm run smoke                              the BUILT dev bundle (out/main), offline
//   npm run smoke -- --allow-update-check      also allow the single GitHub release lookup
//   npm run smoke -- --app <path/to/Droidwire.app>
//                                              the PACKAGED app, run like an installed one:
//                                              minimal PATH (no Homebrew), no adb/ffmpeg
//                                              overrides, throwaway profile, offline
//
// Always run against a throwaway profile. Checks the first-run experience, the renderer
// security boundary, what the install can do (bundled adb, MTP addon, thumbnail helper),
// the menu bar window, and that failures are explained in the UI. It cannot exercise USB,
// wireless ADB or MTP transfers; real-phone coverage lives in driver-hw.mjs / driver-hw-ui.mjs
// (see docs/HARDWARE-CHECKLIST.md).
import { _electron as electron } from 'playwright-core'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const argv = process.argv.slice(2)
const flagValue = name => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined }
const allowUpdateCheck = argv.includes('--allow-update-check')
// A packaged release is built WITHOUT MTP; pass --with-mtp to check an MTP build (DROIDWIRE_BUNDLE_MTP=1) instead.
const expectMtp = argv.includes('--with-mtp')
const appBundle = flagValue('--app') ? path.resolve(flagValue('--app')) : null
const shotDir = process.env.DROIDWIRE_SHOT_DIR ?? path.join(os.tmpdir(), 'droidwire-shots')
fs.mkdirSync(shotDir, { recursive: true })

const executablePath = appBundle ? path.join(appBundle, 'Contents', 'MacOS', 'Droidwire') : require('electron')
const launchArgs = appBundle ? [] : [path.join(here, 'out', 'main', 'index.js')]
if (appBundle ? !fs.existsSync(executablePath) : !fs.existsSync(launchArgs[0])) {
  console.error(appBundle ? `No app at ${appBundle}.` : `Missing ${launchArgs[0]} - run \`npm run build\` first.`)
  process.exit(1)
}

// An installed app is launched by macOS with a bare environment, not from a developer shell
function launchEnv(extra = {}) {
  const env = appBundle
    ? { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, LANG: process.env.LANG ?? 'en_US.UTF-8' }
    : { ...process.env, NODE_ENV: 'production' }
  delete env.ELECTRON_RUN_AS_NODE // Electron must not run as plain Node
  if (!allowUpdateCheck) env.DROIDWIRE_OFFLINE = '1'
  return { ...env, ...extra }
}

const failures = []
const check = (name, fn) => Promise.resolve().then(fn).then(
  () => console.log(`  ok   ${name}`),
  err => { failures.push(name); console.log(`  FAIL ${name}: ${err.message}`) },
)

async function withApp(extraEnv, fn) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'droidwire-smoke-profile-'))
  const app = await electron.launch({
    executablePath,
    args: [...launchArgs, `--user-data-dir=${profile}`],
    env: launchEnv(extraEnv),
    timeout: 30_000,
  })
  try {
    // Record every outbound socket the main process opens from here on (the update check
    // starts after the renderer mounts, well after this hook is installed)
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
    return await fn({ app, page, profile })
  } finally {
    await app.close().catch(() => {})
    fs.rmSync(profile, { recursive: true, force: true })
  }
}

async function baseline() {
  console.log(`Launching ${appBundle ? 'PACKAGED app (minimal environment)' : 'built bundle'}, ${allowUpdateCheck ? 'update check allowed' : 'offline'}...`)
  await withApp({}, async ({ app, page, profile }) => {
    await page.waitForTimeout(allowUpdateCheck ? 4000 : 2500)
    await page.screenshot({ path: path.join(shotDir, appBundle ? '01-packaged-first-run.png' : '01-first-run.png') })
    const bodyText = await page.evaluate(() => document.body?.innerText ?? '')

    await check('fresh profile opens straight into the app (no registration gate)', async () => {
      assert.ok(bodyText.includes('Droidwire'), `unexpected body: ${bodyText.slice(0, 120)}`)
      assert.equal(await page.locator('input[type="email"], input[type="password"]').count(), 0)
      assert.ok(!/email|register|sign ?up|beta tester/i.test(bodyText), 'body mentions registration')
      // With no phone attached the picker is shown; with an authorized phone attached the app connects straight away
      assert.match(bodyText, /Connect via ADB|Connected/)
    })

    await check('renderer exposes only the typed bridge', async () => {
      const info = await page.evaluate(() => ({
        keys: Object.keys(window.droidwire ?? {}),
        hasRequire: typeof window.require !== 'undefined',
        hasProcess: typeof window.process !== 'undefined',
      }))
      assert.ok(info.keys.length > 20)
      assert.ok(!info.hasRequire && !info.hasProcess, 'Node leaked into the renderer')
      for (const gone of ['getBetaSignup', 'registerBeta', 'fetchBetaMessages', 'readLocalFile', 'openExternalUrl']) {
        assert.ok(!info.keys.includes(gone), `${gone} should no longer exist`)
      }
      for (const wanted of ['moveFile', 'pullFile', 'previewFile', 'checkUpdateSilent', 'getDiagnostics']) {
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
      assert.ok(await page.evaluate(() => window.open('https://example.com/') === null), 'window.open should be denied')
      assert.equal(app.windows().length, 1)
    })

    // What this install can actually do
    const diag = await page.evaluate(() => window.droidwire.getDiagnostics())
    console.log(`  diagnostics: adb ${diag.adb.version ?? 'NONE'} [${diag.adb.source}], mtp ${diag.mtp.excluded ? 'not included (release)' : diag.mtp.available ? 'ok' : 'UNAVAILABLE'}, native thumbs ${diag.thumbnails.native ? 'yes' : 'no'}`)
    await check('adb starts and reports its version', async () => {
      assert.equal(diag.adb.error, null, diag.adb.error ?? '')
      assert.match(diag.adb.version ?? '', /Android Debug Bridge version/)
    })
    if (appBundle && !expectMtp) {
      await check('release build: MTP is reported as deliberately not included, and no MTP worker was started', async () => {
        assert.equal(diag.mtp.excluded, true, JSON.stringify(diag.mtp))
        assert.equal(diag.mtp.available, false)
        assert.match(diag.mtp.error ?? '', /not included in this release/i)
        assert.equal(diag.mtp.addon, null)
        const workers = spawnSync('pgrep', ['-fl', 'mtp-worker']).stdout.toString().trim()
        assert.equal(workers, '', `an MTP worker is running: ${workers}`)
      })
      await check('release build: asking for MTP is refused by the main process, not just hidden in the UI', async () => {
        const r = await page.evaluate(() => window.droidwire.setConnectionType('mtp').then(() => 'accepted', e => String(e.message)))
        assert.match(r, /not included in this release/i)
        assert.equal(await page.evaluate(() => window.droidwire.getConnectionType()), 'adb', 'connection type must not change')
      })
    } else if (!appBundle && !expectMtp) {
      // A development checkout installs no MTP addon (opt-in via scripts/bootstrap.mjs --with-mtp): the app must
      // then say so cleanly instead of crashing; it is also fine if a developer has built the addon.
      await check('dev checkout: MTP is optional - the status is reported coherently without the addon', async () => {
        if (diag.mtp.available) assert.ok(diag.mtp.addon, 'MTP reported available but no addon path')
        else assert.ok((diag.mtp.error ?? '').length > 0, 'MTP unavailable without an explanation')
      })
    } else {
      await check('MTP worker loads its addon and libraries', async () => {
        assert.equal(diag.mtp.available, true, diag.mtp.error ?? '')
        assert.ok(diag.mtp.addon, 'worker did not report which addon it loaded')
      })
    }
    await check('video thumbnail helper is present', async () => {
      assert.ok(diag.thumbnails.native, 'native thumbnail helper not found')
    })

    if (appBundle) {
      const resources = path.join(appBundle, 'Contents', 'Resources')
      await check('packaged app uses ONLY its bundled components', async () => {
        assert.equal(diag.app.packaged, true)
        assert.equal(diag.adb.source, 'bundled', `adb resolved from ${diag.adb.path}`)
        assert.ok(diag.adb.path.startsWith(resources), diag.adb.path)
        if (expectMtp) assert.ok(diag.mtp.addon.startsWith(resources), `MTP addon loaded from ${diag.mtp.addon}`)
        else for (const f of ['luck-node-mtp.node', 'libmtp.9.dylib', 'mtp-worker.cjs']) assert.ok(!fs.existsSync(path.join(resources, f)), `Resources/${f} must not ship in the release build`)
        assert.ok(diag.thumbnails.native.startsWith(resources), diag.thumbnails.native)
      })
      await check('macOS tools used for previews and archives are present', async () => {
        for (const tool of ['/usr/bin/sips', '/usr/bin/qlmanage', '/usr/bin/zip', '/usr/bin/killall', '/usr/bin/dns-sd']) {
          assert.ok(fs.existsSync(tool), `${tool} is missing on this Mac`)
        }
      })
      await check('bundled thumbnail helper produces a poster frame without ffmpeg', async () => {
        const fixture = path.join(here, 'test', 'fixtures', 'sample.mp4')
        const out = path.join(os.tmpdir(), `dw-smoke-thumb-${process.pid}.jpg`)
        const r = spawnSync(diag.thumbnails.native, [fixture, out, '64'], { env: { PATH: '/usr/bin:/bin' } })
        assert.equal(r.status, 0, r.stderr?.toString())
        assert.ok(fs.statSync(out).size > 500)
        fs.rmSync(out, { force: true })
      })
    }

    await check('Licenses dialog shows the bundled-component notices', async () => {
      await app.evaluate(({ Menu }) => {
        const item = Menu.getApplicationMenu().items[0].submenu.items.find(i => i.label.startsWith('Licenses'))
        item.click()
      })
      await page.waitForFunction(() => /bundled programs and libraries/i.test(document.body.innerText), null, { timeout: 8000 })
        .catch(async e => { await page.screenshot({ path: path.join(shotDir, '02-licenses-FAILED.png') }); throw e })
      const text = await page.evaluate(() => document.body.innerText)
      for (const needle of ['Android Debug Bridge', 'Apache License', 'libusb', 'Creative Commons']) {
        assert.ok(text.includes(needle), `licenses dialog is missing "${needle}"`)
      }
      await page.screenshot({ path: path.join(shotDir, '02-licenses.png') })
      await page.keyboard.press('Escape')
    })

    await check('menu bar window launches and needs no sign-up', async () => {
      await app.evaluate(({ Menu }) => Menu.getApplicationMenu().getMenuItemById('toggle-menubar').click())
      await page.waitForTimeout(1500)
      const windows = app.windows()
      assert.equal(windows.length, 2, `expected 2 windows, saw ${windows.length}`)
      const panel = windows.find(w => w.url().includes('#menubar'))
      assert.ok(panel, 'menu bar window did not load the menubar route')
      const text = await panel.evaluate(() => document.body.innerText)
      assert.ok(text.length > 0 && !/email|register/i.test(text), `menu bar panel text: ${text.slice(0, 80)}`)
      await panel.screenshot({ path: path.join(shotDir, '02-menubar.png') })
    })

    await check('no registration file is written', async () => {
      assert.ok(!fs.existsSync(path.join(profile, 'beta-signup.json')))
    })

    const hosts = [...new Set(await app.evaluate(() => globalThis.__dwConnections ?? []))]
    await check('network recorder was active in the app process', async () => {
      assert.ok(hosts.includes('__recorder__'), 'recorder did not load; the network checks would be meaningless')
    })
    const external = hosts.filter(h => !['127.0.0.1', 'localhost', '::1', 'unknown', '__recorder__'].includes(h))
    await check(allowUpdateCheck ? 'only api.github.com is contacted' : 'no outbound connections at all', async () => {
      assert.deepEqual(allowUpdateCheck ? external.filter(h => h !== 'api.github.com') : external, [], `unexpected hosts: ${external.join(', ')}`)
      if (allowUpdateCheck) assert.ok(external.includes('api.github.com'), 'the update check never ran')
    })
    console.log(`  hosts contacted: ${external.length ? external.join(', ') : '(none)'}`)
  })
}

// Failures must be visible AND actionable. A stand-in adb (the documented DROIDWIRE_ADB
// override) lets us produce the states a real phone would, without one.
async function scenario(name, adbScript, expectation) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-fake-adb-'))
  const fake = path.join(dir, 'adb')
  fs.writeFileSync(fake, adbScript, { mode: 0o755 })
  await withApp({ DROIDWIRE_ADB: fake }, async ({ page }) => {
    await page.getByText('Connect via ADB').first().click()
    // The setup guide appears after a short grace period
    await page.waitForTimeout(7500)
    await page.screenshot({ path: path.join(shotDir, `03-${name}.png`) })
    const text = await page.evaluate(() => document.body.innerText)
    await check(`UI explains: ${name}`, async () => assert.match(text, expectation, text.slice(0, 300)))
  })
  fs.rmSync(dir, { recursive: true, force: true })
}

async function main() {
  await baseline()
  await scenario('phone not authorized',
    '#!/bin/sh\ncase "$1" in version) echo "Android Debug Bridge version 1.0.41";; devices) printf "List of devices attached\\nFAKE123\\tunauthorized\\n";; esac\n',
    /has not authorized this Mac[\s\S]*Allow/)
  await scenario('adb cannot start',
    '#!/bin/sh\necho "dyld: Library not loaded" >&2\nexit 1\n',
    /built-in adb could not start[\s\S]*Reinstall/)

  if (failures.length) {
    console.error(`\n${failures.length} check(s) failed. Screenshots: ${shotDir}`)
    process.exit(1)
  }
  console.log(`\nSmoke test passed. Screenshots: ${shotDir}`)
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1) })
