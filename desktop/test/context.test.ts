import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveContext, setActiveSerial, setConnectionType, getActiveContext } from '../src/main/active-device.ts'
import { beginOperation, cancelOperation, endOperation, activeOperationCount } from '../src/main/operations.ts'
import { deviceScopedKey, scopedDirName } from '../src/main/lib/session-keys.ts'
import { SettleRegistry } from '../src/renderer/lib/settle.ts'

test('queued work keeps the device it was queued against after a switch', () => {
  setConnectionType('adb')
  setActiveSerial('adb', 'PHONE_A')
  const queued = resolveContext({ transport: 'adb', serial: 'PHONE_A' })

  // The user switches phone, then switches to MTP mode
  setActiveSerial('adb', 'PHONE_B')
  setConnectionType('mtp')
  setActiveSerial('mtp', 'mtp-1-2')

  assert.deepEqual(getActiveContext(), { transport: 'mtp', serial: 'mtp-1-2' })
  // Context-free calls follow the active device ...
  assert.deepEqual(resolveContext(), { transport: 'mtp', serial: 'mtp-1-2' })
  // ... but the work that was queued earlier still resolves to its origin
  assert.deepEqual(resolveContext(queued), { transport: 'adb', serial: 'PHONE_A' })
  assert.deepEqual(resolveContext({ transport: 'adb', serial: 'PHONE_A' }), { transport: 'adb', serial: 'PHONE_A' })
})

test('context-free calls fail clearly when nothing is selected, and bad contexts are rejected', () => {
  setConnectionType('adb')
  setActiveSerial('adb', null)
  assert.throws(() => resolveContext(), /No device selected/)
  assert.throws(() => resolveContext({ transport: 'adb' }))
  assert.throws(() => resolveContext({ transport: 'usb', serial: 'x' }))
})

test('the same path on two devices (or transports) never shares a key or cache directory', () => {
  const a = { transport: 'adb' as const, serial: 'PHONE_A' }
  const b = { transport: 'adb' as const, serial: 'PHONE_B' }
  const aMtp = { transport: 'mtp' as const, serial: 'PHONE_A' }
  const p = '/sdcard/DCIM/IMG_0001.jpg'
  const keys = new Set([deviceScopedKey(a, p), deviceScopedKey(b, p), deviceScopedKey(aMtp, p)])
  const dirs = new Set([scopedDirName(a, p), scopedDirName(b, p), scopedDirName(aMtp, p)])
  assert.equal(keys.size, 3)
  assert.equal(dirs.size, 3)
  assert.equal(scopedDirName(a, p), scopedDirName(a, p))
  // Separator ambiguity: serial "A" + path "/b" must differ from serial "A/b" + path ""
  assert.notEqual(deviceScopedKey(a, '/x'), deviceScopedKey({ transport: 'adb', serial: 'PHONE_A/x' }, ''))
})

test('operation registry: cancel aborts, ids are unique, ids are validated', () => {
  const op = beginOperation('dl-1')
  assert.equal(op.signal.aborted, false)
  assert.throws(() => beginOperation('dl-1'), /already running/)
  assert.throws(() => beginOperation('../evil'))
  assert.equal(cancelOperation('dl-1'), true)
  assert.equal(op.signal.aborted, true)
  endOperation('dl-1')
  assert.equal(cancelOperation('dl-1'), false)
  assert.equal(activeOperationCount(), 0)
})

test('an upload promise settles on success, failure, cancellation and dismissal', async () => {
  const reg = new SettleRegistry()
  const outcomes = ['ok', 'failed', 'cancelled', 'dismissed'].map(id => ({ id, promise: reg.wait(id) }))
  reg.settle('ok', true)
  reg.settle('failed', false)
  reg.settle('cancelled', false)
  reg.settle('dismissed', false)
  const results = await Promise.race([
    Promise.all(outcomes.map(o => o.promise)),
    new Promise<'hung'>(r => setTimeout(() => r('hung'), 500)),
  ])
  assert.deepEqual(results, [true, false, false, false])
  assert.equal(reg.pending, 0)
})

test('settling twice keeps the first outcome and unknown ids are harmless', async () => {
  const reg = new SettleRegistry()
  const p = reg.wait('u1')
  reg.settle('u1', false)
  reg.settle('u1', true)
  reg.settle('nope', true)
  assert.equal(await p, false)
})
