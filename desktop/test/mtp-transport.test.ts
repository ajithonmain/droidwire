import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createMtpTransport, MTP_STOPPING_MESSAGE, MTP_STUCK_MESSAGE, type MtpEnv } from '../src/main/mtp-transport-core.ts'

// A tiny in-memory MTP device behind the same call() interface as the worker.
interface Obj { type: 'FILE' | 'FOLDER'; size: number }

function fakeDevice(initial: Record<string, Obj>) {
  const objects = new Map<string, Obj>(Object.entries(initial))
  const calls: string[] = []
  const downloads: Array<{ remote: string; device: string | null }> = []
  let connected: string | null = null
  let failNext: string | null = null
  let stopped = 0
  let cancelled = 0
  let exitCb: (() => void) | null = null
  let forcedCb: ((reason: string) => void) | null = null
  let enumerated: Array<{ vendor: string; vendor_id: number; product: string; product_id: number }> = [{ vendor: 'G', vendor_id: 1, product: 'P', product_id: 2 }]
  const parent = (p: string) => p.slice(0, p.lastIndexOf('/')) || '/'
  const join = (dir: string, name: string) => (dir === '/' ? '' : dir) + '/' + name

  const env: MtpEnv = {
    async call<T>(method: string, args: unknown[]): Promise<T> {
      calls.push(`${method}:${args.filter(a => typeof a === 'string').join('|')}`)
      if (failNext === method) { failNext = null; throw new Error(`${method} exploded`) }
      const a = args as string[]
      switch (method) {
        // libmtp cannot open a device its own worker already has open: seen on a real Pixel 4a as
        // "Unable to open MTP device - its USB interface is held by another process"
        case 'connect':
          if (connected) throw new Error('Unable to open MTP device - its USB interface is held by another process.')
          connected = `mtp-${args[0]}-${args[1]}`; return true as T
        case 'release': connected = null; return true as T
        case 'get': {
          const o = objects.get(a[0])
          if (!o) throw new Error('Can not find the file')
          return { type: o.type, modificationdate: 1 } as T
        }
        case 'setFileName':
        case 'setFolderName': {
          const o = objects.get(a[0])
          if (!o) throw new Error('Can not find the file')
          const dest = join(parent(a[0]), a[1])
          if (objects.has(dest)) throw new Error('name already exists')
          objects.delete(a[0]); objects.set(dest, o)
          return true as T
        }
        case 'move': {
          const o = objects.get(a[0])
          if (!o) throw new Error('Can not find the source file to move.')
          const dest = join(a[1], a[0].split('/').pop()!)
          if (objects.has(dest)) throw new Error('target exists')
          objects.delete(a[0]); objects.set(dest, o)
          return true as T
        }
        case 'del': objects.delete(a[0]); return true as T
        case 'upload': {
          const dest = join(a[1], path.basename(a[0]))
          objects.set(dest, { type: 'FILE', size: fs.statSync(a[0]).size })
          return true as T
        }
        case 'getDeviceInfo': return enumerated as T
        case 'getCurrentDeviceStorageInfo': return [] as T
        case 'download': downloads.push({ remote: a[0], device: connected }); return true as T
        default: throw new Error(`unexpected ${method}`)
      }
    },
    cancelTransfer() { cancelled++ },
    stopWorker() { stopped++ },
    onWorkerExit(cb) { exitCb = cb },
    onForcedStop(cb) { forcedCb = cb },
    async evictPtpcamerad() {},
  }
  return {
    env, objects, calls, downloads,
    failNext: (m: string) => { failNext = m },
    names: () => [...objects.keys()].sort(),
    stoppedCount: () => stopped,
    cancelCount: () => cancelled,
    crash: () => { connected = null; exitCb?.() },
    forceStop: () => { forcedCb?.('test'); connected = null; exitCb?.() },
    setEnumerated: (list: typeof enumerated) => { enumerated = list },
  }
}

const SERIAL = 'mtp-1-2'

