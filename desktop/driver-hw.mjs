// Real-phone test harness for the PACKAGED app (IPC level).
//
//   env -u ELECTRON_RUN_AS_NODE node driver-hw.mjs --app release/mac-arm64/Droidwire.app \
//       --fixtures <dir> --downloads <dir> [--mode adb|mtp]
//
// Launches the packaged app like an installed one (minimal PATH, throwaway profile, offline),
// then drives the real main-process handlers through window.droidwire against ONE dedicated
// test folder under Download/ on the phone. It only ever touches fixtures it creates itself.
// Independent evidence comes from hashes computed outside the app (shasum locally, sha256sum
// on the phone through the bundled adb).
import { _electron as electron } from 'playwright-core'
import { execFileSync, spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import assert from 'node:assert/strict'

const argv = process.argv.slice(2)
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d }
const appBundle = path.resolve(opt('--app', 'release/mac-arm64/Droidwire.app'))
const fixtures = path.resolve(opt('--fixtures'))
const downloads = path.resolve(opt('--downloads'))
const mode = opt('--mode', 'adb')
const stamp = opt('--stamp', new Date().toISOString().replace(/\D/g, '').slice(0, 14))
let REMOTE = `/sdcard/Download/Droidwire-Test-${stamp}`
// MTP addresses the phone as /<storage name>/...; the same folder is reachable at /sdcard/... for independent adb checks
const ADB_REMOTE = `/sdcard/Download/Droidwire-Test-${stamp}`
const toAdb = p => (mode === 'mtp' && p.startsWith(REMOTE) ? ADB_REMOTE + p.slice(REMOTE.length) : p)
const ADB = path.join(appBundle, 'Contents', 'Resources', 'adb')
fs.mkdirSync(downloads, { recursive: true })

