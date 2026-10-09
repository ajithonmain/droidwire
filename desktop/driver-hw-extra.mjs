// Extra real-phone coverage over USB/ADB on the PACKAGED app: a transfer larger than 1 GB (hashes on both
// sides, progress, speed) and previews for PDF, MP3, M4A and HEIC fixtures that this script's caller generated.
//   env -u ELECTRON_RUN_AS_NODE node driver-hw-extra.mjs --app <Droidwire.app> --extra <dir> --downloads <dir> --stamp <id>
import { _electron as electron } from 'playwright-core'
import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import assert from 'node:assert/strict'

const argv = process.argv.slice(2)
const opt = n => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined }
const appBundle = path.resolve(opt('--app')); const extra = path.resolve(opt('--extra')); const downloads = path.resolve(opt('--downloads')); const stamp = opt('--stamp')
const REMOTE = `/sdcard/Download/Droidwire-Test-${stamp}`
const ADB = path.join(appBundle, 'Contents', 'Resources', 'adb')
fs.mkdirSync(downloads, { recursive: true })
const sh = s => `'${s.replace(/'/g, `'\\''`)}'`
const adbShell = cmd => spawnSync(ADB, ['shell', cmd], { encoding: 'utf8', maxBuffer: 1 << 26 }).stdout ?? ''
const rHash = p => adbShell(`sha256sum ${sh(p)}`).split(/\s+/)[0]
const lHash = p => new Promise((res, rej) => { const h = crypto.createHash('sha256'); fs.createReadStream(p).on('data', d => h.update(d)).on('end', () => res(h.digest('hex'))).on('error', rej) })
const results = []
async function check(name, fn) {
  try { const note = await fn(); results.push({ name, ok: true, note }); console.log(`  PASS ${name}${note ? ` -- ${note}` : ''}`) }
  catch (e) { results.push({ name, ok: false, note: e.message }); console.log(`  FAIL ${name} -- ${e.message.replace(/\s+/g, ' ').slice(0, 300)}`) }
}
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-hw-profile-'))
const app = await electron.launch({ executablePath: path.join(appBundle, 'Contents', 'MacOS', 'Droidwire'), args: [`--user-data-dir=${profile}`],
  env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, LANG: 'en_US.UTF-8', DROIDWIRE_OFFLINE: '1' }, timeout: 30_000 })
const page = await app.firstWindow(); await page.waitForLoadState('domcontentloaded')
const api = (fn, ...args) => page.evaluate(([f, a]) => window.droidwire[f](...a), [fn, args])
await page.evaluate(() => { window.__ev = []; window.droidwire.onTransferProgress(e => window.__ev.push(e)) })
try {
  await api('setConnectionType', 'adb'); await api('setDownloadDir', downloads)
  let ctx
  for (let i = 0; i < 20; i++) { const d = await api('getDevices'); if (d.devices.length) { ctx = { transport: 'adb', serial: d.devices[0].serial }; break } await page.waitForTimeout(500) }
  assert.ok(ctx, 'no adb device')
  await api('mkdir', REMOTE, ctx)
  const R = n => `${REMOTE}/${n}`

  await check('previews: PDF, MP3, M4A, HEIC', async () => {
    const out = []
    for (const [f, want] of [['doc.pdf', /image|pdf/i], ['tone.mp3', /audio/i], ['tone.m4a', /audio/i], ['photo.heic', /image/i]]) {
      await api('pushFile', path.join(extra, f), R(f), `px${f.replace(/\W/g, '')}`, ctx)
      const p = await api('previewFile', R(f), f, ctx)
      assert.ok(p, `${f}: no preview returned`)
      assert.match(String(p.kind), want, `${f}: kind ${p.kind}`)
      out.push(`${f}=${p.kind}`)
    }
    return out.join(', ')
  })

  const big = path.join(extra, 'big-1.2G.bin'); const size = fs.statSync(big).size
  const bigHash = await lHash(big)
  await check(`upload ${(size / 1e9).toFixed(2)} GB: completes, progress is monotonic, phone-side hash matches`, async () => {
    const id = 'bigup1'; const t0 = Date.now()
    await api('pushFile', big, R('big.bin'), id, ctx)
    const ev = await page.evaluate(i => window.__ev.filter(e => e.id === i), id)
    const act = ev.filter(e => e.status === 'active').map(e => e.transferredBytes)
    assert.deepEqual(act, [...act].sort((a, b) => a - b), 'progress went backwards')
    assert.equal(ev.at(-1).status, 'done')
    assert.equal(Number(adbShell(`stat -c %s ${sh(R('big.bin'))}`).trim()), size)
    const sec = (Date.now() - t0) / 1000
    assert.equal(rHash(R('big.bin')), bigHash, 'phone-side hash differs')
    return `${sec.toFixed(1)}s (${(size / 1e6 / sec).toFixed(0)} MB/s), ${ev.length} progress events, peak ${(Math.max(...ev.map(e => e.speedBps ?? 0)) / 1e6).toFixed(0)} MB/s`
  })
  await check('download the same file back: hash matches the original', async () => {
    const t0 = Date.now(); const dest = await api('pullFile', R('big.bin'), 'big-back.bin', 'bigdl1', ctx)
    assert.equal(await lHash(dest), bigHash); fs.rmSync(dest)
    return `${((Date.now() - t0) / 1000).toFixed(1)}s`
  })
} catch (e) { console.log(`ABORT: ${e.stack}`); results.push({ name: 'harness', ok: false, note: e.message }) }
finally {
  adbShell(`rm -rf ${sh(REMOTE)}`) // our own folder only
  const failed = results.filter(r => !r.ok).length
  console.log(`\n${results.length - failed} passed, ${failed} failed; remote test folder removed`)
  fs.rmSync(path.join(downloads, 'big-back.bin'), { force: true })
  await app.close().catch(() => {}); fs.rmSync(profile, { recursive: true, force: true })
  process.exit(failed ? 1 : 0)
}
