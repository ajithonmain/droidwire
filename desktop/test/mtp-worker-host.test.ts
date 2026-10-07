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
