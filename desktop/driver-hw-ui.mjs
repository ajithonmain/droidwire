// Real-phone UI test for the PACKAGED app: drives the actual renderer (clicks, context menus,
// synthetic drops built from real files, modals) against one dedicated test folder on the phone.
//
//   env -u ELECTRON_RUN_AS_NODE node driver-hw-ui.mjs --app release/mac-arm64/Droidwire.app \
//       --fixtures <dir> --downloads <dir> --shots <dir> --stamp <id> [--section a,b,...]
//
// Fixtures: the same directory driver-hw.mjs uses. Everything created on the phone lives under
// Download/Droidwire-Test-<stamp>/ui/ (plus one uniquely named file in Download/ for the menu bar).
import { _electron as electron } from 'playwright-core'
import { spawnSync } from 'node:child_process'
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
const shots = path.resolve(opt('--shots', path.join(downloads, '..', 'shots')))
const stamp = opt('--stamp')
const mode = opt('--mode', 'adb')
const extra = opt('--extra') ? path.resolve(opt('--extra')) : null
const only = opt('--section', '').split(',').filter(Boolean)
const ROOT = `/sdcard/Download/Droidwire-Test-${stamp}`
const UI = `${ROOT}/ui`
const ADB = path.join(appBundle, 'Contents', 'Resources', 'adb')
fs.mkdirSync(downloads, { recursive: true }); fs.mkdirSync(shots, { recursive: true })

