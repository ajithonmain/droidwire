import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { Readable } from 'node:stream'
import { BLOCK, createStreamServer, parseRange, type ReaderProc, type StreamEntry } from '../src/main/stream-server.ts'

const SIZE = 300_000
const FILE = Buffer.from(Array.from({ length: SIZE }, (_, i) => i % 251))

function fakeReader(spawned: Array<{ entry: StreamEntry; blockStart: number; blockCount: number }>) {
  return (entry: StreamEntry, blockSize: number, blockStart: number, blockCount: number): ReaderProc => {
    spawned.push({ entry, blockStart, blockCount })
    const data = FILE.subarray(blockStart * blockSize, (blockStart + blockCount) * blockSize)
    const stdout = Readable.from([data])
    return { stdout, kill: () => stdout.destroy(), on: () => undefined }
  }
}

function get(url: string, headers: Record<string, string> = {}): Promise<{ status: number; body: Buffer; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    http.get(url, { headers }, res => {
      const chunks: Buffer[] = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks), headers: res.headers }))
    }).on('error', reject)
  })
}

test('parseRange handles full, partial, open-ended, suffix and invalid ranges', () => {
  assert.deepEqual(parseRange(undefined, 100), { start: 0, end: 99, partial: false })
  assert.deepEqual(parseRange('bytes=10-19', 100), { start: 10, end: 19, partial: true })
  assert.deepEqual(parseRange('bytes=90-', 100), { start: 90, end: 99, partial: true })
  assert.deepEqual(parseRange('bytes=-10', 100), { start: 90, end: 99, partial: true })
  assert.deepEqual(parseRange('bytes=0-999', 100), { start: 0, end: 99, partial: true })
  for (const bad of ['bytes=100-', 'bytes=5-2', 'bytes=-', 'garbage', 'bytes=1-2,5-6']) {
    assert.equal(parseRange(bad, 100), 'invalid', bad)
  }
  assert.equal(parseRange(undefined, 0), 'invalid')
  // open-ended reads are capped so a probe cannot request the whole file
  const big = parseRange('bytes=0-', 100 * 1024 * 1024)
  assert.ok(big !== 'invalid' && big.end - big.start + 1 === 4 * 1024 * 1024)
})

test('serves exact byte ranges for a registered token', async () => {
  const spawned: Parameters<typeof fakeReader>[0] = []
  const server = createStreamServer({ spawnReader: fakeReader(spawned) })
  try {
    await server.ensure()
    const url = server.register({ serial: 'DEV1', remotePath: '/sdcard/a.mp4', size: SIZE })

    const full = await get(url, { Range: 'bytes=0-9' })
    assert.equal(full.status, 206)
    assert.deepEqual(full.body, FILE.subarray(0, 10))

    // A range starting mid-block must be aligned to blocks then trimmed
    const start = BLOCK + 123
    const mid = await get(url, { Range: `bytes=${start}-${start + 999}` })
    assert.equal(mid.status, 206)
    assert.equal(mid.headers['content-range'], `bytes ${start}-${start + 999}/${SIZE}`)
    assert.deepEqual(mid.body, FILE.subarray(start, start + 1000))

    // The reader is bound to the device the entry was registered for
    assert.ok(spawned.every(s => s.entry.serial === 'DEV1' && s.entry.remotePath === '/sdcard/a.mp4'))
  } finally {
    server.shutdown()
  }
})

test('rejects unknown tokens, wrong Host, bad ranges and non-GET', async () => {
  const server = createStreamServer({ spawnReader: fakeReader([]) })
  try {
    const port = await server.ensure()
    const url = server.register({ serial: 'D', remotePath: '/x', size: SIZE })
    const token = url.split('/').pop()!

    assert.equal((await get(`http://127.0.0.1:${port}/v/${'0'.repeat(32)}`)).status, 404)
    assert.equal((await get(`http://127.0.0.1:${port}/v/..%2f..%2fetc%2fpasswd`)).status, 404)
    assert.equal((await get(`http://127.0.0.1:${port}/?p=/sdcard/secret.jpg`)).status, 404)
    // DNS-rebinding style request: right port, attacker-controlled Host
    assert.equal((await get(url, { Host: `evil.example:${port}` })).status, 403)
    assert.equal((await get(`http://127.0.0.1:${port}/v/${token}`, { Range: 'bytes=999999999-' })).status, 416)

    const status = await new Promise<number>(resolve => {
      const req = http.request(url, { method: 'POST' }, res => { res.resume(); resolve(res.statusCode ?? 0) })
      req.end()
    })
    assert.equal(status, 403)
  } finally {
    server.shutdown()
  }
})

test('shutdown clears tokens and kills in-flight readers', async () => {
  let killed = 0
  const hanging = (): ReaderProc => ({ stdout: new Readable({ read() {} }), kill: () => { killed++ }, on: () => undefined })
  const server = createStreamServer({ spawnReader: hanging })
  const port = await server.ensure()
  const url = server.register({ serial: 'D', remotePath: '/x', size: SIZE })
  const pending = get(url, { Range: 'bytes=0-9' }).catch(() => null)
  await new Promise(r => setTimeout(r, 50))
  server.shutdown()
  await pending
  assert.ok(killed >= 1)
  assert.throws(() => server.register({ serial: 'D', remotePath: '/x', size: 1 }))
  assert.ok(port > 0)
})
