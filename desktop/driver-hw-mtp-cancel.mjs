// MTP cancellation / recovery reliability test on the PACKAGED app, real phone, no replugging.
//   env -u ELECTRON_RUN_AS_NODE node driver-hw-mtp-cancel.mjs --app <Droidwire.app> --fixtures <fix dir> --zipsrc <dir> --downloads <dir> --stamp <id> [--rounds 3]
// <zipsrc> holds z1.bin z2.bin z3.bin (folder to zip) and fresh.bin (small file for the post-cancel round trip).
// Per round: cancel an active upload, an active download and an active folder ZIP; after EACH cancel, without
// replugging: browse, upload a fresh file and download it back, comparing hashes (phone side via adb, Mac side via
// shasum). The main-process log is captured to show whether the cancel was cooperative or the kill fallback.
import { _electron as electron } from 'playwright-core'
import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'

const argv = process.argv.slice(2)
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d }
const appBundle = path.resolve(opt('--app')); const fixtures = path.resolve(opt('--fixtures')); const zipsrc = path.resolve(opt('--zipsrc'))
const downloads = path.resolve(opt('--downloads')); const stamp = opt('--stamp'); const rounds = Number(opt('--rounds', '3'))
const R = `/Download/Droidwire-Test-${stamp}`; const ADB_R = `/sdcard${R}`
const ADB = path.join(appBundle, 'Contents', 'Resources', 'adb')
fs.mkdirSync(downloads, { recursive: true })
const sh = s => `'${s.replace(/'/g, `'\\''`)}'`
const adbShell = c => spawnSync(ADB, ['shell', c], { encoding: 'utf8', timeout: 30000 }).stdout ?? ''
const lHash = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')
const sleep = ms => new Promise(r => setTimeout(r, ms))
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-hw-mtpc-'))
const app = await electron.launch({ executablePath: path.join(appBundle, 'Contents', 'MacOS', 'Droidwire'), args: [`--user-data-dir=${profile}`],
  env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, LANG: 'en_US.UTF-8', DROIDWIRE_OFFLINE: '1' } })
let logText = ''; app.process().stderr?.on('data', d => { logText += d.toString() }); app.process().stdout?.on('data', d => { logText += d.toString() })
const page = await app.firstWindow(); await page.waitForLoadState('domcontentloaded')
const api = (f, ...a) => page.evaluate(([f, a]) => window.droidwire[f](...a), [f, a])
await page.evaluate(() => { window.__ev = []; window.droidwire.onTransferProgress(e => window.__ev.push(e)) })
await api('setConnectionType', 'mtp'); await api('setDownloadDir', downloads); await sleep(1500)
const d = await api('getDevices'); if (!d.devices.length) { console.log('NO MTP DEVICE', JSON.stringify(d)); process.exit(2) }
const ctx = { transport: 'mtp', serial: d.devices[0].serial }
let n = 0; const id = p => `${p}${Date.now().toString(36)}${n++}`
const t0 = Date.now(); const T = () => `${((Date.now() - t0) / 1000).toFixed(0)}s`
const summary = []

async function roundTrip(label) {
  // browse + fresh upload + fresh download, hashes on both sides
  const out = {}
  try {
    out.list = (await api('listFiles', R, ctx)).length
    const name = `fresh-${label}-${n++}.bin`
    await api('pushFile', path.join(zipsrc, 'fresh.bin'), `${R}/${name}`, id('fu'), ctx)
    out.upload = adbShell(`sha256sum ${sh(`${ADB_R}/${name}`)}`).split(/\s+/)[0] === lHash(path.join(zipsrc, 'fresh.bin')) ? 'hash ok' : 'HASH MISMATCH'
    const dest = await api('pullFile', `${R}/${name}`, name, id('fd'), ctx)
    out.download = lHash(dest) === lHash(path.join(zipsrc, 'fresh.bin')) ? 'hash ok' : 'HASH MISMATCH'
    fs.rmSync(dest, { force: true })
    await api('deleteFile', `${R}/${name}`, ctx)
  } catch (e) { out.error = e.message.replace(/\s+/g, ' ').slice(0, 220) }
  return out
}
async function waitBytes(i, bytes) { await page.waitForFunction(([x, b]) => window.__ev.some(e => e.id === x && e.transferredBytes > b), [i, bytes], { timeout: 40000 }) }

try {
  await api('mkdir', R, ctx); await api('mkdir', `${R}/zipbig`, ctx)
  for (const f of ['z1.bin', 'z2.bin', 'z3.bin']) await api('pushFile', path.join(zipsrc, f), `${R}/zipbig/${f}`, id('seed'), ctx)
  await api('pushFile', path.join(fixtures, 'big-300M.bin'), `${R}/big.bin`, id('seed'), ctx)
  console.log(`${T()} seeded; running ${rounds} round(s)`)
  for (let r = 1; r <= rounds; r++) {
    for (const kind of ['upload', 'download', 'zip']) {
      const i = id(kind[0]); const mark = logText.length
      const call = kind === 'upload' ? api('pushFile', path.join(fixtures, 'big-300M.bin'), `${R}/cancel-me.bin`, i, ctx)
        : kind === 'download' ? api('pullFile', `${R}/big.bin`, 'big.bin', i, ctx)
        : api('zipAndPull', `${R}/zipbig`, 'zipbig', i, ctx)
      const settled = call.then(() => 'completed', e => 'rejected')
      await waitBytes(i, kind === 'zip' ? 5e6 : 25e6)
      const tc = Date.now(); await api('cancelTransfer', i)
      const res = await Promise.race([settled, sleep(30000).then(() => 'HUNG')]); const ms = Date.now() - tc
      const last = await page.evaluate(x => window.__ev.filter(e => e.id === x).at(-1)?.status, i)
      await sleep(1500)
      const lines = logText.slice(mark).split('\n').filter(l => /cancel:|mtp-worker\]/i.test(l)).map(l => l.replace(/^.*?\[mtp-worker\]\s*/, '').slice(0, 140))
      const mode = lines.some(l => /FALLBACK|killing worker|worker exited/.test(l)) ? 'KILL FALLBACK' : lines.some(l => /stopped cooperatively/.test(l)) ? 'cooperative' : 'unknown (no log line)'
      const rt = await roundTrip(`${kind[0]}${r}`)
      const ok = res !== 'HUNG' && ['cancelled', 'error'].includes(last) && rt.upload === 'hash ok' && rt.download === 'hash ok' && !rt.error
      summary.push({ round: r, kind, ok, mode })
      console.log(`${T()} round ${r} ${kind}: settled=${res} in ${ms}ms status=${last} cancel=${mode}; then browse=${rt.list ?? '-'} upload=${rt.upload ?? '-'} download=${rt.download ?? '-'}${rt.error ? ` ERROR=${rt.error}` : ''} => ${ok ? 'RECOVERED' : 'NOT RECOVERED'}`)
      for (const l of lines) console.log(`      log: ${l}`)
      fs.rmSync(path.join(downloads, 'zipbig.zip'), { force: true }); fs.rmSync(path.join(downloads, 'big.bin'), { force: true })
      adbShell(`rm -f ${sh(`${ADB_R}/cancel-me.bin`)}`)
      leftovers: {
        const left = fs.readdirSync(downloads).filter(x => x.includes('.part-'))
        if (left.length) console.log(`      LEFTOVER .part files: ${left}`)
      }
      if (!ok) { console.log('      stopping: device not recovered'); throw new Error('not recovered') }
    }
  }
} catch (e) { if (e.message !== 'not recovered') console.log(`ABORT: ${e.message.slice(0, 300)}`) }
finally {
  const bad = summary.filter(s => !s.ok).length
  console.log(`\n${summary.length} cancellations: ${summary.length - bad} recovered, ${bad} not; modes: ${JSON.stringify(summary.reduce((a, s) => ({ ...a, [s.mode]: (a[s.mode] ?? 0) + 1 }), {}))}`)
  adbShell(`rm -rf ${sh(ADB_R)}`)
  await app.close().catch(() => {}); fs.rmSync(profile, { recursive: true, force: true })
  process.exit(bad || summary.length < rounds * 3 ? 1 : 0)
}
