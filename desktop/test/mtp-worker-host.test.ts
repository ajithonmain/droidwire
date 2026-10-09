import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { MtpWorkerHost, type WorkerChild } from '../src/main/mtp-worker-host.ts'

class FakeChild extends EventEmitter implements WorkerChild {
  connected = true
  killed = false
  sent: Array<{ id: number; method: string; args: unknown[] }> = []
  send(message: unknown, cb?: (err: Error | null) => void): boolean {
    this.sent.push(message as { id: number; method: string; args: unknown[] })
    cb?.(null)
    return true
  }
  kill(): void {
    this.killed = true
  }
  ready(): void { this.emit('message', { type: 'ready' }) }
  reply(id: number, result: unknown): void { this.emit('message', { id, type: 'result', ok: true, result }) }
  start(id: number): void { this.emit('message', { id, type: 'started' }) }
}

function harness(opts: { startupTimeoutMs?: number; quietMs?: number } = {}) {
  const children: FakeChild[] = []
  const host = new MtpWorkerHost(() => {
    const c = new FakeChild()
    children.push(c)
    return c
  }, {
    startupTimeoutMs: opts.startupTimeoutMs ?? 1000,
    quietTimeoutMs: () => opts.quietMs ?? 1000,
  })
  return { host, children }
}

const tick = () => new Promise(r => setImmediate(r))

test('a call resolves with the worker result', async () => {
  const { host, children } = harness()
  const p = host.call<number>('getList', ['/'])
  children[0].ready()
  await tick()
  assert.equal(children[0].sent[0].method, 'getList')
  children[0].reply(children[0].sent[0].id, 42)
  assert.equal(await p, 42)
  assert.equal(host.pendingCount(), 0)
})

test('worker exiting before ready rejects the call instead of hanging', async () => {
  const { host, children } = harness()
  const p = host.call('connect', [])
  children[0].emit('exit', 1, null)
  await assert.rejects(p, /crashed/)
  assert.equal(host.isRunning(), false)
})

test('a worker that never becomes ready times out and is killed', async () => {
  const { host, children } = harness({ startupTimeoutMs: 20 })
  await assert.rejects(host.call('connect', []), /failed to start/)
  assert.ok(children[0].killed)
  assert.equal(host.isRunning(), false)
})

test('spawn failure surfaces as a rejection and the next call retries', async () => {
  let attempts = 0
  const children: FakeChild[] = []
  const host = new MtpWorkerHost(() => {
    attempts++
    if (attempts === 1) throw new Error('worker script missing')
    const c = new FakeChild(); children.push(c); return c
  }, { startupTimeoutMs: 1000 })
  await assert.rejects(host.call('connect', []), /worker script missing/)
  const p = host.call('connect', [])
  children[0].ready()
  await tick()
  children[0].reply(children[0].sent[0].id, true)
  assert.equal(await p, true)
})

test('crash mid-call rejects in-flight calls and notifies listeners', async () => {
  const { host, children } = harness()
  let exits = 0
  host.onExit(() => { exits++ })
  const p = host.call('download', ['/a', '/tmp/a'])
  children[0].ready()
  await tick()
  children[0].emit('exit', null, 'SIGSEGV')
  await assert.rejects(p, /crashed/)
  assert.equal(exits, 1)
})

test('stop() rejects pending calls immediately and the next call spawns a fresh worker', async () => {
  const { host, children } = harness()
  const p = host.call('download', ['/a', '/tmp/a'])
  children[0].ready()
  await tick()
  host.stop('cancelled')
  await assert.rejects(p, /cancelled/)
  assert.ok(children[0].killed)

  const p2 = host.call('getList', ['/'])
  assert.equal(children.length, 2)
  children[1].ready()
  await tick()
  children[1].reply(children[1].sent[0].id, ['x'])
  assert.deepEqual(await p2, ['x'])
})

test('a late exit from a killed worker does not clobber its replacement', async () => {
  const { host, children } = harness()
  let exits = 0
  host.onExit(() => { exits++ })

  const first = host.call('getList', ['/'])
  children[0].ready()
  await tick()
  host.stop('restart')
  await assert.rejects(first, /restart/)
  assert.equal(exits, 1)

  // Replacement worker is up and has a call in flight
  const second = host.call('getList', ['/b'])
  children[1].ready()
  await tick()

  // The old process finally reports its exit
  children[0].emit('exit', null, 'SIGTERM')

  assert.equal(host.isRunning(), true, 'replacement must stay current')
  assert.equal(host.pendingCount(), 1, 'replacement call must not be rejected')
  assert.equal(exits, 1, 'stale exit must not invalidate the new session')
  children[1].reply(children[1].sent[0].id, 'ok')
  assert.equal(await second, 'ok')
})

test('a silent call kills the worker; progress ticks keep it alive', async () => {
  const { host, children } = harness({ quietMs: 60 })
  const progress: number[] = []
  const p = host.call('download', ['/a', '/tmp/a'], sent => progress.push(sent))
  children[0].ready()
  await tick()
  const id = children[0].sent[0].id
  children[0].start(id)
  await new Promise(r => setTimeout(r, 40))
  children[0].emit('message', { id, type: 'progress', sent: 10, total: 100 })
  await new Promise(r => setTimeout(r, 40))
  // 80ms elapsed in total but progress at 40ms re-armed the clock
  assert.equal(host.isRunning(), true)
  await assert.rejects(p, /stopped responding/)
  assert.deepEqual(progress, [10])
  assert.ok(children[0].killed)
})

