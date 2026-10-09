import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { DeviceContext, TransferProgress } from '@droidwire/shared'
import { TransferQueue, type BatchSummary, type TransferApi } from '../src/renderer/lib/transferQueue.ts'

// A controllable stand-in for window.droidwire: every call returns a promise
// the test resolves or rejects, like the main process would.
function harness(opts: { maxActive?: number } = {}) {
  const calls: Array<{ kind: 'pull' | 'push' | 'zip'; id: string; remote: string; ctx: DeviceContext; settle: { ok: (v?: string) => void; fail: (m: string) => void } }> = []
  const cancelled: string[] = []
  const done: TransferProgress[] = []
  const batches: BatchSummary[] = []
  const track = <T>(kind: 'pull' | 'push' | 'zip', id: string, remote: string, ctx: DeviceContext, value: T) =>
    new Promise<T>((resolve, reject) => {
      calls.push({ kind, id, remote, ctx, settle: { ok: v => resolve((v ?? value) as T), fail: m => reject(new Error(m)) } })
    })
  const api: TransferApi = {
    pullFile: (remote, name, id, ctx) => track('pull', id, remote, ctx, `/dl/${name}`),
    pushFile: (_local, remote, id, ctx) => track('push', id, remote, ctx, undefined as unknown as void),
    zipAndPull: (remote, name, id, ctx) => track('zip', id, remote, ctx, `/dl/${name}.zip`),
    cancelTransfer: async id => { cancelled.push(id) },
  }
  const queue = new TransferQueue(api, { ...opts, onRecordDone: t => done.push(t), onBatchComplete: b => batches.push(b) })
  const status = (id: string) => queue.getSnapshot().find(t => t.id === id)?.status
  const flush = () => new Promise(r => setImmediate(r))
  return { queue, calls, cancelled, done, batches, status, flush }
}

const A: DeviceContext = { transport: 'adb', serial: 'PHONE_A' }
const B: DeviceContext = { transport: 'adb', serial: 'PHONE_B' }

test('runs at most maxActive transfers and starts the next as slots free up', async () => {
  const h = harness({ maxActive: 2 })
  const ids = [1, 2, 3, 4].map(i => h.queue.download(`/sdcard/f${i}`, `f${i}`, A))
  assert.equal(h.calls.length, 2)
  assert.deepEqual(ids.map(h.status), ['active', 'active', 'pending', 'pending'])
  // oldest first: f1 and f2 run, f3 and f4 wait
  assert.deepEqual(h.calls.map(c => c.remote), ['/sdcard/f1', '/sdcard/f2'])

  h.queue.handleProgress({ id: ids[0], status: 'done' })
  h.calls[0].settle.ok()
  await h.flush()
  assert.equal(h.calls.length, 3)
  assert.equal(h.calls[2].remote, '/sdcard/f3')
})

test('a transfer keeps the device it was queued against, including when restarted', async () => {
  const h = harness()
  const id = h.queue.download('/sdcard/x', 'x', A)
  assert.deepEqual(h.calls[0].ctx, A)
  // The UI has moved on to another phone; pause + resume must still use phone A
  await h.queue.pause(id)
  assert.equal(h.status(id), 'paused')
  assert.deepEqual(h.cancelled, [id])
  h.queue.resume(id)
  assert.equal(h.calls.length, 2)
  assert.deepEqual(h.calls[1].ctx, A)
  assert.notDeepEqual(h.calls[1].ctx, B)
})

test('a late error after pausing does not override the paused state', async () => {
  const h = harness()
  const id = h.queue.download('/sdcard/x', 'x', A)
  await h.queue.pause(id)
  h.queue.handleProgress({ id, status: 'error', error: 'adb killed' })
  h.calls[0].settle.fail('adb killed')
  await h.flush()
  assert.equal(h.status(id), 'paused')
  // and resume restarts it
  h.queue.resume(id)
  assert.equal(h.status(id), 'active')
})