const sh = s => `'${s.replace(/'/g, `'\\''`)}'`
const adbShell = cmd => spawnSync(ADB, ['shell', cmd], { encoding: 'utf8' }).stdout ?? ''
const remoteHash = p => adbShell(`sha256sum ${sh(toAdb(p))}`).split(/\s+/)[0]
const localHash = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')
const remoteExists = p => adbShell(`[ -e ${sh(toAdb(p))} ] && echo yes || echo no`).trim() === 'yes'

const results = []
async function check(name, fn) {
  try { const note = await fn(); results.push({ name, ok: true, note }); console.log(`  PASS ${name}${note ? ` -- ${note}` : ''}`) }
  catch (e) { results.push({ name, ok: false, note: e.message }); console.log(`  FAIL ${name} -- ${e.message}`) }
}

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-hw-profile-'))
const app = await electron.launch({
  executablePath: path.join(appBundle, 'Contents', 'MacOS', 'Droidwire'),
  args: [`--user-data-dir=${profile}`],
  env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, LANG: 'en_US.UTF-8', DROIDWIRE_OFFLINE: '1' },
  timeout: 30_000,
})
const page = await app.firstWindow()
await page.waitForLoadState('domcontentloaded')
const api = (fn, ...args) => page.evaluate(([f, a]) => window.droidwire[f](...a), [fn, args])
await page.evaluate(() => {
  window.__ev = []
  window.droidwire.onTransferProgress(e => window.__ev.push(e))
})
const events = id => page.evaluate(i => window.__ev.filter(e => e.id === i), id)
let tid = 0
const newId = p => `${p}${Date.now().toString(36)}${tid++}`

try {
  console.log(`Mode ${mode}; remote test folder ${REMOTE}${mode === 'mtp' ? ` (= ${ADB_REMOTE} over adb)` : ''}`)
  await api('setConnectionType', mode)
  if (mode === 'mtp') { await page.waitForTimeout(1500) }
  await api('setDownloadDir', downloads)

  const diag = await api('getDiagnostics')
  console.log(`  diagnostics: adb ${diag.adb.version} [${diag.adb.source}] ${diag.adb.path}; mtp ${diag.mtp.available}; thumbs ${diag.thumbnails.native}`)
  await check('bundled adb in use', () => { assert.equal(diag.adb.source, 'bundled') })

  let ctx
  await check('device detected', async () => {
    let found
    for (let i = 0; i < 20; i++) { found = await api('getDevices'); if (found.devices.length) break; await page.waitForTimeout(500) }
    assert.ok(found.devices.length >= 1, JSON.stringify(found.issues))
    ctx = { transport: mode === 'mtp' ? 'mtp' : 'adb', serial: found.devices[0].serial }
    return `model ${found.devices[0].model}`
  })
  if (!ctx) throw new Error('no device; aborting')
  if (mode === 'mtp') {
    const roots = await api('listFiles', '/', ctx)
    console.log(`  MTP roots: ${roots.map(r => r.name).join(', ')}`)
    // MTP paths start at the storage root (the listing of '/' is the contents of Internal storage)
    REMOTE = `/Download/Droidwire-Test-${stamp}`
  }
  const info = await api('getDeviceInfo')
  await check('device name + battery', () => {
    assert.ok(info.name)
    // MTP has no battery property: the transport reports -1 and the UI omits it
    if (mode === 'mtp') { assert.equal(info.battery, -1); return `${info.name}; battery not available over MTP (expected)` }
    assert.ok(info.battery >= 0); return `${info.name} ${info.battery}%`
  })
  await check('storage info', async () => { const s = await api('getStorage', ctx); assert.ok(mode === 'mtp' || (s.total > 0 && s.free > 0)); return `${s.free} free of ${s.total}` })

  // ---- remote structure ---------------------------------------------------------------
  const R = p => `${REMOTE}/${p}`
  await check('mkdir test root + nested', async () => {
    await api('mkdir', REMOTE, ctx)
    await api('mkdir', R("My 'Photos'; test"), ctx)
    await api('mkdir', R("My 'Photos'; test/sub"), ctx)
    await api('mkdir', R('dest A'), ctx)
    await api('mkdir', R('dest B'), ctx)
    assert.ok(remoteExists(R("My 'Photos'; test/sub")))
  })

  // ---- upload + integrity -------------------------------------------------------------
  const files = fs.readdirSync(fixtures).filter(f => fs.statSync(path.join(fixtures, f)).isFile() && f !== 'big-300M.bin')
  for (const f of files) {
    await check(`upload + hash: ${f}`, async () => {
      const id = newId('up')
      await api('pushFile', path.join(fixtures, f), R(f), id, ctx)
      const ev = await events(id)
      assert.equal(ev.at(-1).status, 'done', JSON.stringify(ev.at(-1)))
      assert.equal(remoteHash(R(f)), localHash(path.join(fixtures, f)), 'phone-side hash differs')
      return `${ev.length} progress events`
    })
  }
  for (const rel of ["My 'Photos'; test/a.txt", "My 'Photos'; test/sub/b.txt"]) {
    await check(`upload nested + hash: ${rel}`, async () => {
      await api('pushFile', path.join(fixtures, rel), R(rel), newId('up'), ctx)
      assert.equal(remoteHash(R(rel)), localHash(path.join(fixtures, rel)))
    })
  }
  await check('shell metacharacter names stayed literal (no command ran)', async () => {
    const names = (await api('listFiles', REMOTE, ctx)).map(n => n.name)
    assert.ok(names.includes('semi;colon & amp $(touch PWNED) `touch PWNED2`.txt'), names.join('|'))
    const strays = adbShell(`ls -d /sdcard/PWNED* /sdcard/Download/PWNED* /PWNED* /data/local/tmp/PWNED* ${sh(ADB_REMOTE)}/PWNED* 2>/dev/null; echo END`).trim()
    assert.equal(strays, 'END', `stray files: ${strays}`)
    assert.ok(!fs.existsSync(path.join(downloads, 'PWNED')) && !fs.existsSync(path.join(process.cwd(), 'PWNED')))
  })

  // ---- browse -------------------------------------------------------------------------
  await check('listFiles returns every uploaded name with right type/size', async () => {
    const list = await api('listFiles', REMOTE, ctx)
    for (const f of files) {
      const n = list.find(x => x.name === f)
      assert.ok(n, `missing ${f}`)
      assert.equal(n.type, 'file'); assert.equal(n.size, fs.statSync(path.join(fixtures, f)).size, `size ${f}`)
    }
    assert.equal(list.find(x => x.name === "My 'Photos'; test").type, 'dir')
    return `${list.length} entries`
  })

  // ---- download + integrity -----------------------------------------------------------
  for (const f of files) {
    await check(`download + hash: ${f}`, async () => {
      const id = newId('dl')
      const dest = await api('pullFile', R(f), f, id, ctx)
      assert.equal(path.basename(dest), f)
      assert.equal(localHash(dest), localHash(path.join(fixtures, f)))
      const ev = await events(id)
      assert.equal(ev.at(-1).status, 'done')
      const sizes = ev.filter(e => e.status === 'active').map(e => e.transferredBytes)
      assert.deepEqual(sizes, [...sizes].sort((a, b) => a - b), 'progress went backwards')
      return `${ev.length} events`
    })
  }
  await check('download leaves no .part files', () => { assert.deepEqual(fs.readdirSync(downloads).filter(n => n.includes('.part-')), []) })

  // ---- speed / progress on the 32 MB file ---------------------------------------------
  await check('progress reports speed on 32 MB upload', async () => {
    const id = newId('sp')
    const t0 = Date.now()
    await api('pushFile', path.join(fixtures, 'binary-32M.bin'), R('speed.bin'), id, ctx)
    const ev = await events(id)
    const sp = Math.max(0, ...ev.map(e => e.speedBps ?? 0))
    assert.ok(ev.some(e => e.status === 'active' && e.transferredBytes > 0), 'no active progress seen')
    return `${((Date.now() - t0) / 1000).toFixed(1)}s, peak ${(sp / 1e6).toFixed(1)} MB/s, ${ev.length} events`
  })

  // ---- file operations ----------------------------------------------------------------
  await check('rename file (name with quote)', async () => {
    await api('renameFile', R('plain.txt'), R(`plain 'renamed' it's.txt`), ctx)
    assert.ok(remoteExists(R(`plain 'renamed' it's.txt`)) && !remoteExists(R('plain.txt')))
  })
  await check('rename folder', async () => {
    await api('renameFile', R('dest B'), R(`dest B2`), ctx)
    assert.ok(remoteExists(R('dest B2')) && !remoteExists(R('dest B')))
  })
  await check('copy file into folder', async () => {
    await api('copyFile', R('with space.txt'), R('dest A/with space.txt'), ctx)
    assert.equal(remoteHash(R('dest A/with space.txt')), remoteHash(R('with space.txt')))
  })
  await check('move file into folder (source gone)', async () => {
    await api('moveFile', R('empty.txt'), R('dest A/empty.txt'), ctx)
    assert.ok(remoteExists(R('dest A/empty.txt')) && !remoteExists(R('empty.txt')))
  })
  await check('move folder (source gone, contents intact)', async () => {
    await api('moveFile', R("My 'Photos'; test"), R('dest B2/My \'Photos\'; test'), ctx)
    assert.ok(!remoteExists(R("My 'Photos'; test")))
    assert.equal(remoteHash(R("dest B2/My 'Photos'; test/sub/b.txt")), localHash(path.join(fixtures, "My 'Photos'; test/sub/b.txt")))
    await api('moveFile', R("dest B2/My 'Photos'; test"), R("My 'Photos'; test"), ctx)
  })
  await check('stat + dirSize', async () => {
    const st = await api('statFile', R('binary-32M.bin'), ctx)
    assert.ok(st)
    const sz = await api('dirSize', R("My 'Photos'; test"), ctx)
    return `dirSize ${JSON.stringify(sz)}`
  })
  await check('find with quote/metachar query', async () => {
    const r = await api('findFiles', REMOTE, `it's`, ctx)
    assert.ok(r.some(x => x.name.includes("it's")), JSON.stringify(r.map(x => x.name)))
  })

  // ---- previews -----------------------------------------------------------------------
  await check('text preview', async () => {
    const p = await api('previewFile', R('with space.txt'), 'with space.txt', ctx)
    assert.ok(JSON.stringify(p).includes('space file'), JSON.stringify(p).slice(0, 200)); return p.kind ?? ''
  })
  await check('image preview', async () => {
    const p = await api('previewFile', R('image.png'), 'image.png', ctx)
    assert.ok(p && (p.kind === 'image' || p.url || p.dataUrl || p.localPath), JSON.stringify(p).slice(0, 200)); return p.kind ?? ''
  })
  await check('native video thumbnail (no ffmpeg on PATH)', async () => {
    const t = await api('videoThumb', R('clip.mp4'), fs.statSync(path.join(fixtures, 'clip.mp4')).size, ctx)
    // The poster-frame reader streams through adb, so MTP connections have none (documented limitation)
    if (mode === 'mtp') { assert.equal(t, null); return 'no thumbnail over MTP (expected, documented)' }
    assert.ok(t, 'no thumbnail returned'); return String(t).slice(0, 40)
  })

  // ---- folder zip ---------------------------------------------------------------------
  await check('folder zip: spaces + quotes + semicolon', async () => {
    const id = newId('zp')
    const dest = await api('zipAndPull', R("My 'Photos'; test"), "My 'Photos'; test", id, ctx)
    assert.equal(path.basename(dest), "My 'Photos'; test.zip")
    const list = execFileSync('/usr/bin/unzip', ['-Z1', dest], { encoding: 'utf8' }).split('\n').filter(Boolean)
    assert.deepEqual(list.sort(), ["My 'Photos'; test/", "My 'Photos'; test/a.txt", "My 'Photos'; test/sub/", "My 'Photos'; test/sub/b.txt"].sort())
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-unzip-'))
    execFileSync('/usr/bin/unzip', ['-q', dest, '-d', tmp])
    assert.equal(localHash(path.join(tmp, "My 'Photos'; test/sub/b.txt")), localHash(path.join(fixtures, "My 'Photos'; test/sub/b.txt")))
    fs.rmSync(tmp, { recursive: true })
    const left = adbShell(`ls -a /sdcard | grep droidwire-zip; ls -a ${sh(ADB_REMOTE)} | grep droidwire; echo END`).trim()
    assert.equal(left, 'END', `remote leftovers: ${left}`)
    const lt = fs.readdirSync(os.tmpdir()).filter(n => n.startsWith('droidwire-zip-'))
    assert.deepEqual(lt, [], 'local temp leftovers')
    return `${list.length} entries`
  })

  // ---- failure paths ------------------------------------------------------------------
  await check('missing remote file: pull fails with message, state=error, no dest', async () => {
    const id = newId('ms')
    const err = await api('pullFile', R('nope-does-not-exist.txt'), 'nope.txt', id, ctx).then(() => null, e => e.message)
    assert.ok(err, 'expected rejection')
    const ev = await events(id)
    assert.equal(ev.at(-1).status, 'error')
    assert.ok(!fs.existsSync(path.join(downloads, 'nope.txt')) && fs.readdirSync(downloads).every(n => !n.includes('.part-')))
    return err.replace(/\s+/g, ' ').slice(0, 140)
  })
  await check('invalid destination (missing remote dir): push fails cleanly', async () => {
    const id = newId('bd')
    const err = await api('pushFile', path.join(fixtures, 'with space.txt'), R('no-such-dir/sub/x.txt'), id, ctx).then(() => null, e => e.message)
    const ev = await events(id)
    return `rejected=${!!err}; last status ${ev.at(-1)?.status}; ${(err ?? '').replace(/\s+/g, ' ').slice(0, 120)}; exists=${remoteExists(R('no-such-dir/sub/x.txt'))}`
  })
  await check('missing local file: push fails cleanly', async () => {
    const id = newId('ml')
    const err = await api('pushFile', path.join(fixtures, 'no-such-local.txt'), R('x.txt'), id, ctx).then(() => null, e => e.message)
    assert.ok(err); const ev = await events(id); assert.equal(ev.at(-1).status, 'error'); return err.replace(/\s+/g, ' ').slice(0, 120)
  })
  await check('relative / malformed IPC args rejected', async () => {
    const e1 = await api('listFiles', 'relative', ctx).then(() => 'ok', () => 'rejected')
    assert.equal(e1, 'rejected')
  })

  // ---- cancellation -------------------------------------------------------------------
  await check('cancel active 300 MB upload: terminal state, remote cleaned, app usable', async () => {
    const id = newId('cu')
    const p = api('pushFile', path.join(fixtures, 'big-300M.bin'), R('big.bin'), id, ctx).then(() => 'resolved', e => `rejected: ${e.message}`)
    await page.waitForFunction(i => window.__ev.some(e => e.id === i && e.transferredBytes > 4e6), id, { timeout: 30000 })
    await api('cancelTransfer', id)
    const res = await Promise.race([p, new Promise(r => setTimeout(() => r('HUNG'), 20000))])
    assert.notEqual(res, 'HUNG', 'upload promise never settled')
    const ev = await events(id)
    const last = ev.at(-1)
    assert.ok(['cancelled', 'error'].includes(last.status), `terminal state ${last.status}`)
    await page.waitForTimeout(1500)
    const alive = spawnSync('pgrep', ['-fl', 'adb.*push']).stdout.toString().trim()
    const st = adbShell(`ls -l ${sh(toAdb(R('big.bin')))} 2>&1`).trim()
    // adb push writes in place; a cancelled push can leave a partial file - record it, then it is ours to delete
    const list = await api('listFiles', REMOTE, ctx)
    return `${res.slice(0, 60)}; last status ${last.status}; adb push procs: ${alive || 'none'}; partial remote: ${st.slice(0, 80)}; listing ok (${list.length})`
  })
  await check('cancel active 300 MB download: no .part, existing file untouched', async () => {
    await api('pushFile', path.join(fixtures, 'big-300M.bin'), R('big2.bin'), newId('bu'), ctx)
    assert.equal(remoteHash(R('big2.bin')), localHash(path.join(fixtures, 'big-300M.bin')))
    fs.writeFileSync(path.join(downloads, 'big2.bin'), 'EXISTING')
    const id = newId('cd')
    const p = api('pullFile', R('big2.bin'), 'big2.bin', id, ctx).then(() => 'resolved', e => `rejected`)
    await page.waitForFunction(i => window.__ev.some(e => e.id === i && e.transferredBytes > 4e6), id, { timeout: 30000 })
    await api('cancelTransfer', id)
    const res = await Promise.race([p, new Promise(r => setTimeout(() => r('HUNG'), 20000))])
    assert.notEqual(res, 'HUNG')
    const last = (await events(id)).at(-1)
    assert.ok(['cancelled', 'error'].includes(last.status), last.status)
    assert.deepEqual(fs.readdirSync(downloads).filter(n => n.includes('.part-')), [], 'part file left')
    assert.equal(fs.readFileSync(path.join(downloads, 'big2.bin'), 'utf8'), 'EXISTING')
    return `last status ${last.status}`
  })
  await check('cancel active folder zip', async () => {
    await api('mkdir', R('zipbig'), ctx)
    for (let i = 0; i < 3; i++) await api('copyFile', R('big2.bin'), R(`zipbig/b${i}.bin`), ctx)
    const id = newId('cz')
    const p = api('zipAndPull', R('zipbig'), 'zipbig', id, ctx).then(() => 'resolved', () => 'rejected')
    await page.waitForTimeout(2500)
    await api('cancelTransfer', id)
    const res = await Promise.race([p, new Promise(r => setTimeout(() => r('HUNG'), 30000))])
    assert.notEqual(res, 'HUNG')
    const last = (await events(id)).at(-1)
    assert.ok(['cancelled', 'error'].includes(last.status), last.status)
    await page.waitForTimeout(1500)
    const left = adbShell(`ls -a /sdcard | grep droidwire-zip; ls -a ${sh(ADB_REMOTE)}/zipbig | grep -v '^b[0-9].bin$' | grep -v '^\\.\\.\\?$'; echo END`).trim()
    assert.ok(!fs.existsSync(path.join(downloads, 'zipbig.zip')), 'partial zip left')
    assert.deepEqual(fs.readdirSync(os.tmpdir()).filter(n => n.startsWith('droidwire-zip-')), [], 'local temp left')
    return `${res}; ${last.status}; remote leftovers: ${left.replace(/\n/g, ',')}`
  })
  await check('cancel unknown id is harmless', async () => { await api('cancelTransfer', 'does-not-exist') })

  // ---- delete our own test data, then verify the app still works -------------------------
  await check('app still responsive after cancellations', async () => {
    const list = await api('listFiles', REMOTE, ctx); assert.ok(list.length > 5)
  })
  await check('no stray adb transfer / worker processes', () => {
    const procs = spawnSync('pgrep', ['-fl', 'adb.*(push|pull|exec-out)|dd if=']).stdout.toString().trim()
    assert.equal(procs, '', procs)
  })
} catch (e) {
  console.log(`ABORT: ${e.stack}`)
  results.push({ name: 'harness', ok: false, note: e.message })
} finally {
  const failed = results.filter(r => !r.ok).length
  console.log(`\n${results.length - failed} passed, ${failed} failed`)
  fs.writeFileSync(path.join(downloads, '..', `results-${mode}.json`), JSON.stringify(results, null, 1))
  await app.close().catch(() => {})
  await new Promise(r => setTimeout(r, 1500))
  const left = spawnSync('pgrep', ['-fl', 'mtp-worker|Droidwire.app']).stdout.toString().trim()
  console.log(`processes left after quit: ${left || 'none'}`)
  fs.rmSync(profile, { recursive: true, force: true })
  console.log(`Remote folder left in place for follow-up tests: ${REMOTE}`)
  process.exit(failed ? 1 : 0)
}
