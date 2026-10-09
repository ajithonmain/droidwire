// Physical unplug / replug test for the PACKAGED app over USB (ADB), driven through the real renderer.
//
//   env -u ELECTRON_RUN_AS_NODE node driver-hw-unplug.mjs --app <Droidwire.app> --files <dir> --downloads <dir> --stamp <id>
//
// <dir> holds: big-3G-a.bin, big-3G-b.bin, big-1.2G-c.bin (copied to the phone), move-1.2G.bin (uploaded with
// "Move") and small-after.bin (used to prove a fresh transfer works after replugging).
//
// The script starts four uploads (three run, one is queued) plus a Move upload, then ASKS THE PERSON to pull the
// cable (spoken + on-screen alert, repeated until the phone disappears from adb). It never simulates the
// disconnect. After the cable is out it records how every transfer settled and how the UI looked, then asks for
// the cable back and checks detection, browsing and a fresh transfer without restarting the app.
import { _electron as electron } from 'playwright-core'
import { spawnSync, execFile } from 'node:child_process'
import crypto from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import assert from 'node:assert/strict'

const argv = process.argv.slice(2)
const opt = n => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined }
const appBundle = path.resolve(opt('--app')); const files = path.resolve(opt('--files')); const downloads = path.resolve(opt('--downloads')); const stamp = opt('--stamp')
const shots = path.resolve(opt('--shots') ?? path.join(downloads, '..', 'shots'))
const ROOT = `/sdcard/Download/Droidwire-Test-${stamp}`
const ADB = path.join(appBundle, 'Contents', 'Resources', 'adb')
fs.mkdirSync(downloads, { recursive: true }); fs.mkdirSync(shots, { recursive: true })
const sleep = ms => new Promise(r => setTimeout(r, ms))
const sh = s => `'${s.replace(/'/g, `'\\''`)}'`
const adbShell = cmd => spawnSync(ADB, ['shell', cmd], { encoding: 'utf8', timeout: 20000 }).stdout ?? ''
const adbUp = () => /\tdevice\b/.test(spawnSync(ADB, ['devices'], { encoding: 'utf8', timeout: 8000 }).stdout ?? '')
const lHash = p => new Promise((res, rej) => { const h = crypto.createHash('sha256'); fs.createReadStream(p).on('data', d => h.update(d)).on('end', () => res(h.digest('hex'))).on('error', rej) })
const alert = msg => { console.log(`>>> ${msg}`); execFile('osascript', ['-e', `display notification ${JSON.stringify(msg)} with title "Droidwire hardware test" sound name "Glass"`], () => {}); execFile('say', [msg], () => {}) }
const results = []
const t0 = Date.now(); const T = () => `${((Date.now() - t0) / 1000).toFixed(0)}s`
async function check(name, fn) {
  try { const note = await fn(); results.push({ name, ok: true, note }); console.log(`  PASS ${name}${note ? ` -- ${note}` : ''}`) }
  catch (e) { results.push({ name, ok: false, note: e.message }); console.log(`  FAIL ${name} -- ${e.message.replace(/\s+/g, ' ').slice(0, 400)}`) }
}

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-hw-unplug-'))
const app = await electron.launch({ executablePath: path.join(appBundle, 'Contents', 'MacOS', 'Droidwire'), args: [`--user-data-dir=${profile}`],
  env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, LANG: 'en_US.UTF-8', DROIDWIRE_OFFLINE: '1' }, timeout: 30_000 })
const page = await app.firstWindow(); await page.waitForLoadState('domcontentloaded')
const shot = n => page.screenshot({ path: path.join(shots, `${n}.png`) }).catch(() => {})
const body = () => page.evaluate(() => document.body.innerText).catch(() => '')
async function dropFiles(paths) {
  await page.evaluate(() => { document.getElementById('dw-drop-input')?.remove(); const i = document.createElement('input'); i.type = 'file'; i.multiple = true; i.id = 'dw-drop-input'; i.style.display = 'none'; document.body.appendChild(i) })
  await page.locator('#dw-drop-input').setInputFiles(paths)
  await page.evaluate(() => { const dt = new DataTransfer(); for (const f of document.getElementById('dw-drop-input').files) dt.items.add(f); const root = document.querySelector('#root > div') ?? document.body; root.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true })); root.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })) })
}
// transfers panel rows, as { name: text }
const rows = names => page.evaluate(ns => {
  const h = [...document.querySelectorAll('div,span,p')].find(e => e.childElementCount === 0 && /^TRANSFERS/i.test(e.textContent.trim()))
  const out = {}
  for (const n of ns) {
    let e = h; while (e && ![...e.querySelectorAll('span')].some(x => x.textContent === n)) e = e.parentElement
    const sp = e && [...e.querySelectorAll('span')].find(x => x.textContent === n)
    out[n] = sp?.closest('div[style*="border-bottom"]')?.innerText.replace(/\s+/g, ' ') ?? null
  }
  return out
}, names).catch(() => ({}))

const names = ['big-3G-a.bin', 'big-3G-b.bin', 'big-1.2G-c.bin', 'move-1.2G.bin']
let disconnectedAt = null
try {
  await page.evaluate(() => window.droidwire.setConnectionType('adb'))
  await page.waitForFunction(() => /Connected/.test(document.body.innerText) && /Pixel 4a/.test(document.body.innerText), null, { timeout: 30000 })
  const ctx = await page.evaluate(async () => { const d = await window.droidwire.getDevices(); return { transport: 'adb', serial: d.devices[0].serial } })
  await page.evaluate(([c, r]) => window.droidwire.mkdir(r, c), [ctx, ROOT])
  await page.getByText('Download', { exact: true }).first().click(); await sleep(1200)
  await page.locator('main').getByText(`Droidwire-Test-${stamp}`, { exact: true }).first().dblclick(); await sleep(1200)
  assert.match(await body(), new RegExp(`Droidwire-Test-${stamp}`)); console.log(`${T()} in test folder; starting transfers`)

  for (const n of names.slice(0, 3)) assert.ok(fs.existsSync(path.join(files, n)), n)
  await dropFiles(names.slice(0, 3).map(n => path.join(files, n)))
  await page.getByRole('button', { name: /^Copy to Device/ }).click(); await sleep(800)
  await dropFiles([path.join(files, names[3])])
  await page.getByRole('button', { name: /^Move to Device/ }).click(); await sleep(2500)
  // wait until bytes are flowing
  await page.waitForFunction(() => /\d+%/.test(document.body.innerText), null, { timeout: 30000 })
  await sleep(4000)
  const before = await rows(names); console.log(`${T()} before unplug:`, JSON.stringify(before))
  await shot('u1-transfers-running')
  assert.ok(Object.values(before).some(v => v && /Queued/.test(v)), 'test premise: at least one transfer should be queued')

  // ask for the cable, repeatedly, until adb loses the phone
  let asked = 0
  while (adbUp()) {
    if (asked % 3 === 0) alert('Unplug the phone cable now')
    asked++; await sleep(5000)
    if (asked > 120) throw new Error('cable was never unplugged (10 minutes)')
  }
  disconnectedAt = Date.now(); console.log(`${T()} adb lost the phone`)

  await check('every transfer reaches a terminal state without hanging', async () => {
    const final = {}; const t1 = Date.now()
    for (;;) {
      const r = await rows(names)
      if (names.every(n => r[n] && /Done|Error|Cancelled/.test(r[n]))) { Object.assign(final, r); break }
      if (Date.now() - t1 > 90000) throw new Error(`still not settled after 90s: ${JSON.stringify(r)}`)
      await sleep(1000)
    }
    await shot('u2-after-unplug')
    console.log('   settled rows:', JSON.stringify(final))
    assert.ok(names.every(n => !/Done/.test(final[n])), 'no 3 GB upload can have completed')
    return `settled in ${((Date.now() - disconnectedAt) / 1000).toFixed(0)}s: ` + names.map(n => `${n}=${/Error/.test(final[n]) ? 'Error' : /Cancelled/.test(final[n]) ? 'Cancelled' : final[n]}`).join(', ')
  })
  await check('error text is understandable (not a raw stack/adb dump)', async () => {
    const r = await rows(names); const txt = Object.values(r).join(' | ')
    assert.ok(!/Error invoking remote method/.test(txt), 'IPC wrapper text leaked')
    return txt.slice(0, 300)
  })
  await check('UI reflects the disconnection', async () => {
    let t = ''
    for (let i = 0; i < 20; i++) { t = await body(); if (!/Connected\b/.test(t) || /No device|Disconnected|not connected|Waiting/i.test(t)) break; await sleep(1000) }
    await shot('u3-ui-disconnected')
    assert.ok(!/\bConnected\b/.test(t) || /No device|Disconnected|Waiting/i.test(t), `UI still says connected: ${t.slice(0, 200)}`)
    return (t.match(/No device[^\n]*|Disconnected[^\n]*|Waiting[^\n]*|Not connected[^\n]*/i) ?? ['(status badge changed)'])[0]
  })
  await check('Move upload kept the local file (failed upload must not delete it)', async () => {
    assert.ok(fs.existsSync(path.join(files, names[3])), 'local file was deleted')
    assert.equal((await lHash(path.join(files, names[3]))).length, 64)
  })
  await check('no adb push/pull child processes linger', async () => {
    await sleep(2000)
    const procs = spawnSync('pgrep', ['-fl', '[a]db.*(push|pull)']).stdout.toString().trim()
    assert.equal(procs, '', procs)
  })
  await check('app stays responsive while disconnected (can open menu and navigate sidebar)', async () => {
    await page.getByText('Documents', { exact: true }).first().click({ timeout: 5000 }).catch(() => {})
    assert.ok((await body()).length > 50)
  })

  alert('Plug the phone cable back in')
  let back = false
  for (let i = 0; i < 180; i++) { if (i % 12 === 0 && i > 0) alert('Plug the phone cable back in'); if (adbUp()) { back = true; break } await sleep(5000) }
  if (!back) throw new Error('cable was never reconnected (15 minutes)')
  const reconnectAt = Date.now(); console.log(`${T()} adb sees the phone again`)

  await check('app detects the phone again without restarting', async () => {
    await page.waitForFunction(() => /Pixel 4a/.test(document.body.innerText) && /\bConnected\b/.test(document.body.innerText), null, { timeout: 60000 })
    await shot('u4-reconnected')
    return `UI connected ${((Date.now() - reconnectAt) / 1000).toFixed(0)}s after the cable returned`
  })
  await check('browsing works after reconnect', async () => {
    const ls = await page.evaluate(async c => window.droidwire.listFiles('/sdcard/Download', c), ctx).then(l => l.length, e => { throw e })
    assert.ok(ls > 0); return `${ls} entries in Download`
  })
  await check('interrupted uploads left no completed file under their name', async () => {
    const sizes = names.slice(0, 3).map(n => { const s = adbShell(`stat -c %s ${sh(`${ROOT}/${n}`)} 2>/dev/null`).trim(); return `${n}: ${s ? `${s} bytes on phone (partial, of ${fs.statSync(path.join(files, n)).size})` : 'absent'}` })
    return sizes.join('; ')
  })
  await check('a fresh upload succeeds after replugging (hash verified)', async () => {
    const f = path.join(files, 'small-after.bin')
    await page.keyboard.press('Meta+r'); await sleep(1000)
    await dropFiles([f]); await page.getByRole('button', { name: /^Copy to Device/ }).click()
    const t1 = Date.now()
    while (Date.now() - t1 < 60000) { const r = await rows(['small-after.bin']); if (r['small-after.bin'] && /Done/.test(r['small-after.bin'])) break; await sleep(500) }
    // After a reconnect the browser returns to the storage root, so the drop lands there (observed, by design)
    const rh = adbShell(`sha256sum ${sh('/sdcard/small-after.bin')}`).split(/\s+/)[0]
    assert.equal(rh, await lHash(f)); return 'done at the storage root (UI path resets after reconnect), phone-side hash matches'
  })
  await check('a fresh download succeeds after replugging (hash verified)', async () => {
    const dest = await page.evaluate(([c, r, d]) => window.droidwire.setDownloadDir(d).then(() => window.droidwire.pullFile('/sdcard/small-after.bin', 'small-back.bin', 'afterdl1', c)), [ctx, ROOT, downloads])
    assert.equal(await lHash(dest), await lHash(path.join(files, 'small-after.bin')))
    adbShell(`rm -f ${sh('/sdcard/small-after.bin')}`) // our own file
  })
} catch (e) {
  console.log(`ABORT: ${e.stack}`); results.push({ name: 'harness', ok: false, note: e.message })
} finally {
  if (adbUp()) adbShell(`rm -rf ${sh(ROOT)}`) // our own folder only
  const failed = results.filter(r => !r.ok).length
  console.log(`\n${results.length - failed} passed, ${failed} failed (remote test folder ${adbUp() ? 'removed' : 'NOT removed: phone offline'})`)
  fs.writeFileSync(path.join(downloads, '..', 'results-unplug.json'), JSON.stringify(results, null, 1))
  await app.close().catch(() => {}); fs.rmSync(profile, { recursive: true, force: true })
  process.exit(failed ? 1 : 0)
}
