// Wireless ADB test on the PACKAGED app, real phone. Uses Droidwire's own Wi-Fi pairing screen (QR code).
//
//   env -u ELECTRON_RUN_AS_NODE node driver-hw-wifi.mjs --app <Droidwire.app> --fixtures <dir> --downloads <dir> --stamp <id> --qr <png> [--wait-file <marker>]
//
// Sequence (people-actions are announced with a spoken + on-screen alert and are never assumed):
//   1. open Wi-Fi mode, show the QR code (screenshot saved to --qr), wait for the person to scan it
//   2. confirm the paired wireless device, browse and do a hash-checked round trip (USB may still be attached)
//   3. when --wait-file exists (the USB/MTP work is finished) ask for the USB cable to be pulled, and wait for adb to
//      list ONLY the wireless device - so every later transfer provably uses Wi-Fi
//   4. browse, upload/download with hashes, cancel an active upload and download, folder ZIP, fresh transfer after cancel
//   5. ask for Wi-Fi to be switched off and on again on the phone and check the failure and the reconnect
import { _electron as electron } from 'playwright-core'
import { spawnSync, execFile } from 'node:child_process'
import crypto from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import assert from 'node:assert/strict'

const argv = process.argv.slice(2)
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d }
const appBundle = path.resolve(opt('--app')); const fixtures = path.resolve(opt('--fixtures')); const downloads = path.resolve(opt('--downloads'))
const skipQr = argv.includes('--skip-qr')
const keepUsb = argv.includes('--keep-usb') // re-run without pulling the cable: reconnect/identity only, NOT a Wi-Fi-only proof
const stamp = opt('--stamp'); const qrPng = path.resolve(opt('--qr')); const waitFile = opt('--wait-file')
const ROOT = `/sdcard/Download/Droidwire-Test-${stamp}`
const ADB = path.join(appBundle, 'Contents', 'Resources', 'adb')
fs.mkdirSync(downloads, { recursive: true })
const sleep = ms => new Promise(r => setTimeout(r, ms))
const sh = s => `'${s.replace(/'/g, `'\\''`)}'`
const adb = (args, serial) => spawnSync(ADB, serial ? ['-s', serial, ...args] : args, { encoding: 'utf8', timeout: 60000 })
const redact = t => t.replace(/^[^\s]+(?=\s+(device|offline|unauthorized))/gm, '<id>').replace(/(adb-[A-Za-z0-9]+)-[A-Za-z0-9]+/g, '$1-<x>').replace(/transport_id:\d+/g, '').replace(/\b\d{1,3}(\.\d{1,3}){3}:\d+\b/g, '<ip:port>')
const devicesL = () => adb(['devices', '-l']).stdout ?? ''
const usbPresent = () => /usb:/.test(devicesL())
const lHash = p => new Promise((res, rej) => { const h = crypto.createHash('sha256'); fs.createReadStream(p).on('data', d => h.update(d)).on('end', () => res(h.digest('hex'))).on('error', rej) })
const alertUser = msg => { console.log(`>>> ${msg}`); execFile('osascript', ['-e', `display notification ${JSON.stringify(msg)} with title "Droidwire hardware test" sound name "Glass"`], () => {}); execFile('say', [msg], () => {}) }
const results = []; const t0 = Date.now(); const T = () => `${((Date.now() - t0) / 1000).toFixed(0)}s`
async function check(name, fn) {
  try { const note = await fn(); results.push({ name, ok: true, note }); console.log(`  PASS ${name}${note ? ` -- ${note}` : ''}`) }
  catch (e) { results.push({ name, ok: false, note: e.message }); console.log(`  FAIL ${name} -- ${e.message.replace(/\s+/g, ' ').slice(0, 400)}`) }
}

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-hw-wifi-'))
const app = await electron.launch({ executablePath: path.join(appBundle, 'Contents', 'MacOS', 'Droidwire'), args: [`--user-data-dir=${profile}`],
  env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, LANG: 'en_US.UTF-8', DROIDWIRE_OFFLINE: '1' }, timeout: 30_000 })
const page = await app.firstWindow(); await page.waitForLoadState('domcontentloaded')
const api = (f, ...a) => page.evaluate(([f, a]) => window.droidwire[f](...a), [f, a])
let ctx = null
const events = id => page.evaluate(i => window.__ev.filter(e => e.id === i), id)
let n = 0; const tid = p => `${p}${Date.now().toString(36)}${n++}`
const R = f => `${ROOT}/${f}`
const rHash = p => adb(['shell', `sha256sum ${sh(p)}`], ctx?.serial).stdout.split(/\s+/)[0]

try {
  await page.evaluate(() => { window.__ev = []; window.__wev = []; window.droidwire.onTransferProgress(e => window.__ev.push(e)); window.droidwire.onWirelessEvent(e => window.__wev.push(e)) })
  await api('setConnectionType', 'wireless'); await api('setDownloadDir', downloads)
  await page.reload(); await page.waitForLoadState('domcontentloaded'); await sleep(1500)
  await page.evaluate(() => { window.__ev = []; window.__wev = []; window.droidwire.onTransferProgress(e => window.__ev.push(e)); window.droidwire.onWirelessEvent(e => window.__wev.push(e)) })
  let paired = null
  if (skipQr) {
    // With the cable attached Droidwire lists the phone once (USB wins), so the wireless entry would be hidden: pull it first
    if (!keepUsb) { let asks = 0; while (usbPresent() && asks < 180) { if (asks++ % 6 === 0) alertUser('Unplug the USB cable from the phone now. Keep Wi-Fi on'); await sleep(5000) } }
    // The phone is already paired (earlier QR run). Connect through the app's own manual Connect API, using the
    // address found with dns-sd, then continue exactly as after a QR pairing.
    let inst
    for (let i = 0; i < 60 && !inst; i++) {
      const dnssd = spawnSync('/usr/bin/perl', ['-e', 'alarm 6; exec @ARGV', 'dns-sd', '-B', '_adb-tls-connect._tcp', 'local'], { encoding: 'utf8' }).stdout ?? ''
      inst = dnssd.split('\n').map(l => l.match(/_adb-tls-connect\._tcp\.\s+(\S+)\s*$/)?.[1]).find(Boolean)
      if (!inst) { if (i % 5 === 0) alertUser('The phone is not announcing Wireless debugging. On the phone turn Wireless debugging on, on the same Wi-Fi network'); await sleep(2000) }
    }
    assert.ok(inst, 'no _adb-tls-connect service announced within 6 minutes: is Wireless debugging on, on the same network?')
    const look = spawnSync('/usr/bin/perl', ['-e', 'alarm 4; exec @ARGV', 'dns-sd', '-L', inst, '_adb-tls-connect._tcp', 'local'], { encoding: 'utf8' }).stdout ?? ''
    const hp = look.match(/reached at\s+(\S+?):(\d+)/); assert.ok(hp, 'could not resolve the connect service')
    const addr = spawnSync('/usr/bin/perl', ['-e', 'alarm 4; exec @ARGV', 'dns-sd', '-G', 'v4', hp[1]], { encoding: 'utf8' }).stdout ?? ''
    const ip = addr.match(/\b(\d{1,3}(?:\.\d{1,3}){3})\b/)?.[1]; assert.ok(ip, 'could not resolve the phone address')
    const res = await api('adbConnect', `${ip}:${hp[2]}`); console.log(`${T()} manual connect through the app: ${redact(res.message)}`)
    for (let i = 0; i < 20 && !paired; i++) { const d = await api('getDevices'); paired = d.devices.find(x => /:\d+$|_adb-tls-connect|^adb-/.test(x.serial)); if (!paired) await sleep(1000) }
    if (!paired) throw new Error('manual connect did not produce a wireless device')
  } else {
  const picker = page.getByText('Connect via Wi-Fi').first()
  if (await picker.isVisible({ timeout: 4000 }).catch(() => false)) await picker.click()
  else await page.getByText('Pair a phone').first().click({ timeout: 20000 }) // Wi-Fi setup screen
  await page.getByAltText('ADB pairing QR code').waitFor({ timeout: 20000 })
  await sleep(800); await page.screenshot({ path: qrPng })
  console.log(`${T()} QR code is on screen (saved ${qrPng})`)
  alertUser('Droidwire shows a QR code. On the phone open Developer options, Wireless debugging, Pair device with QR code, and scan it')
  const t1 = Date.now()
  while (Date.now() - t1 < 15 * 60_000) {
    const d = await api('getDevices').catch(() => null)
    // Wi-Fi mode also lists USB phones; only an entry that looks like a wireless endpoint counts as paired
    const w = d?.devices?.find(x => /:\d+$|_adb-tls-connect|^adb-/.test(x.serial))
    if (w) { paired = w; break }
    if (Math.floor((Date.now() - t1) / 1000) % 60 === 0) alertUser('Waiting for the QR scan on the phone')
    await sleep(3000)
  }
  if (!paired) throw new Error('QR code was never scanned within 15 minutes')
  }
  ctx = { transport: 'adb', serial: paired.serial }
  await sleep(1500); await page.screenshot({ path: qrPng.replace(/\.png$/, '-paired.png') })

  await check(skipQr ? 'connection through Droidwire (manual Connect, phone paired earlier)' : 'pairing + connection through Droidwire (QR flow)', async () => {
    const wev = await page.evaluate(() => window.__wev.map(e => e.type ?? e.state ?? JSON.stringify(e)).join(','))
    assert.ok(/:\d+$|_adb-tls-connect|adb-/.test(paired.serial), `serial does not look wireless: ${redact(paired.serial)}`)
    return `events: ${wev}; device ${redact(paired.serial)}`
  })
  await check('selected transport is Wi-Fi: wireless serial, listed by adb without a usb: field', async () => {
    const mode = await api('getConnectionType'); assert.equal(mode, 'wireless')
    const l = devicesL(); const mine = l.split('\n').find(x => x.includes(paired.serial.split(' ')[0]))
    assert.ok(mine, 'adb does not list the paired device'); assert.ok(!/usb:/.test(mine), `the paired entry is a USB entry: ${redact(mine)}`)
    return `connection type=${mode}; adb entry: ${redact(mine).trim()}`
  })

  const roundTrip = async (label, file) => {
    const f = path.join(fixtures, file); const dl = `${label}-${file}`
    const t = Date.now(); const up = tid('u'); await api('pushFile', f, R(file), up, ctx)
    const upS = (Date.now() - t) / 1000
    assert.equal(rHash(R(file)), await lHash(f), 'phone-side hash differs')
    const t2 = Date.now(); const dest = await api('pullFile', R(file), dl, tid('d'), ctx); const dnS = (Date.now() - t2) / 1000
    assert.equal(await lHash(dest), await lHash(f), 'downloaded hash differs'); fs.rmSync(dest, { force: true })
    const size = fs.statSync(f).size
    return `${(size / 1e6).toFixed(0)} MB up ${upS.toFixed(1)}s (${(size / 1e6 / upS).toFixed(1)} MB/s), down ${dnS.toFixed(1)}s (${(size / 1e6 / dnS).toFixed(1)} MB/s)`
  }
  await api('mkdir', ROOT, ctx)
  await check('browse over Wi-Fi (USB may still be attached)', async () => `${(await api('listFiles', '/sdcard/Download', ctx)).length} entries in Download`)
  await check('hash-checked round trip over the wireless serial (phase 1, USB still attached)', () => roundTrip('p1', 'plain.txt'))

  if (waitFile) {
    console.log(`${T()} waiting for the USB/MTP work to finish (${waitFile}) before asking for the cable`)
    const tw = Date.now(); while (!fs.existsSync(waitFile) && Date.now() - tw < 45 * 60_000) await sleep(5000)
  }
  if (usbPresent() && !keepUsb) {
    let asks = 0; const tu = Date.now()
    while (usbPresent() && Date.now() - tu < 15 * 60_000) { if (asks++ % 6 === 0) alertUser('Now unplug the USB cable from the phone. Keep Wi-Fi on'); await sleep(5000) }
  }
  if (!keepUsb) await check('USB is gone and ONLY the wireless device remains (so transfers must use Wi-Fi)', async () => {
    assert.ok(!usbPresent(), 'a USB device is still listed'); const l = devicesL()
    const d = await api('getDevices'); assert.ok(d.devices.length === 1 && d.devices[0].serial === paired.serial, `app devices: ${JSON.stringify(d.devices.map(x => redact(x.serial)))}`)
    return redact(l).replace(/\n+/g, ' | ')
  })
  else console.log('   (--keep-usb: USB stays attached, so this run does not prove Wi-Fi-only transfers)')
  await page.screenshot({ path: qrPng.replace(/\.png$/, '-usb-removed.png') })

  await check('browse over Wi-Fi only', async () => `${(await api('listFiles', '/sdcard/Download', ctx)).length} entries`)
  for (const f of ['binary-32M.bin', 'it\'s a \'quote\' & more.txt', 'unicode-éü-日本.txt', 'clip.mp4']) await check(`Wi-Fi only round trip: ${f}`, () => roundTrip('w', f))
  await check('Wi-Fi only 300 MB round trip', () => roundTrip('w3', 'big-300M.bin'))
  await check('folder ZIP over Wi-Fi (name with quote/semicolon)', async () => {
    await api('mkdir', R("My 'Photos'; test"), ctx); await api('pushFile', path.join(fixtures, "My 'Photos'; test/a.txt"), R("My 'Photos'; test/a.txt"), tid('z'), ctx)
    const dest = await api('zipAndPull', R("My 'Photos'; test"), "My 'Photos'; test", tid('zp'), ctx)
    const list = spawnSync('/usr/bin/unzip', ['-Z1', dest], { encoding: 'utf8' }).stdout.split('\n').filter(Boolean)
    assert.ok(list.includes("My 'Photos'; test/a.txt"), list.join('|')); fs.rmSync(dest, { force: true })
  })
  for (const dir of ['upload', 'download']) {
    await check(`cancel an active 300 MB ${dir} over Wi-Fi: terminal state, no partial files, then a fresh transfer works`, async () => {
      const id = tid('c'); const f = path.join(fixtures, 'big-300M.bin')
      if (dir === 'download') await api('pushFile', f, R('cancel-src.bin'), tid('s'), ctx)
      const call = (dir === 'upload' ? api('pushFile', f, R('cancel-up.bin'), id, ctx) : api('pullFile', R('cancel-src.bin'), 'cancel-dl.bin', id, ctx)).then(() => 'completed', () => 'rejected')
      await page.waitForFunction(i => window.__ev.some(e => e.id === i && e.transferredBytes > 15e6), id, { timeout: 60000 })
      await api('cancelTransfer', id)
      const res = await Promise.race([call, sleep(30000).then(() => 'HUNG')]); assert.notEqual(res, 'HUNG')
      const last = (await events(id)).at(-1); assert.ok(['cancelled', 'error'].includes(last.status), last.status)
      await sleep(1500)
      assert.deepEqual(fs.readdirSync(downloads).filter(x => x.includes('.part-') || x === 'cancel-dl.bin'), [], 'local partial file left')
      const remote = adb(['shell', `ls ${sh(R('cancel-up.bin'))} 2>&1`], ctx.serial).stdout.trim()
      const rt = await roundTrip('after-cancel', 'plain.txt')
      return `${res}/${last.status}; remote partial: ${/No such file/.test(remote) ? 'none' : remote}; then ${rt}`
    })
  }

  alertUser('Last step. On the phone turn Wi-Fi off for about ten seconds, then turn it back on')
  const tOff = Date.now(); let wentOffline = false
  while (Date.now() - tOff < 10 * 60_000) { const l = devicesL(); if (!l.includes(paired.serial.split(' ')[0]) || /offline/.test(l)) { wentOffline = true; break } await sleep(2000) }
  await check('Wi-Fi drop is detected: UI leaves the connected state and a transfer fails cleanly', async () => {
    assert.ok(wentOffline, 'adb never lost the device (was Wi-Fi switched off?)')
    let t = ''; for (let i = 0; i < 25; i++) { t = await page.evaluate(() => document.body.innerText); if (!/\bConnected\b/.test(t) || /No device/i.test(t)) break; await sleep(1000) }
    await page.screenshot({ path: qrPng.replace(/\.png$/, '-wifi-off.png') })
    assert.ok(!/\bConnected\b/.test(t) || /No device/i.test(t), 'UI still says connected')
    const id = tid('x'); const err = await api('pushFile', path.join(fixtures, 'plain.txt'), R('while-off.txt'), id, ctx).then(() => 'accepted', e => e.message.replace(/\s+/g, ' ').slice(0, 160))
    assert.notEqual(err, 'accepted'); return `transfer rejected: ${err}`
  })
  alertUser('Turn Wi-Fi back on now if it is still off')
  const tOn = Date.now(); let backBy = null
  let hinted = false
  while (Date.now() - tOn < 6 * 60_000) {
    const d = await api('getDevices').catch(() => null)
    if (d?.devices?.length) { backBy = 'automatic'; break }
    // Android can switch Wireless debugging off by itself when Wi-Fi drops; the app cannot reconnect until it is on again
    if (!hinted && Date.now() - tOn > 45_000) { hinted = true; alertUser('If Wireless debugging switched itself off, turn it on again on the phone. Do not touch Droidwire') }
    await sleep(3000)
  }
  await check('reconnect after the Wi-Fi drop', async () => {
    if (!backBy) throw new Error('the app did not find the phone again within 5 minutes (wireless ADB does not always reconnect by itself; the manual Connect field in the Wi-Fi dialog is the documented way back)')
    const d = await api('getDevices'); ctx = { transport: 'adb', serial: d.devices[0].serial }
    const rt = await roundTrip('re', 'plain.txt'); return `${backBy}${hinted ? ' (after Wireless debugging was switched back on by hand: Android turned it off when Wi-Fi dropped)' : ''}; ${rt}`
  })
} catch (e) { console.log(`ABORT: ${e.stack}`); results.push({ name: 'harness', ok: false, note: e.message }) }
finally {
  if (ctx) adb(['shell', `rm -rf ${sh(ROOT)}`], ctx.serial)
  const failed = results.filter(r => !r.ok).length
  console.log(`\n${results.length - failed} passed, ${failed} failed`)
  fs.writeFileSync(path.join(downloads, '..', 'results-wifi.json'), JSON.stringify(results, null, 1))
  await app.close().catch(() => {}); fs.rmSync(profile, { recursive: true, force: true })
  process.exit(failed ? 1 : 0)
}