test('moving to another folder uses a real move, not a rename', async () => {
  const dev = fakeDevice({ '/DCIM': { type: 'FOLDER', size: 0 }, '/Pictures': { type: 'FOLDER', size: 0 }, '/DCIM/a.jpg': { type: 'FILE', size: 5 } })
  const t = createMtpTransport(dev.env)
  await t.moveFile(SERIAL, '/sdcard/DCIM/a.jpg', '/sdcard/Pictures/a.jpg')
  assert.deepEqual(dev.names(), ['/DCIM', '/Pictures', '/Pictures/a.jpg'])
  assert.ok(dev.calls.some(c => c.startsWith('move:/DCIM/a.jpg|/Pictures')))
  assert.ok(!dev.calls.some(c => c.startsWith('setFileName')), 'must not fall back to renaming')
})

test('same-folder move is a rename', async () => {
  const dev = fakeDevice({ '/DCIM': { type: 'FOLDER', size: 0 }, '/DCIM/a.jpg': { type: 'FILE', size: 5 } })
  await createMtpTransport(dev.env).moveFile(SERIAL, '/sdcard/DCIM/a.jpg', '/sdcard/DCIM/b.jpg')
  assert.deepEqual(dev.names(), ['/DCIM', '/DCIM/b.jpg'])
  assert.ok(!dev.calls.some(c => c.startsWith('move:')))
})

test('moving with a new name (keep both) lands under the requested name with no temp leftovers', async () => {
  const dev = fakeDevice({
    '/A': { type: 'FOLDER', size: 0 }, '/B': { type: 'FOLDER', size: 0 },
    '/A/x.txt': { type: 'FILE', size: 1 }, '/B/x.txt': { type: 'FILE', size: 2 },
  })
  await createMtpTransport(dev.env).moveFile(SERIAL, '/sdcard/A/x.txt', '/sdcard/B/x (1).txt')
  assert.deepEqual(dev.names(), ['/A', '/B', '/B/x (1).txt', '/B/x.txt'])
  assert.equal(dev.objects.get('/B/x.txt')!.size, 2, 'the colliding file must be untouched')
})

test('moving over an existing file replaces it', async () => {
  const dev = fakeDevice({
    '/A': { type: 'FOLDER', size: 0 }, '/B': { type: 'FOLDER', size: 0 },
    '/A/x.txt': { type: 'FILE', size: 1 }, '/B/x.txt': { type: 'FILE', size: 2 },
  })
  await createMtpTransport(dev.env).moveFile(SERIAL, '/sdcard/A/x.txt', '/sdcard/B/x.txt')
  assert.deepEqual(dev.names(), ['/A', '/B', '/B/x.txt'])
  assert.equal(dev.objects.get('/B/x.txt')!.size, 1, 'the moved file wins')
})

test('a failed move restores the original name and explains the limitation', async () => {
  const dev = fakeDevice({
    '/A': { type: 'FOLDER', size: 0 }, '/B': { type: 'FOLDER', size: 0 },
    '/A/x.txt': { type: 'FILE', size: 1 }, '/B/x.txt': { type: 'FILE', size: 2 },
  })
  dev.failNext('move')
  await assert.rejects(
    createMtpTransport(dev.env).moveFile(SERIAL, '/sdcard/A/x.txt', '/sdcard/B/x (1).txt'),
    /MTP move failed.*copy the item, then delete the original/,
  )
  assert.deepEqual(dev.names(), ['/A', '/A/x.txt', '/B', '/B/x.txt'])
})

test('a push that replaces uploads first, so a failed upload keeps the original', async () => {
  const dev = fakeDevice({ '/Download': { type: 'FOLDER', size: 0 }, '/Download/doc.txt': { type: 'FILE', size: 99 } })
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-mtp-test-'))
  const local = path.join(dir, 'doc.txt')
  fs.writeFileSync(local, 'new')
  const t = createMtpTransport(dev.env)

  dev.failNext('upload')
  await assert.rejects(t.pushFile(SERIAL, local, '/sdcard/Download/doc.txt'), /MTP upload failed/)
  assert.equal(dev.objects.get('/Download/doc.txt')!.size, 99)
  assert.deepEqual(dev.names(), ['/Download', '/Download/doc.txt'])

  await t.pushFile(SERIAL, local, '/sdcard/Download/doc.txt')
  assert.equal(dev.objects.get('/Download/doc.txt')!.size, 3)
  assert.deepEqual(dev.names(), ['/Download', '/Download/doc.txt'])
})