test('only queued transfers and active downloads can pause; an active upload cannot', async () => {
  const h = harness({ maxActive: 1 })
  const up = h.queue.upload('/Users/me/a.txt', '/sdcard', undefined, A)
  const dl = h.queue.download('/sdcard/b', 'b', A)
  const [uploadEntry, downloadEntry] = [h.queue.getSnapshot()[1], h.queue.getSnapshot()[0]]
  assert.equal(uploadEntry.status, 'active')
  assert.equal(downloadEntry.status, 'pending')
  assert.equal(h.queue.canPause(uploadEntry), false)
  assert.equal(h.queue.canPause(downloadEntry), true)
  await h.queue.pause(uploadEntry.id)
  assert.equal(h.status(uploadEntry.id), 'active', 'pausing an active upload is refused')
  void up; void dl
})

test('retry re-queues a failed download for the original device and drops the failed entry', async () => {
  const h = harness()
  const id = h.queue.download('/sdcard/x', 'x.bin', B)
  h.calls[0].settle.fail('boom')
  await h.flush()
  assert.equal(h.status(id), 'error')
  h.queue.retry(h.queue.getSnapshot()[0])
  assert.equal(h.status(id), undefined)
  assert.equal(h.calls.length, 2)
  assert.deepEqual(h.calls[1].ctx, B)
  assert.equal(h.calls[1].remote, '/sdcard/x')
})

test('folder downloads run as a zip and retry as a zip', async () => {
  const h = harness()
  h.queue.download('/sdcard/My Folder', 'My Folder.zip', A, 'folder')
  assert.equal(h.calls[0].kind, 'zip')
  h.calls[0].settle.fail('nope')
  await h.flush()
  h.queue.retry(h.queue.getSnapshot()[0])
  assert.equal(h.calls[1].kind, 'zip')
})

test('cancelling a running transfer shows "cancelling" until the native work has stopped, and holds its slot until then', async () => {
  const h = harness({ maxActive: 1 })
  const first = h.queue.download('/sdcard/a', 'a', A)
  h.queue.download('/sdcard/b', 'b', A)
  assert.equal(h.calls.length, 1)
  await h.queue.cancel(first)
  assert.deepEqual(h.cancelled, [first])
  assert.equal(h.status(first), 'cancelling', 'must not claim the cancellation is complete while the transfer is still running')
  assert.ok(h.queue.getSnapshot().find(t => t.id === first)?.cancelRequestedAt)
  h.queue.handleProgress({ id: first, status: 'active', transferredBytes: 5 })
  assert.equal(h.status(first), 'cancelling', 'late progress does not revive it')
  assert.equal(h.calls.length, 1, 'the next transfer waits: the phone is still busy stopping the first')
  h.calls[0].settle.fail('Transfer cancelled')
  await h.flush()
  assert.equal(h.status(first), 'cancelled')
  assert.equal(h.calls.length, 2, 'the queued transfer starts once the cancelled one has really stopped')
})

test('a transfer that finishes before the cancel took effect is reported as done, not cancelled', async () => {
  const h = harness()
  const id = h.queue.download('/sdcard/a', 'a', A)
  await h.queue.cancel(id)
  h.queue.handleProgress({ id, status: 'done' })
  h.calls[0].settle.ok()
  await h.flush()
  assert.equal(h.status(id), 'done')
})

test('the main process reporting the cancel as an error ends the cancelling state as cancelled', async () => {
  const h = harness()
  const id = h.queue.download('/sdcard/a', 'a', A)
  await h.queue.cancel(id)
  h.queue.handleProgress({ id, status: 'error', error: 'Transfer cancelled' })
  assert.equal(h.status(id), 'cancelled')
  assert.equal(h.queue.getSnapshot()[0].error, undefined)
})

test('the batch is not complete while a cancelled transfer is still being stopped', async () => {
  const h = harness()
  const id = h.queue.download('/sdcard/a', 'a', A)
  await h.queue.cancel(id)
  assert.equal(h.batches.length, 0)
  h.calls[0].settle.fail('Transfer cancelled')
  await h.flush()
  assert.equal(h.batches.length, 1)
})