test('queued calls are not timed out before the worker starts them', async () => {
  const { host, children } = harness({ quietMs: 30 })
  const p = host.call('getList', ['/'])
  children[0].ready()
  await tick()
  await new Promise(r => setTimeout(r, 80)) // waited in the worker's queue, never 'started'
  assert.equal(host.isRunning(), true)
  children[0].reply(children[0].sent[0].id, 'late')
  assert.equal(await p, 'late')
})

test('worker errors are propagated as rejections', async () => {
  const { host, children } = harness()
  const p = host.call('del', ['/x'])
  children[0].ready()
  await tick()
  children[0].emit('message', { id: children[0].sent[0].id, type: 'result', ok: false, error: 'boom' })
  await assert.rejects(p, /boom/)
})

// Clean cancel: killing the worker mid-transfer wedged a real Pixel 4a's MTP responder until the cable
// was replugged, so a transfer is first asked to stop through libmtp's progress callback.
function cancelHarness(graceMs: number) {
  const children: FakeChild[] = []
  const raised: FakeChild[] = []
  const host = new MtpWorkerHost(() => { const c = new FakeChild(); children.push(c); return c }, {
    startupTimeoutMs: 1000, quietTimeoutMs: () => 1000, cancelGraceMs: graceMs,
    requestCancel: child => { raised.push(child as FakeChild) },
  })
  return { host, children, raised }
}

test('cancelling a running transfer raises the cancel flag and does not kill the worker', async () => {
  const { host, children, raised } = cancelHarness(500)
  const p = host.call('download', ['/f', '/tmp/x'])
  children[0].ready(); await tick()
  const id = children[0].sent[0].id
  children[0].start(id)
  host.cancelTransfer()
  assert.equal(raised.length, 1)
  assert.equal(children[0].killed, false)
  // libmtp aborts, the worker answers with an error, the call settles
  children[0].emit('message', { id, type: 'result', ok: false, error: 'download cancelled' })
  await assert.rejects(p, /cancelled/)
  assert.equal(children[0].killed, false)
  assert.equal(host.isRunning(), true)
})

test('a transfer that ignores the cancel request is killed after the grace period', async () => {
  const { host, children, raised } = cancelHarness(30)
  const p = host.call('upload', ['/tmp/x', '/'])
  p.catch(() => {})
  children[0].ready(); await tick()
  children[0].start(children[0].sent[0].id)
  host.cancelTransfer()
  assert.equal(raised.length, 1)
  await new Promise(r => setTimeout(r, 80))
  assert.equal(children[0].killed, true)
  await assert.rejects(p, /cancelled/)
})

test('cancelling when no transfer is running does nothing', async () => {
  const { host, children, raised } = cancelHarness(30)
  const p = host.call('getList', ['/'])
  children[0].ready(); await tick()
  host.cancelTransfer()
  assert.equal(raised.length, 0)
  assert.equal(children[0].killed, false)
  children[0].reply(children[0].sent[0].id, [])
  await p
})

test('a cancelled transfer is not killed by the quiet timer while libmtp winds it down', async () => {
  const children: FakeChild[] = []
  const host = new MtpWorkerHost(() => { const c = new FakeChild(); children.push(c); return c }, {
    startupTimeoutMs: 1000, quietTimeoutMs: () => 30, cancelGraceMs: 400, requestCancel: () => {},
  })
  const p = host.call('download', ['/f', '/tmp/x']); p.catch(() => {})
  children[0].ready(); await tick()
  const id = children[0].sent[0].id
  children[0].start(id)
  host.cancelTransfer()
  await new Promise(r => setTimeout(r, 150)) // five times the quiet timeout, no progress from the worker
  assert.equal(children[0].killed, false, 'the quiet timer must not kill a transfer that is being cancelled')
  children[0].emit('message', { id, type: 'result', ok: false, error: 'cancelled' })
  await assert.rejects(p, /cancelled/)
  assert.equal(children[0].killed, false)
})

test('only a forced kill is reported as a forced stop; a clean cancel is not', async () => {
  const forced: string[] = []
  const mk = (graceMs: number) => {
    const children: FakeChild[] = []
    const host = new MtpWorkerHost(() => { const c = new FakeChild(); children.push(c); return c }, {
      startupTimeoutMs: 1000, quietTimeoutMs: () => 1000, cancelGraceMs: graceMs, requestCancel: () => {},
    })
    host.onForcedStop(r => forced.push(r))
    return { host, children }
  }
  // clean: the worker answers within the grace period
  const a = mk(200)
  const pa = a.host.call('upload', ['/tmp/x', '/']); pa.catch(() => {})
  a.children[0].ready(); await tick(); const ida = a.children[0].sent[0].id; a.children[0].start(ida)
  a.host.cancelTransfer()
  a.children[0].emit('message', { id: ida, type: 'result', ok: false, error: 'cancelled' })
  await new Promise(r => setTimeout(r, 250))
  assert.deepEqual(forced, [])
  // forced: it does not
  const b = mk(30)
  const pb = b.host.call('download', ['/f', '/tmp/y']); pb.catch(() => {})
  b.children[0].ready(); await tick(); b.children[0].start(b.children[0].sent[0].id)
  b.host.cancelTransfer()
  await new Promise(r => setTimeout(r, 80))
  assert.equal(forced.length, 1)
  assert.equal(b.children[0].killed, true)
})