test('operations for different devices never interleave on the single libmtp session', async () => {
  const dev = fakeDevice({ '/f': { type: 'FILE', size: 1 } })
  const t = createMtpTransport(dev.env)
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-mtp-test-'))
  await Promise.all([
    t.pullFile('mtp-1-1', '/sdcard/f', path.join(dir, 'a')),
    t.pullFile('mtp-2-2', '/sdcard/f', path.join(dir, 'b')),
    t.pullFile('mtp-1-1', '/sdcard/f', path.join(dir, 'c')),
  ])
  // Every download ran while *its own* device was the open session
  assert.deepEqual(dev.downloads.map(d => d.device), ['mtp-1-1', 'mtp-2-2', 'mtp-1-1'])
})

test('an operation cancelled while waiting for the session never starts', async () => {
  const dev = fakeDevice({ '/f': { type: 'FILE', size: 1 } })
  const t = createMtpTransport(dev.env)
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-mtp-test-'))
  const ac = new AbortController()
  const first = t.pullFile(SERIAL, '/sdcard/f', path.join(dir, 'a'))
  const second = t.pullFile(SERIAL, '/sdcard/f', path.join(dir, 'b'), { signal: ac.signal })
  ac.abort()
  await first
  await assert.rejects(second, /cancelled/i)
  assert.equal(dev.downloads.length, 1)
})

test('aborting a running transfer asks libmtp to cancel it cleanly instead of killing the worker', async () => {
  const dev = fakeDevice({})
  const t = createMtpTransport({
    ...dev.env,
    call: async (method, args, onProgress) => {
      if (method === 'download') {
        await new Promise(r => setTimeout(r, 30))
        throw new Error('MTP worker stopped')
      }
      return dev.env.call(method, args, onProgress)
    },
  })
  const ac = new AbortController()
  const p = t.pullFile(SERIAL, '/sdcard/f', '/tmp/ignored', { signal: ac.signal })
  setTimeout(() => ac.abort(), 5)
  await assert.rejects(p, /cancelled/i)
  assert.equal(dev.cancelCount(), 1)
  assert.equal(dev.stoppedCount(), 0, 'a clean cancel must not kill the worker (that wedges the phone)')
})

test('after the worker dies the next operation reconnects instead of running session-less', async () => {
  const dev = fakeDevice({ '/f': { type: 'FILE', size: 1 } })
  const t = createMtpTransport(dev.env)
  await t.pullFile(SERIAL, '/sdcard/f', '/tmp/x')
  dev.crash()
  await t.pullFile(SERIAL, '/sdcard/f', '/tmp/y')
  assert.equal(dev.calls.filter(c => c.startsWith('connect')).length, 2)
  assert.equal(dev.downloads[1].device, SERIAL)
})

test('after a failed operation the next call releases the stale session instead of colliding with it', async () => {
  // Real-phone bug: a download of a missing file made every later operation fail with "Could not open MTP session"
  const dev = fakeDevice({ '/a.txt': { type: 'FILE', size: 1 }, '/b.txt': { type: 'FILE', size: 1 } })
  const t = createMtpTransport(dev.env)
  await t.deleteFile(SERIAL, '/sdcard/a.txt')
  dev.failNext('download')
  await assert.rejects(t.pullFile(SERIAL, '/sdcard/missing.txt', path.join(os.tmpdir(), 'dw-never.txt')), /MTP download failed/)
  await t.deleteFile(SERIAL, '/sdcard/b.txt') // must reconnect cleanly
  assert.deepEqual(dev.names(), [])
  assert.ok(dev.calls.some(c => c.startsWith('release')), 'stale session was never released')
})

