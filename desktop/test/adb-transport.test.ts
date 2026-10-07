import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { AdbTransport, pullTree } from '../src/main/adb-transport.ts'
import { setActiveSerial } from '../src/main/active-device.ts'

// A stand-in `adb` that records its arguments (one per line, calls separated
// by ---) and mimics just enough behaviour for the transport code.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-fake-adb-'))
const log = path.join(dir, 'calls.log')
const script = path.join(dir, 'adb')

before(() => {
  fs.writeFileSync(script, `#!/bin/sh
for a in "$@"; do printf '%s\\n' "$a" >> "$FAKE_ADB_LOG"; done
echo '---' >> "$FAKE_ADB_LOG"
case "$*" in
  *devices*) printf 'List of devices attached\\nPHONE_A\\tdevice\\nPHONE_B\\tdevice\\n' ;;
  *getprop*ro.product.model*) echo Pixel ;;
  *getprop*ro.serialno*) echo "HW-$2" ;;
  *"stat -c"*) echo 1000 ;;
  *slow*) sleep 20 ;;
  *" pull "*) for last; do :; done; mkdir -p "$(dirname "$last")"; printf 'pulled' > "$last" ;;
esac
exit 0
`)
  fs.chmodSync(script, 0o755)
  process.env.DROIDWIRE_ADB = script
  process.env.FAKE_ADB_LOG = log
})

after(() => { delete process.env.DROIDWIRE_ADB; delete process.env.FAKE_ADB_LOG })

function calls(): string[][] {
  if (!fs.existsSync(log)) return []
  return fs.readFileSync(log, 'utf8').split('---\n').filter(Boolean).map(c => c.split('\n').filter((_, i, a) => i < a.length - 1 || a[i] !== ''))
}
const reset = () => fs.rmSync(log, { force: true })

test('operations are scoped to the serial they were given, not the active device', async () => {
  reset()
  setActiveSerial('adb', 'PHONE_A') // the UI has switched to A ...
  const dest = path.join(dir, 'out.bin')
  await AdbTransport.pullFile('PHONE_B', '/sdcard/x.bin', dest) // ... but this work belongs to B
  await AdbTransport.listFiles('PHONE_B', '/sdcard')
  await AdbTransport.makeDir('PHONE_B', '/sdcard/new')
  const all = calls()
  assert.ok(all.length >= 3)
  for (const c of all) {
    assert.deepEqual(c.slice(0, 2), ['-s', 'PHONE_B'], c.join(' '))
    assert.ok(!c.includes('PHONE_A'))
  }
  assert.ok(all.some(c => c.includes('pull')))
  assert.equal(fs.readFileSync(dest, 'utf8'), 'pulled')
})

test('remote paths with quotes and metacharacters reach the shell as one quoted word', async () => {
  reset()
  await AdbTransport.listFiles('PHONE_A', `/sdcard/it's; $(reboot)`)
  const c = calls().find(x => x.includes('shell'))!
  assert.equal(c[c.indexOf('shell') + 1], `ls -la --color=never '/sdcard/it'\\''s; $(reboot)'`)
})

test('aborting kills a running transfer promptly and reports cancellation', async () => {
  reset()
  const ac = new AbortController()
  const started = Date.now()
  const p = AdbTransport.pullFile('PHONE_A', '/sdcard/slow.bin', path.join(dir, 'slow.out'), { signal: ac.signal })
  setTimeout(() => ac.abort(), 150)
  await assert.rejects(p, /cancelled/i)
  assert.ok(Date.now() - started < 5000, 'must not wait for the 20s sleep')
})

test('an already-aborted signal never spawns adb', async () => {
  reset()
  const ac = new AbortController()
  ac.abort()
  await assert.rejects(AdbTransport.pushFile('PHONE_A', __filename_for_push(), '/sdcard/x', { signal: ac.signal }), /cancelled/i)
  assert.equal(calls().length, 0)
})

function __filename_for_push(): string {
  const f = path.join(dir, 'upload.txt')
  fs.writeFileSync(f, 'hi')
  return f
}

test('deleting or moving a storage root is refused before adb is invoked', async () => {
  reset()
  await assert.rejects(AdbTransport.deleteFile('PHONE_A', '/sdcard'), /storage root/)
  await assert.rejects(AdbTransport.deleteFile('PHONE_A', '/storage/emulated/0/'), /storage root/)
  await assert.rejects(AdbTransport.moveFile('PHONE_A', '/sdcard', '/sdcard/x'), /storage root/)
  assert.equal(calls().length, 0)
  await AdbTransport.deleteFile('PHONE_A', `/sdcard/it's`)
  const c = calls().find(x => x.includes('shell'))!
  assert.equal(c[c.indexOf('shell') + 1], `rm -rf '/sdcard/it'\\''s'`)
})

test('moving and renaming are separate operations', async () => {
  reset()
  await AdbTransport.moveFile('PHONE_A', '/sdcard/a/x.txt', '/sdcard/b/x.txt')
  await assert.rejects(AdbTransport.renameFile('PHONE_A', '/sdcard/a/x.txt', '../escape'), /Invalid name/)
  await AdbTransport.renameFile('PHONE_A', '/sdcard/a/x.txt', 'y.txt')
  const shells = calls().map(c => c[c.indexOf('shell') + 1])
  assert.deepEqual(shells, [`mv '/sdcard/a/x.txt' '/sdcard/b/x.txt'`, `mv '/sdcard/a/x.txt' '/sdcard/a/y.txt'`])
})

test('device list shows each online phone once under its model name', async () => {
  reset()
  const devices = await AdbTransport.getDevices()
  assert.deepEqual(devices.map(d => d.serial), ['PHONE_A', 'PHONE_B'])
  assert.ok(devices.every(d => d.name === 'Pixel' && d.type === 'adb'))
})

test('pullTree mirrors a directory under the local parent', async () => {
  reset()
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-tree-'))
  const target = await pullTree('PHONE_A', '/sdcard/Some Folder', parent)
  assert.equal(target, path.join(parent, 'Some Folder'))
})