test('cancelling a queued transfer means it never starts', async () => {
  const h = harness({ maxActive: 1 })
  h.queue.download('/sdcard/a', 'a', A)
  const queued = h.queue.download('/sdcard/b', 'b', A)
  await h.queue.cancel(queued)
  h.queue.handleProgress({ id: h.calls[0].id, status: 'done' })
  h.calls[0].settle.ok()
  await h.flush()
  assert.equal(h.calls.length, 1)
})

test('an upload promise settles true on success', async () => {
  const h = harness()
  const outcome = h.queue.upload('/Users/me/a.txt', '/sdcard/', 'a.txt', A)
  assert.equal(h.calls[0].remote, '/sdcard/a.txt')
  h.calls[0].settle.ok()
  assert.equal(await outcome, true)
})

test('an upload promise settles false when the push fails, so a batch cannot hang', async () => {
  const h = harness()
  const results = Promise.all([
    h.queue.upload('/Users/me/a.txt', '/sdcard', undefined, A),
    h.queue.upload('/Users/me/b.txt', '/sdcard', undefined, A),
  ])
  h.calls[0].settle.fail('device offline')
  h.calls[1].settle.ok()
  const outcome = await Promise.race([results, new Promise<'hung'>(r => setTimeout(() => r('hung'), 500))])
  assert.deepEqual(outcome, [false, true])
})

test('an upload settles false when cancelled while running, queued, or dismissed - the running one only once it has stopped', async () => {
  const h = harness({ maxActive: 1 })
  const running = h.queue.upload('/Users/me/a.txt', '/sdcard', undefined, A)
  const queued = h.queue.upload('/Users/me/b.txt', '/sdcard', undefined, A)
  const dismissed = h.queue.upload('/Users/me/c.txt', '/sdcard', undefined, A)
  const [cEntry] = h.queue.getSnapshot()
  await h.queue.cancel(h.calls[0].id)
  await h.queue.cancel(h.queue.getSnapshot()[1].id)
  h.queue.dismiss(cEntry.id)
  const early = await Promise.race([running, new Promise<'pending'>(r => setTimeout(() => r('pending'), 50))])
  assert.equal(early, 'pending', 'a running upload must not settle until the native push has actually stopped')
  h.calls[0].settle.fail('Transfer cancelled')
  const outcome = await Promise.race([
    Promise.all([running, queued, dismissed]),
    new Promise<'hung'>(r => setTimeout(() => r('hung'), 500)),
  ])
  assert.deepEqual(outcome, [false, false, false])
})

test('an upload also settles false when the main process reports an error event', async () => {
  const h = harness()
  const outcome = h.queue.upload('/Users/me/a.txt', '/sdcard', undefined, A)
  h.queue.handleProgress({ id: h.calls[0].id, status: 'error', error: 'No space left on device' })
  assert.equal(await Promise.race([outcome, new Promise(r => setTimeout(() => r('hung'), 500))]), false)
})

test('completed transfers are recorded once and the batch summary fires when the queue drains', async () => {
  const h = harness({ maxActive: 2 })
  const a = h.queue.download('/sdcard/a', 'a', A)
  const b = h.queue.download('/sdcard/b', 'b', A)
  h.queue.handleProgress({ id: a, status: 'done' })
  h.queue.handleProgress({ id: a, status: 'done' }) // duplicate event
  assert.equal(h.done.length, 1)
  assert.equal(h.batches.length, 0, 'still busy')
  h.calls[1].settle.fail('disk full')
  await h.flush()
  assert.equal(h.status(b), 'error')
  assert.deepEqual(h.batches, [{ total: 2, done: 1, failed: 1 }])
})

test('reordering only moves queued transfers', () => {
  const h = harness({ maxActive: 1 })
  h.queue.download('/sdcard/a', 'a', A)
  const b = h.queue.download('/sdcard/b', 'b', A)
  const c = h.queue.download('/sdcard/c', 'c', A)
  h.queue.reorder(c, 'up')
  const queued = h.queue.getSnapshot().filter(t => t.status === 'pending').map(t => t.id).reverse()
  assert.deepEqual(queued, [c, b])
})