test('a worker that died does not trigger a pointless release before reconnecting', async () => {
  const dev = fakeDevice({ '/a.txt': { type: 'FILE', size: 1 }, '/b.txt': { type: 'FILE', size: 1 } })
  const t = createMtpTransport(dev.env)
  await t.deleteFile(SERIAL, '/sdcard/a.txt')
  dev.crash()
  const before = dev.calls.filter(c => c.startsWith('release')).length
  await t.deleteFile(SERIAL, '/sdcard/b.txt')
  assert.equal(dev.calls.filter(c => c.startsWith('release')).length, before)
})

test('after a force-stopped worker new operations are refused with recovery instructions, until Rescan or a replug', async () => {
  const dev = fakeDevice({ '/a.txt': { type: 'FILE', size: 1 }, '/b.txt': { type: 'FILE', size: 1 } })
  const t = createMtpTransport(dev.env)
  await t.deleteFile(SERIAL, '/sdcard/a.txt')
  dev.forceStop()
  await assert.rejects(t.deleteFile(SERIAL, '/sdcard/b.txt'), (e: Error) => e.message === MTP_STUCK_MESSAGE)
  assert.match(MTP_STUCK_MESSAGE, /Unplug the cable.*File transfer.*Rescan/s)
  assert.ok(dev.names().includes('/b.txt'), 'nothing was attempted against the stuck phone')
  t.resetHealth?.() // Rescan
  await t.deleteFile(SERIAL, '/sdcard/b.txt')
  assert.deepEqual(dev.names(), [])
})

test('unplugging the phone clears the stuck verdict', async () => {
  const dev = fakeDevice({ '/a.txt': { type: 'FILE', size: 1 } })
  const t = createMtpTransport(dev.env)
  dev.forceStop()
  await assert.rejects(t.deleteFile(SERIAL, '/sdcard/a.txt'), /not answering/)
  dev.setEnumerated([])
  assert.deepEqual(await t.getDevices(), [])
  await t.deleteFile(SERIAL, '/sdcard/a.txt').catch(() => {})
  assert.deepEqual(dev.names(), [], 'after the unplug the phone is probed again')
})

test('while a cancelled transfer is still being stopped, new operations are refused instead of queueing blindly', async () => {
  const dev = fakeDevice({ '/b.txt': { type: 'FILE', size: 1 } })
  let release: () => void = () => {}
  const t = createMtpTransport({
    ...dev.env,
    call: async (method, args, onProgress) => {
      if (method === 'download') { await new Promise<void>(r => { release = r }); throw new Error('cancelled by libmtp') }
      return dev.env.call(method, args, onProgress)
    },
  })
  const ac = new AbortController()
  const transfer = t.pullFile(SERIAL, '/sdcard/f', '/tmp/ignored', { signal: ac.signal })
  transfer.catch(() => {})
  await new Promise(r => setTimeout(r, 10))
  ac.abort()
  await assert.rejects(t.deleteFile(SERIAL, '/sdcard/b.txt'), (e: Error) => e.message === MTP_STOPPING_MESSAGE)
  release()
  await assert.rejects(transfer, /cancelled/i)
  await t.deleteFile(SERIAL, '/sdcard/b.txt') // the phone is free again
  assert.deepEqual(dev.names(), [])
})

test('an MTP refusal of a name Android rejects says why; other failures get no such hint', async () => {
  const dev = fakeDevice({ '/a.txt': { type: 'FILE', size: 1 } })
  const t = createMtpTransport(dev.env)
  dev.failNext('setFileName')
  await assert.rejects(t.renameFile(SERIAL, '/sdcard/a.txt', 'say "hi".txt'), /MTP rename failed:.*Android does not allow "\"" in file names/)
  dev.failNext('setFileName')
  await assert.rejects(t.renameFile(SERIAL, '/sdcard/a.txt', 'plain.txt'), (e: Error) => /MTP rename failed/.test(e.message) && !/Android does not allow/.test(e.message))
})