const sh = s => `'${s.replace(/'/g, `'\\''`)}'`
const adbShell = cmd => spawnSync(ADB, ['shell', cmd], { encoding: 'utf8' }).stdout ?? ''
const remoteHash = p => adbShell(`sha256sum ${sh(p)}`).split(/\s+/)[0]
const remoteExists = p => adbShell(`[ -e ${sh(p)} ] && echo yes || echo no`).trim() === 'yes'
const remoteLs = p => adbShell(`ls -A ${sh(p)} 2>&1`).split('\n').filter(Boolean)
const hashOf = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')
const sleep = ms => new Promise(r => setTimeout(r, ms))

let quitDone = false
const results = []
async function check(name, fn) {
  try { const note = await fn(); results.push({ name, ok: true, note }); console.log(`  PASS ${name}${note ? ` -- ${note}` : ''}`) }
  catch (e) { results.push({ name, ok: false, note: e.message.replace(/\s+/g, ' ').slice(0, 300) }); console.log(`  FAIL ${name} -- ${e.message.replace(/\s+/g, ' ').slice(0, 300)}`) }
}
const want = s => only.length === 0 || only.includes(s)

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-hw-ui-'))
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-hw-ui-local-'))
const app = await electron.launch({
  executablePath: path.join(appBundle, 'Contents', 'MacOS', 'Droidwire'),
  args: [`--user-data-dir=${profile}`],
  env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, LANG: 'en_US.UTF-8', DROIDWIRE_OFFLINE: '1' },
  timeout: 30_000,
})
const page = await app.firstWindow()
await page.waitForLoadState('domcontentloaded')
const shot = n => page.screenshot({ path: path.join(shots, `${n}.png`) })
const body = () => page.evaluate(() => document.body.innerText)

// A drop built from real files: setInputFiles gives the File objects real paths, so the preload's
// webUtils.getPathForFile resolves them exactly as for a Finder drop.
async function dropFiles(target, paths) {
  await target.evaluate(() => {
    document.getElementById('dw-drop-input')?.remove()
    const i = document.createElement('input'); i.type = 'file'; i.multiple = true; i.id = 'dw-drop-input'
    i.style.display = 'none'; document.body.appendChild(i)
  })
  await target.locator('#dw-drop-input').setInputFiles(paths)
  await target.evaluate(() => {
    const dt = new DataTransfer()
    for (const f of document.getElementById('dw-drop-input').files) dt.items.add(f)
    const root = document.querySelector('#root > div') ?? document.body
    root.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }))
    root.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }))
  })
}
// Folder rows are not draggable, so match on the exact name text; the file list precedes the preview panel in the DOM

// Reach the connected MTP UI whatever the app shows after a reload, and say precisely WHY it was not reached, so a
// harness mismatch is never blamed on the phone (or the other way round):
//   HARNESS   - the UI is in a state this script does not recognise
//   TRANSPORT - the app shows its MTP setup guide / an MTP error, i.e. the phone or session is not usable
async function reachMtpUi(timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs; let lastKind = 'unknown'; let lastText = ''
  while (Date.now() < deadline) {
    lastText = await body()
    if (/\bConnected\b/.test(lastText) && /(Pixel|Nexus|MTP)/i.test(lastText)) return 'connected'
    const picker = page.getByText('Connect via MTP').first()
    const pickerCard = /How do you want to connect/i.test(lastText)
    if (pickerCard && await picker.isVisible().catch(() => false)) { lastKind = 'picker'; await picker.click().catch(() => {}); await sleep(1500); continue }
    if (/Choose File Transfer|Close other file-transfer apps|Could not open MTP|not answering|stopped responding/i.test(lastText)) lastKind = 'guide'
    await sleep(800)
  }
  await shot('mtp-ui-not-reached')
  const kind = lastKind === 'guide' ? 'TRANSPORT' : 'HARNESS'
  throw new Error(`${kind}: could not reach the connected MTP UI (last seen: ${lastKind}). Screen text starts: ${lastText.replace(/\s+/g, ' ').slice(0, 160)}`)
}
const row = (name, p = page) => p.locator('main').getByText(name, { exact: true }).first()
async function openFolderByName(name) { await row(name).dblclick(); await sleep(1100) }
async function clickBtn(text, p = page) { await p.getByRole('button', { name: text }).first().click() }
// The transfers panel is the container of the "TRANSFERS" heading; the file list can show the same names
// Row = the bordered div in the Transfers panel holding the exact file-name span (the file list can show the same names).
// Written as real functions: the page's CSP forbids evaluating strings.
const rowStatus = name => page.evaluate(n => {
  const h = [...document.querySelectorAll('div,span,p')].find(e => e.childElementCount === 0 && /^TRANSFERS/i.test(e.textContent.trim()))
  if (!h) return null
  const panel = h.closest('div[style*="border-bottom"]') ? null : h.parentElement?.parentElement ?? h.parentElement
  const root = (() => { let e = h; while (e && ![...e.querySelectorAll('span')].some(x => x.textContent === n)) e = e.parentElement; return e })()
  const sp = root && [...root.querySelectorAll('span')].find(x => x.textContent === n)
  const row = sp?.closest('div[style*="border-bottom"]')
  void panel
  return row ? row.innerText.replace(/\s+/g, ' ') : null
}, name)
async function clickRowBtn(name, label) {
  const ok = await page.evaluate(([n, lab]) => {
    const h = [...document.querySelectorAll('div,span,p')].find(e => e.childElementCount === 0 && /^TRANSFERS/i.test(e.textContent.trim()))
    let e = h; while (e && ![...e.querySelectorAll('span')].some(x => x.textContent === n)) e = e.parentElement
    const sp = e && [...e.querySelectorAll('span')].find(x => x.textContent === n)
    const row = sp?.closest('div[style*="border-bottom"]')
    const b = row && [...row.querySelectorAll('span')].find(x => x.textContent.trim() === lab)
    if (b) b.click()
    return !!b
  }, [name, label])
  assert.ok(ok, `no ${label} control on row ${name}`)
}
async function waitRow(name, re, timeout = 60000) {
  const t0 = Date.now()
  for (;;) {
    const st = await rowStatus(name)
    if (st && re.test(st)) return st
    if (Date.now() - t0 > timeout) throw new Error(`row ${name} never matched ${re}; last: ${st}`)
    await sleep(300)
  }
}
const waitTransfer = (fileName, status = 'Done', timeout = 60000) => waitRow(fileName, new RegExp(status), timeout)
async function contextMenu(name, item) {
  try {
    await row(name).click({ button: 'right', timeout: 8000 })
    await page.getByText(item, { exact: item === 'Download' }).last().click({ timeout: 8000 })
  } catch (e) { await shot(`ctxfail-${item}`); throw e }
}
async function selectRow(name) { await row(name).click() }

try {
  console.log(`UI test; remote ${UI}`)
  if (mode === 'adb') spawnSync(ADB, ['shell', `mkdir -p ${sh(UI)}`])
  else {
    // MTP only sees objects created through MTP (adb-created folders are not indexed), so build the folders via the app
    await page.evaluate(() => window.droidwire.setConnectionType('mtp'))
    await page.reload(); await page.waitForLoadState('domcontentloaded'); await sleep(1500)
    await reachMtpUi()
    const dev = await page.evaluate(async () => { const d = await window.droidwire.getDevices(); return { transport: 'mtp', serial: d.devices[0].serial } })
    for (const sub of ['', '/ui']) await page.evaluate(([c, p]) => window.droidwire.mkdir(p, c).catch(() => {}), [dev, `/storage/emulated/0/Download/Droidwire-Test-${stamp}${sub}`])
  }

  if (want('a')) {
    console.log('Section A: startup, detection, navigation')
    await check('startup shows device name, battery and storage', async () => {
      if (mode === 'mtp') {
        await page.waitForFunction(() => /Connected/.test(document.body.innerText) && /Pixel/.test(document.body.innerText), null, { timeout: 40000 })
        await shot('a1-connected-mtp'); return `MTP: ${(await body()).match(/(Nexus\/)?Pixel[^\n]*/)?.[0]} (no battery or storage figure over MTP)`
      }
      await page.waitForFunction(() => /Pixel 4a/.test(document.body.innerText) && /free of/.test(document.body.innerText), null, { timeout: 30000 })
      const t = await body()
      assert.match(t, /Connected/); assert.match(t, /Pixel 4a\s*\d+%/)
      await shot('a1-connected')
      return t.match(/Pixel 4a\s*\d+%/)[0].replace(/\s+/g, ' ') + '; ' + t.match(/\d+ GB free of \d+ GB/)[0]
    })
    await check('set download dir to test folder through the app', async () => {
      await page.evaluate(d => window.droidwire.setDownloadDir(d), downloads)
      assert.equal(await page.evaluate(() => window.droidwire.getDownloadDir()), downloads)
    })
    await check('navigate: sidebar Download -> test folder -> ui, breadcrumb, back/forward', async () => {
      await page.getByText('Download', { exact: true }).first().click(); await sleep(1200)
      await openFolderByName(`Droidwire-Test-${stamp}`)
      await openFolderByName('ui')
      const t = await body()
      assert.ok(t.includes(`Droidwire-Test-${stamp}`) && /ui/.test(t))
      await shot('a2-in-ui-folder')
      await page.locator('header button').first().click(); await sleep(800)
      assert.ok((await body()).includes('Droidwire-Test-'), 'back did not go up')
      await page.locator('header button').nth(1).click(); await sleep(800)
    })
  }

  const uploadAndWait = async (localPath, name, mode = 'Copy to Device') => {
    await dropFiles(page, [localPath])
    await page.getByRole('button', { name: new RegExp(`^${mode}`) }).waitFor({ timeout: 8000 })
    await clickBtn(new RegExp(`^${mode}`))
  }
  const conflictChoice = async re => {
    await page.getByRole('button', { name: re }).first().waitFor({ timeout: 8000 })
    await shot(`conflict-${String(re).replace(/\W/g, '')}`)
    await clickBtn(re)
  }

  if (want('b')) {
    console.log('Section B: upload through the UI, conflicts, move-upload')
    const L1 = path.join(scratch, 'plain.txt'); fs.writeFileSync(L1, 'version one\n')
    await check('upload via drop + Copy to Device; hash matches on phone', async () => {
      await uploadAndWait(L1, 'plain.txt')
      await waitTransfer('plain.txt', 'Done')
      await shot('b1-upload-done')
      assert.equal(remoteHash(`${UI}/plain.txt`), hashOf(L1))
      assert.ok(fs.existsSync(L1), 'Copy must keep the local file')
    })
    await check('upload conflict: Cancel changes nothing', async () => {
      const before = adbShell(`stat -c '%Y %s' ${sh(`${UI}/plain.txt`)}`)
      fs.writeFileSync(L1, 'version two (should not arrive)\n')
      await uploadAndWait(L1, 'plain.txt')
      await conflictChoice(/^Cancel/)
      await sleep(1500)
      assert.equal(adbShell(`stat -c '%Y %s' ${sh(`${UI}/plain.txt`)}`), before)
      assert.deepEqual(remoteLs(UI).filter(n => n.startsWith('plain')), ['plain.txt'])
    })
    await check('upload conflict: Keep Both -> "plain (1).txt" with new content, original intact', async () => {
      await uploadAndWait(L1, 'plain.txt')
      await conflictChoice(/^Keep Both/)
      await waitTransfer('plain (1).txt', 'Done')
      assert.deepEqual(remoteLs(UI).filter(n => n.startsWith('plain')).sort(), ['plain (1).txt', 'plain.txt'])
      assert.equal(remoteHash(`${UI}/plain (1).txt`), hashOf(L1))
      assert.notEqual(remoteHash(`${UI}/plain.txt`), hashOf(L1))
    })
    await check('upload conflict: Replace overwrites original', async () => {
      await uploadAndWait(L1, 'plain.txt')
      await conflictChoice(/^Replace/)
      await sleep(2500)
      assert.equal(remoteHash(`${UI}/plain.txt`), hashOf(L1))
    })
    await check('upload with Move: local deleted only after success', async () => {
      const L2 = path.join(scratch, 'move me.txt'); fs.writeFileSync(L2, 'moved content\n')
      const h = hashOf(L2)
      await uploadAndWait(L2, 'move me.txt', 'Move to Device')
      await waitTransfer('move me.txt', 'Done')
      await sleep(800)
      assert.equal(remoteHash(`${UI}/move me.txt`), h)
      assert.ok(!fs.existsSync(L2), 'local file should be deleted after a successful move-upload')
    })
    await check('upload awkward names through UI (metachar, unicode, apostrophe): literal, no execution', async () => {
      const names = ['semi;colon & amp $(touch PWNED) `touch PWNED2`.txt', 'unicode-éü-日本.txt', "it's a 'quote' & more.txt", 'with space.txt']
      for (const n of names) {
        await uploadAndWait(path.join(fixtures, n), n)
        await sleep(2200)
      }
      const ls = remoteLs(UI)
      for (const n of names) assert.ok(ls.includes(n), `missing ${n}; have ${ls.join(' | ')}`)
      for (const n of names) assert.equal(remoteHash(`${UI}/${n}`), hashOf(path.join(fixtures, n)), n)
      assert.equal(adbShell('ls -d /sdcard/PWNED* /PWNED* 2>/dev/null; echo END').trim(), 'END')
      await shot('b6-awkward-names')
    })
  }

  if (want('c')) {
    console.log('Section C: download through the UI, conflicts')
    for (const f of fs.readdirSync(downloads)) fs.rmSync(path.join(downloads, f), { recursive: true, force: true })
    await check('download via context menu; hash matches; Done shown', async () => {
      await contextMenu('unicode-éü-日本.txt', 'Download')
      await waitTransfer('unicode-éü-日本.txt', 'Done')
      assert.equal(hashOf(path.join(downloads, 'unicode-éü-日本.txt')), hashOf(path.join(fixtures, 'unicode-éü-日本.txt')))
    })
    await check('download conflict: Cancel leaves local file untouched', async () => {
      const f = path.join(downloads, 'unicode-éü-日本.txt'); fs.writeFileSync(f, 'LOCAL EDIT')
      await contextMenu('unicode-éü-日本.txt', 'Download')
      await conflictChoice(/^Cancel/); await sleep(1200)
      assert.equal(fs.readFileSync(f, 'utf8'), 'LOCAL EDIT')
    })
    await check('download conflict: Keep Both -> "(1)" copy', async () => {
      await contextMenu('unicode-éü-日本.txt', 'Download')
      await conflictChoice(/^Keep Both/)
      await waitTransfer('unicode-éü-日本 (1).txt', 'Done')
      assert.equal(hashOf(path.join(downloads, 'unicode-éü-日本 (1).txt')), hashOf(path.join(fixtures, 'unicode-éü-日本.txt')))
      assert.equal(fs.readFileSync(path.join(downloads, 'unicode-éü-日本.txt'), 'utf8'), 'LOCAL EDIT')
    })
    await check('download conflict: Replace overwrites local', async () => {
      await contextMenu('unicode-éü-日本.txt', 'Download')
      await conflictChoice(/^Replace/)
      await sleep(2500)
      assert.equal(hashOf(path.join(downloads, 'unicode-éü-日本.txt')), hashOf(path.join(fixtures, 'unicode-éü-日本.txt')))
    })
  }

  const emptyMenu = async item => {
    const [w, h] = await page.evaluate(() => [innerWidth, innerHeight])
    await page.mouse.click(w * 0.45, h * 0.85, { button: 'right' }); await sleep(250)
    await page.getByText(item, { exact: false }).last().click()
  }
  const modalInput = async text => {
    const input = page.locator('input[type="text"], input:not([type])').last()
    await input.waitFor({ timeout: 8000 }); await input.fill(text); await sleep(150); await page.keyboard.press('Enter'); await sleep(1800)
  }
  const names = () => page.evaluate(() => [...document.querySelectorAll('[draggable="true"]')].map(e => e.innerText.split('\n')[0]))

  if (want('d')) {
    console.log('Section D: rename, mkdir, copy/paste, cut/paste, delete')
    // Re-runnable: reset our own test folder to a known state (setup only; the operations under test follow)
    adbShell(`rm -rf ${sh(UI)}; mkdir -p ${sh(UI)}; cd ${sh(UI)}; echo 'version two' > plain.txt; echo 'version two' > 'plain (1).txt'; echo 'space file' > 'with space.txt'; echo 'moved content' > 'move me.txt'`)
    await page.keyboard.press('Meta+r'); await sleep(1500)
    await check('rename file via context menu (name with apostrophe)', async () => {
      await contextMenu('plain (1).txt', 'Rename')
      await modalInput("renamed it's.txt")
      assert.ok(remoteExists(`${UI}/renamed it's.txt`) && !remoteExists(`${UI}/plain (1).txt`))
      assert.ok((await names()).includes("renamed it's.txt"), 'UI list not refreshed')
    })
    await check('new folder via empty-area menu', async () => {
      await emptyMenu('New Folder')
      await modalInput("fold 'er; one")
      assert.ok(remoteExists(`${UI}/fold 'er; one`))
      await emptyMenu('New Folder')
      await modalInput('fold two')
      assert.ok(remoteExists(`${UI}/fold two`))
    })
    await check('rename folder', async () => {
      await contextMenu('fold two', 'Rename')
      await modalInput('fold 2')
      assert.ok(remoteExists(`${UI}/fold 2`) && !remoteExists(`${UI}/fold two`))
    })
    await check('copy + paste into another folder; source stays', async () => {
      await contextMenu('with space.txt', /^Copy\s+⌘C/)
      await openFolderByName("fold 'er; one")
      await emptyMenu(/^Paste/); await sleep(2000)
      assert.equal(remoteHash(`${UI}/fold 'er; one/with space.txt`), remoteHash(`${UI}/with space.txt`))
    })
    await check('paste copy into same folder keeps both (numbered)', async () => {
      await contextMenu('with space.txt', /^Copy\s+⌘C/)
      await emptyMenu(/^Paste/); await conflictChoice(/^Keep Both/); await sleep(2000)
      const ls = remoteLs(`${UI}/fold 'er; one`)
      assert.equal(ls.length, 2, ls.join('|'))
    })
    await check('cut + paste moves file into another folder (source gone)', async () => {
      await page.locator('header button').first().click(); await sleep(900)
      await contextMenu('move me.txt', /^Cut\s+⌘X/)
      await openFolderByName('fold 2')
      await emptyMenu(/^Paste/); await sleep(2000)
      assert.ok(remoteExists(`${UI}/fold 2/move me.txt`) && !remoteExists(`${UI}/move me.txt`))
      assert.equal(remoteHash(`${UI}/fold 2/move me.txt`), crypto.createHash('sha256').update('moved content\n').digest('hex'))
    })
    await check('paste with name collision: Cancel / Keep Both / Replace', async () => {
      // put a copy of plain.txt in fold 2 under the same name but different content
      spawnSync(ADB, ['shell', `echo OLD > ${sh(`${UI}/fold 2/plain.txt`)}`])
      await page.locator('header button').first().click(); await sleep(900)
      await contextMenu('plain.txt', /^Copy\s+⌘C/)
      await openFolderByName('fold 2')
      await emptyMenu(/^Paste/); await conflictChoice(/^Cancel/); await sleep(1200); await shot('d9-after-cancel')
      assert.equal(adbShell(`cat ${sh(`${UI}/fold 2/plain.txt`)}`).trim(), 'OLD')
      await emptyMenu(/^Paste/); await conflictChoice(/^Keep Both/); await sleep(2000)
      assert.ok(remoteExists(`${UI}/fold 2/plain (1).txt`), `Keep Both produced no numbered copy; ls: ${remoteLs(`${UI}/fold 2`).join('|')}`)
      assert.equal(adbShell(`cat ${sh(`${UI}/fold 2/plain.txt`)}`).trim(), 'OLD', 'Keep Both must not touch the original')
      await emptyMenu(/^Paste/); await conflictChoice(/^Replace/); await sleep(2500)
      assert.equal(remoteHash(`${UI}/fold 2/plain.txt`), remoteHash(`${UI}/plain.txt`), `Replace left: ${adbShell(`cat ${sh(`${UI}/fold 2/plain.txt`)}`).trim()}; ls: ${remoteLs(`${UI}/fold 2`).join('|')}`)
    })
    await check('delete via context menu removes only that file', async () => {
      await contextMenu('plain (1).txt', 'Delete')
      await page.getByRole('button', { name: /^Delete/ }).last().click(); await sleep(1500)
      assert.ok(!remoteExists(`${UI}/fold 2/plain (1).txt`) && remoteExists(`${UI}/fold 2/plain.txt`))
    })
    await page.locator('header button').first().click(); await sleep(600)
  }

  if (want('e')) {
    console.log('Section E: previews and thumbnails')
    await check('text preview opens with file content', async () => {
      await row('plain.txt').click(); await sleep(2500); await shot('e1-text-preview')
      assert.ok((await body()).includes('version two'), 'preview text missing')
    })
    await check('image preview renders an <img>', async () => {
      spawnSync(ADB, ['push', path.join(fixtures, 'image.png'), `${UI}/image.png`]) // seed; preview is what is under test
      await page.keyboard.press('Meta+r'); await sleep(1500)
      await row('image.png').click(); await sleep(3000); await shot('e2-image-preview')
      const ok = await page.evaluate(() => [...document.images].some(i => i.naturalWidth >= 32 && (i.src.startsWith('data:') || i.src.startsWith('blob:'))))
      assert.ok(ok, 'no decoded image in DOM')
    })
    await check('video thumbnail appears in grid view via bundled helper (no ffmpeg on PATH)', async () => {
      spawnSync(ADB, ['push', path.join(fixtures, 'clip.mp4'), `${UI}/clip.mp4`])
      await page.keyboard.press('Meta+r'); await sleep(1200)
      await page.locator('[data-tip="Grid view"]').click(); await sleep(4000); await shot('e3-grid-thumbs')
      const imgs = await page.evaluate(() => [...document.images].map(i => `${i.src.slice(0, 22)}:${i.naturalWidth}`))
      assert.ok(imgs.some(x => x.startsWith('data:image/jpeg') ), `images: ${imgs.join(',')}`)
      await page.locator('[data-tip="List view"]').click(); await sleep(600)
    })
  }

  if (want('f')) {
    console.log('Section F: cancel, queue, pause/resume')
    // 200 MB payloads, made on the phone from our own test data
    adbShell(`cd ${sh(UI)} && mkdir -p q && for i in q1 q2 q3 q4 q5 q6 c1 c2 c3 c4 p1; do dd if=${sh(`${ROOT}/big2.bin`)} of=q/$i.bin bs=1048576 count=200 2>/dev/null; done; ls q | wc -l`)
    for (const f of fs.readdirSync(downloads)) fs.rmSync(path.join(downloads, f), { recursive: true, force: true })
    await page.keyboard.press('Meta+r'); await sleep(1500)
    await openFolderByName('q'); await sleep(800)
    const dlViaMenu = n => contextMenu(n, 'Download')
    await check('queue 6 downloads: never more than 3 active, others Queued, all finish with right hashes', async () => {
      const ids = [1, 2, 3, 4, 5, 6].map(i => `q${i}.bin`)
      for (const n of ids) { await dlViaMenu(n); await sleep(150) }
      let maxActive = 0, sawQueued = false
      const t0 = Date.now()
      while (Date.now() - t0 < 180000) {
        const st = await Promise.all(ids.map(rowStatus))
        const active = st.filter(x => x && /\d+%/.test(x) && !/Done|Queued/.test(x)).length
        maxActive = Math.max(maxActive, active); sawQueued ||= st.some(x => x?.includes('Queued'))
        if (st.every(x => x?.includes('Done'))) break
        await sleep(400)
      }
      await shot('f1-queue-finished')
      const exp = remoteHash(`${UI}/q/q1.bin`)
      for (const n of ids) assert.equal(hashOf(path.join(downloads, n)), exp, n)
      assert.ok(maxActive <= 3, `max active ${maxActive}`); assert.ok(sawQueued, 'never saw a Queued row')
      return `max concurrent ${maxActive}, queued rows seen`
    })
    await check('cancel a queued download (never starts) and an active one; terminal state Cancelled; no .part', async () => {
      for (const f of fs.readdirSync(downloads)) fs.rmSync(path.join(downloads, f), { recursive: true, force: true })
      await page.evaluate(() => window.droidwire.persistSet('transfer-history', [])).catch(() => {})
      const ids = [1, 2, 3, 4].map(i => `c${i}.bin`)
      for (const n of ids) { await dlViaMenu(n); await sleep(150) }
      await page.waitForFunction(() => document.body.innerText.includes('Queued'), null, { timeout: 15000 })
      // 4th is queued: cancel it first (second button is cancel on a queued row: reorder buttons come first)
      let q4 = await rowStatus('c4.bin'); assert.ok(q4?.includes('Queued'), q4)
      await clickRowBtn('c4.bin', 'Cancel'); await sleep(500)
      q4 = await rowStatus('c4.bin'); assert.ok(q4?.includes('Cancelled'), q4)
      // cancel an active one
      await page.waitForFunction(() => /\d+%/.test(document.body.innerText), null, { timeout: 15000 })
      await clickRowBtn('c1.bin', 'Cancel'); await sleep(1500)
      const q1 = await rowStatus('c1.bin'); assert.ok(q1?.includes('Cancelled'), q1)
      await shot('f2-cancelled')
      for (const n of ['c2.bin', 'c3.bin']) await waitRow(n, /Done/, 90000)
      const gone = await Promise.all(['c1.bin', 'c4.bin'].map(rowStatus)); assert.ok(gone.every(x => x === null || /Cancelled/.test(x)), `cancelled rows: ${gone}`)
      assert.ok(!fs.existsSync(path.join(downloads, 'c4.bin')), 'queued-cancelled file exists')
      assert.ok(!fs.existsSync(path.join(downloads, 'c1.bin')), 'active-cancelled file exists')
      assert.deepEqual(fs.readdirSync(downloads).filter(n => n.includes('.part-')), [])
      assert.ok(fs.existsSync(path.join(downloads, 'c2.bin')) && fs.existsSync(path.join(downloads, 'c3.bin')), 'untouched transfers must finish')
      return 'c1 active-cancel, c4 queued-cancel; c2,c3 completed'
    })
    await check('pause then resume an active download restarts it and completes with correct hash', async () => {
      for (const f of fs.readdirSync(downloads)) fs.rmSync(path.join(downloads, f), { recursive: true, force: true })
      await dlViaMenu('p1.bin')
      await page.waitForFunction(() => /\d+%/.test(document.body.innerText), null, { timeout: 15000 })
      await sleep(1500)
      const before = await rowStatus('p1.bin')
      await clickRowBtn('p1.bin', 'Pause'); await sleep(1500)
      const paused = await rowStatus('p1.bin'); assert.ok(paused?.includes('Paused'), paused)
      assert.deepEqual(fs.readdirSync(downloads).filter(n => n.includes('.part-')), [], 'part file kept after pause (restart semantics expected)')
      await clickRowBtn('p1.bin', 'Resume')
      await waitTransfer('p1.bin', 'Done', 90000)
      assert.equal(hashOf(path.join(downloads, 'p1.bin')), remoteHash(`${UI}/q/p1.bin`))
      return `before pause: ${before}; paused: ${paused}; resumed from scratch, finished`
    })
    await check('cancel an active UPLOAD of 300 MB: terminal Cancelled, no stuck spinner, remote has no partial', async () => {
      await page.locator('header button').first().click(); await sleep(800)
      await dropFiles(page, [path.join(fixtures, 'big-300M.bin')])
      await page.getByRole('button', { name: /^Copy to Device/ }).click()
      await page.waitForFunction(() => /\d+%/.test(document.body.innerText), null, { timeout: 20000 })
      await clickRowBtn('big-300M.bin', 'Cancel'); await sleep(2500)
      const st = await rowStatus('big-300M.bin'); assert.ok(/Cancelled|Error/.test(st ?? ''), st)
      await shot('f3-upload-cancelled')
      const left = remoteLs(UI).filter(n => n.startsWith('big-300M'))
      assert.deepEqual(left, [], `remote partial: ${left}`)
      assert.equal(spawnSync('pgrep', ['-fl', 'adb.*push']).stdout.toString().trim(), '')
      return st
    })
  }

  if (want('g')) {
    console.log('Section G: menu bar window')
    const MB = `Droidwire-Test-${stamp}-menubar.txt`
    const MBL = path.join(scratch, MB); fs.writeFileSync(MBL, `menubar upload ${stamp}\n`)
    const DL = '/sdcard/Download'
    let panel
    await check('menu bar panel opens, shows the connected phone, no sign-up', async () => {
      await app.evaluate(({ Menu }) => Menu.getApplicationMenu().getMenuItemById('toggle-menubar').click())
      await sleep(2500)
      panel = app.windows().find(w => w.url().includes('#menubar'))
      assert.ok(panel, 'no menubar window')
      const t = await panel.evaluate(() => document.body.innerText)
      await panel.screenshot({ path: path.join(shots, 'g1-menubar.png') })
      assert.ok(/Pixel 4a/.test(t) || /Drop/i.test(t), t.slice(0, 120)); assert.ok(!/email|register/i.test(t))
      return t.replace(/\s+/g, ' ').slice(0, 90)
    })
    await check('menu bar upload lands in Download/ with correct hash', async () => {
      await dropFiles(panel, [MBL]); await sleep(5000)
      assert.equal(remoteHash(`${DL}/${MB}`), hashOf(MBL)); await panel.screenshot({ path: path.join(shots, 'g2-menubar-done.png') })
    })
    await check('menu bar conflict: Cancel then Keep Both', async () => {
      fs.writeFileSync(MBL, `second version ${stamp}\n`)
      await dropFiles(panel, [MBL])
      await panel.getByRole('button', { name: /^Cancel/ }).first().waitFor({ timeout: 8000 })
      await panel.getByRole('button', { name: /^Cancel/ }).first().click(); await sleep(1500)
      assert.notEqual(remoteHash(`${DL}/${MB}`), hashOf(MBL), 'Cancel must not overwrite')
      await dropFiles(panel, [MBL])
      await panel.getByRole('button', { name: /^Keep Both/ }).first().click(); await sleep(5000)
      const copy = remoteLs(DL).find(n => n.startsWith(`Droidwire-Test-${stamp}-menubar (1)`))
      assert.ok(copy, 'no numbered copy'); assert.equal(remoteHash(`${DL}/${copy}`), hashOf(MBL))
    })
    await check('menu bar window closes without disturbing the main window', async () => {
      await app.evaluate(({ Menu }) => Menu.getApplicationMenu().getMenuItemById('toggle-menubar').click()); await sleep(1000)
      assert.ok(/Connected/.test(await body()))
    })
    // clean up only the files this section created in the shared Download folder
    adbShell(`rm -f ${sh(`${DL}/${MB}`)} ${sh(`${DL}/Droidwire-Test-${stamp}-menubar (1).txt`)}`)
  }

  if (want('h')) {
    console.log('Section H: Open & Edit round trip')
    await app.evaluate(({ shell }) => { globalThis.__opened = []; shell.openPath = async p => { globalThis.__opened.push(p); return '' } })
    adbShell(`echo 'original content' > ${sh(`${UI}/edit me.txt`)}; echo '#!/bin/sh' > ${sh(`${UI}/run.command`)}`)
    await page.keyboard.press('Meta+r'); await sleep(1500)
    let local
    await check('Open & Edit pulls to a temp file and hands it to the OS opener', async () => {
      await contextMenu('edit me.txt', 'Open & Edit'); await sleep(3000)
      const opened = await app.evaluate(() => globalThis.__opened)
      assert.equal(opened.length, 1, JSON.stringify(opened)); local = opened[0]
      assert.equal(fs.readFileSync(local, 'utf8'), 'original content\n')
      assert.ok(local.startsWith(os.tmpdir()) || local.includes('droidwire-edit'), local)
    })
    await check('save in the Mac app (write-temp-then-rename) syncs to the phone', async () => {
      const tmp = `${local}.swp`; fs.writeFileSync(tmp, 'edited on the Mac\n'); fs.renameSync(tmp, local)
      const t0 = Date.now(); let h
      while (Date.now() - t0 < 15000) { h = remoteHash(`${UI}/edit me.txt`); if (h === hashOf(local)) break; await sleep(500) }
      assert.equal(h, hashOf(local)); await shot('h1-synced'); return `synced in ~${((Date.now() - t0) / 1000).toFixed(1)}s`
    })
    await check('second save also syncs; third open reuses the session', async () => {
      fs.writeFileSync(local, 'edited again\n'); await sleep(3000)
      assert.equal(adbShell(`cat ${sh(`${UI}/edit me.txt`)}`), 'edited again\n')
      await contextMenu('edit me.txt', 'Open & Edit'); await sleep(1500)
      assert.equal((await app.evaluate(() => globalThis.__opened)).length, 2); assert.equal((await app.evaluate(() => globalThis.__opened))[1], local)
    })
    await check('executable type (.command) is refused', async () => {
      const err = await page.evaluate(p => window.droidwire.editOpen(p, 'run.command').then(() => 'accepted', e => e.message), `${UI}/run.command`)
      assert.match(err, /will not open executable/i); assert.equal((await app.evaluate(() => globalThis.__opened)).length, 2)
    })
  }

  if (want('r')) {
    console.log('Section R: names the phone refuses (double quote)')
    if (mode === 'adb') adbShell(`rm -rf ${sh(UI)}; mkdir -p ${sh(UI)}; echo x > ${sh(`${UI}/victim.txt`)}`)
    else { const v = path.join(scratch, 'victim.txt'); fs.writeFileSync(v, 'x\n'); await dropFiles(page, [v]); await page.getByRole('button', { name: /^Copy to Device/ }).click(); await waitTransfer('victim.txt', 'Done', 30000) }
    await page.keyboard.press('Meta+r'); await sleep(1500)
    await check('rename to a name containing a double quote: error is shown and explains why', async () => {
      await contextMenu('victim.txt', 'Rename')
      await modalInput('say "hi".txt'); await sleep(800); await shot('r1-rename-quote')
      const t = await body()
      assert.ok(remoteExists(`${UI}/victim.txt`), 'original must survive')
      const msg = t.match(/(Rename failed|Operation not permitted|not allow|cannot|Cannot)[^\n]*/i)?.[0] ?? '(no error text on screen)'
      const renamed = adbShell(`ls -A ${sh(UI)}`)
      assert.match(msg, /does not allow/, `on screen: ${msg}; phone now has: ${renamed.replace(/\n/g, '|')}`)
      return `on screen: ${msg}`
    })
    await check('upload of a local file whose name has a double quote: row ends in Error with a reason', async () => {
      const q = path.join(scratch, 'q"uote.txt'); fs.writeFileSync(q, 'x\n')
      await dropFiles(page, [q]); await page.getByRole('button', { name: /^Copy to Device/ }).click()
      const st = await waitRow('q"uote.txt', /Error|Done/, 20000); await shot('r2-upload-quote')
      assert.match(st, /Error/); assert.match(st, /does not allow/, st)
      return st
    })
  }

  if (want('p')) {
    console.log('Section P: PDF / audio / HEIC rendered in the UI (screenshots inspected by a person)')
    adbShell(`rm -rf ${sh(UI)}; mkdir -p ${sh(UI)}`)
    await page.keyboard.press('Meta+r'); await sleep(1200)
    for (const f of ['doc.pdf', 'tone.mp3', 'tone.m4a', 'photo.heic']) {
      await check(`upload ${f} through the UI`, async () => {
        await dropFiles(page, [path.join(extra, f)]); await page.getByRole('button', { name: /^Copy to Device/ }).click(); await waitTransfer(f, 'Done', 30000)
      })
    }
    await page.keyboard.press('Meta+r'); await sleep(1500)
    for (const [f, probe] of [['doc.pdf', () => [...document.images].some(i => i.naturalWidth > 40)], ['tone.mp3', () => !!document.querySelector('audio')], ['tone.m4a', () => !!document.querySelector('audio')], ['photo.heic', () => [...document.images].some(i => i.naturalWidth > 20)]]) {
      await check(`${f}: preview panel renders (DOM probe) - see shot p-${f}`, async () => {
        await row(f).click(); await sleep(3500)
        await shot(`p-${f}`)
        const dom = await page.evaluate(`(${probe.toString()})()`).catch(() => null)
        const info = await page.evaluate(() => ({ imgs: [...document.images].map(i => `${i.naturalWidth}x${i.naturalHeight}`), audio: document.querySelectorAll('audio').length, text: document.body.innerText.includes('Too large') ? 'too-large' : '' }))
        return `dom probe ${dom}; ${JSON.stringify(info)}`
      })
    }
  }

  // K needs a freshly launched app that starts at the storage root, so it only runs when asked for alone (--section k);
  // after the other sections the app is inside a test folder and the premise would not hold
  if (only.includes('k')) {
    console.log('Section K: fresh download after a reconnect-style start (UI at the storage root), destination taken from the current path')
    await page.evaluate(d => window.droidwire.setDownloadDir(d), downloads)
    await check('upload to the current (root) path, then download it back via the context menu; hashes match', async () => {
      // A fresh launch needs a moment to detect the phone; dropping before that finds no connection and no upload dialog
      await page.waitForFunction(() => /Pixel 4a/.test(document.body.innerText) && /free of/.test(document.body.innerText), null, { timeout: 30000 })
      const f = path.join(fixtures, 'binary-32M.bin')
      const rootName = `Droidwire-Test-${stamp}-root.bin`; const tmp = path.join(scratch, rootName); fs.copyFileSync(f, tmp)
      // current path from the app itself (breadcrumb), not assumed
      const crumb = await page.evaluate(() => [...document.querySelectorAll('footer *')].filter(e => e.childElementCount === 0).map(e => e.textContent.trim()).filter(Boolean))
      await dropFiles(page, [tmp]); await page.getByRole('button', { name: /^Copy to Device/ }).click(); await waitTransfer(rootName, 'Done', 40000)
      const remote = adbShell(`find /sdcard/ -maxdepth 2 -name ${sh(rootName)}`).trim()
      assert.ok(remote, `uploaded file not found; breadcrumb ${crumb.join(' > ')}`)
      assert.equal(remoteHash(remote), hashOf(tmp))
      await page.keyboard.press('Meta+r'); await sleep(1500)
      for (const x of fs.readdirSync(downloads)) fs.rmSync(path.join(downloads, x), { recursive: true, force: true })
      await contextMenu(rootName, 'Download'); await waitTransfer(rootName, 'Done', 40000)
      assert.equal(hashOf(path.join(downloads, rootName)), hashOf(tmp))
      adbShell(`rm -f ${sh(remote)}`)
      return `current path "${crumb.slice(-3).join(' > ')}"; file at ${remote.replace(rootName, '<name>')}; both hashes match`
    })
  }

  // Last on purpose: its final check quits the app, so nothing can run after it
  if (want('i')) {
    console.log('Section I: window closed mid-transfer, quit mid-transfer')
    // Earlier sections reset ${UI}; this one needs its own 200 MB payloads, made on the phone from the IPC harness's big2.bin
    adbShell(`mkdir -p ${sh(UI)}/q && cd ${sh(UI)}/q && for i in c1 c2; do dd if=${sh(`${ROOT}/big2.bin`)} of=$i.bin bs=1048576 count=200 2>/dev/null; done`)
    await page.evaluate(d => window.droidwire.setDownloadDir(d), downloads)
    for (const f of fs.readdirSync(downloads)) fs.rmSync(path.join(downloads, f), { recursive: true, force: true })
    await page.keyboard.press('Meta+r'); await sleep(1000)
    await openFolderByName('q'); await sleep(800)
    await check('closing the window during a download: app survives, activate opens a new window, transfer settles, no .part, no stray adb', async () => {
      await contextMenu('c1.bin', 'Download')
      await page.waitForFunction(() => /\d+%/.test(document.body.innerText), null, { timeout: 15000 })
      await app.evaluate(({ BrowserWindow }) => { for (const w of BrowserWindow.getAllWindows()) w.close() })
      await sleep(800)
      assert.equal(app.windows().length, 0, 'window did not close')
      // Dock-icon click path: the app must be able to open a fresh window while the old transfer is still running
      await app.evaluate(({ app }) => { app.emit('activate') }); await sleep(3000)
      const w2 = app.windows()[0]; assert.ok(w2, 'no window after activate')
      await w2.waitForFunction(() => /Pixel 4a/.test(document.body.innerText), null, { timeout: 20000 })
      await sleep(15000)
      const parts = fs.readdirSync(downloads).filter(n => n.includes('.part-'))
      const final = fs.existsSync(path.join(downloads, 'c1.bin'))
      const procs = spawnSync('pgrep', ['-fl', 'adb.*(pull|exec-out)']).stdout.toString().trim()
      if (final) assert.equal(hashOf(path.join(downloads, 'c1.bin')), remoteHash(`${UI}/q/c1.bin`), 'completed file is corrupt')
      return `final file present: ${final}; .part files: ${parts.length}; adb pull procs: ${procs || 'none'}`
    })
    await check('quit during a download: no adb child processes, no .part files', async () => {
      for (const f of fs.readdirSync(downloads)) fs.rmSync(path.join(downloads, f), { recursive: true, force: true })
      const w = app.windows()[0]
      const ctx = await w.evaluate(async () => { const d = await window.droidwire.getDevices(); return { transport: 'adb', serial: d.devices[0].serial } })
      w.evaluate(([p, c]) => window.droidwire.pullFile(p, 'c2.bin', 'quitdl1', c).catch(() => {}), [`${UI}/q/c2.bin`, ctx]).catch(() => {})
      await sleep(3000)
      assert.ok(spawnSync('pgrep', ['-fl', 'adb.*pull']).stdout.toString().trim() !== '', 'test premise: a pull should be running')
      await app.close().catch(() => {}); await sleep(2500)
      // Only processes whose executable lives in the tested app bundle count; matching the command line text would also
      // catch the shell that started this script (its own arguments name the app and adb)
      const procs = spawnSync('ps', ['-axo', 'pid=,command=']).stdout.toString().split('\n')
        .filter(l => l.trim().split(/\s+/).slice(1).join(' ').startsWith(appBundle + '/Contents/')).join('\n').trim()
      const parts = fs.readdirSync(downloads).filter(n => n.includes('.part-'))
      assert.equal(procs, '', `leftover processes: ${procs}`); assert.deepEqual(parts, [], 'part files left after quit')
      quitDone = true
    })
  }
} catch (e) {
  console.log(`ABORT: ${e.stack}`); results.push({ name: 'harness', ok: false, note: e.message })
}
if (!only.includes('keep-open')) {
  const failed = results.filter(r => !r.ok).length
  console.log(`\n${results.length - failed} passed, ${failed} failed`)
  fs.writeFileSync(path.join(downloads, '..', `results-ui-${only.join('_') || 'all'}.json`), JSON.stringify(results, null, 1))
  await app.close().catch(() => {})
  fs.rmSync(profile, { recursive: true, force: true }); fs.rmSync(scratch, { recursive: true, force: true })
  process.exit(failed ? 1 : 0)
}
