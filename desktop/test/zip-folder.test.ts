import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { zipFolder, type ZipEffects, type ZipRequest } from '../src/main/zip-folder.ts'

function sandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-zip-test-'))
  const downloads = path.join(root, 'dl')
  const scratchRoot = path.join(root, 'scratch')
  fs.mkdirSync(downloads)
  fs.mkdirSync(scratchRoot)
  return { root, downloads, scratchRoot, leftovers: () => [...fs.readdirSync(downloads), ...fs.readdirSync(scratchRoot)] }
}

function effects(overrides: Partial<ZipEffects> & { calls?: string[] } = {}): ZipEffects {
  const calls = overrides.calls ?? []
  return {
    deviceHasZip: async () => true,
    runRemote: async c => { calls.push(`run:${c}`) },
    pullFile: async (_r, local) => { calls.push('pull'); fs.writeFileSync(local, 'zipdata') },
    pullTree: async (dir, parent) => {
      calls.push('pullTree')
      const target = path.join(parent, path.basename(dir))
      fs.mkdirSync(target)
      fs.writeFileSync(path.join(target, 'a.txt'), 'x')
      return target
    },
    mirrorMtp: async (_d, local) => { calls.push('mirror'); fs.mkdirSync(local, { recursive: true }) },
    localZip: async (_cwd, out) => { calls.push('localZip'); fs.writeFileSync(out, 'zipdata') },
    removeRemote: async c => { calls.push(`rm:${c}`) },
    ...overrides,
  }
}

function req(sb: ReturnType<typeof sandbox>, extra: Partial<ZipRequest> = {}): ZipRequest {
  return {
    transport: 'adb',
    remoteDir: "/sdcard/My 'Photos'; reboot",
    folderName: "My 'Photos'; reboot",
    destZip: path.join(sb.downloads, "My 'Photos'; reboot.zip"),
    operationId: 'op1',
    signal: new AbortController().signal,
    scratchRoot: sb.scratchRoot,
    ...extra,
  }
}

test('on-device zip: hostile folder name is quoted, archive is per-operation, remote temp removed', async () => {
  const sb = sandbox()
  const calls: string[] = []
  const dest = await zipFolder(req(sb), effects({ calls }))
  assert.equal(fs.readFileSync(dest, 'utf8'), 'zipdata')
  const run = calls.find(c => c.startsWith('run:'))!
  assert.ok(run.includes(`'My '\\''Photos'\\''; reboot'`), run)
  assert.ok(run.includes('/sdcard/.droidwire-zip-op1.zip'))
  assert.ok(calls.some(c => c === `rm:rm -f '/sdcard/.droidwire-zip-op1.zip'`))
  assert.deepEqual(sb.leftovers(), ["My 'Photos'; reboot.zip"])
})

test('concurrent operations use distinct remote archives and scratch dirs', async () => {
  const sb = sandbox()
  const calls: string[] = []
  const r = (id: string) => req(sb, { operationId: id, destZip: path.join(sb.downloads, `${id}.zip`) })
  await Promise.all([zipFolder(r('a'), effects({ calls })), zipFolder(r('b'), effects({ calls }))])
  const remotes = calls.filter(c => c.startsWith('run:')).map(c => c.match(/\.droidwire-zip-(\w+)\.zip/)![1])
  assert.deepEqual(remotes.sort(), ['a', 'b'])
  assert.deepEqual(sb.leftovers().sort(), ['a.zip', 'b.zip'])
})

test('failure while pulling cleans scratch, partial file and the remote archive', async () => {
  const sb = sandbox()
  const calls: string[] = []
  await assert.rejects(
    zipFolder(req(sb), effects({
      calls,
      pullFile: async (_r, local) => { fs.writeFileSync(local, 'half'); throw new Error('device unplugged') },
    })),
    /device unplugged/,
  )
  assert.deepEqual(sb.leftovers(), [])
  assert.ok(calls.some(c => c.startsWith('rm:')), 'remote temp archive must be removed')
})

test('cancellation mid-operation rejects as cancelled and leaves nothing behind', async () => {
  const sb = sandbox()
  const ac = new AbortController()
  const calls: string[] = []
  await assert.rejects(
    zipFolder(req(sb, { signal: ac.signal }), effects({
      calls,
      runRemote: async () => { ac.abort(); throw new Error('adb killed') },
    })),
    /cancelled/i,
  )
  assert.deepEqual(sb.leftovers(), [])
  assert.ok(calls.some(c => c.startsWith('rm:')))
})

test('an existing zip is not destroyed when a replacement fails', async () => {
  const sb = sandbox()
  const dest = path.join(sb.downloads, 'x.zip')
  fs.writeFileSync(dest, 'precious')
  await assert.rejects(
    zipFolder(req(sb, { destZip: dest }), effects({ pullFile: async () => { throw new Error('boom') } })),
    /boom/,
  )
  assert.equal(fs.readFileSync(dest, 'utf8'), 'precious')
})

test('devices without zip fall back to pulling the tree and zipping locally', async () => {
  const sb = sandbox()
  const calls: string[] = []
  await zipFolder(req(sb, { remoteDir: '/sdcard/Pics', folderName: 'Pics', destZip: path.join(sb.downloads, 'Pics.zip') }), effects({
    calls, deviceHasZip: async () => false,
  }))
  assert.deepEqual(calls, ['pullTree', 'localZip'])
  assert.deepEqual(sb.leftovers(), ['Pics.zip'])
})

test('MTP mirrors files locally then zips; no remote commands are issued', async () => {
  const sb = sandbox()
  const calls: string[] = []
  await zipFolder(req(sb, { transport: 'mtp', remoteDir: '/sdcard/Pics', folderName: 'Pics', destZip: path.join(sb.downloads, 'Pics.zip') }), effects({ calls }))
  assert.deepEqual(calls, ['mirror', 'localZip'])
})

test('already-aborted signal does no work', async () => {
  const sb = sandbox()
  const ac = new AbortController()
  ac.abort()
  const calls: string[] = []
  await assert.rejects(zipFolder(req(sb, { signal: ac.signal }), effects({ calls })), /cancelled/i)
  assert.deepEqual(calls, [])
  assert.deepEqual(sb.leftovers(), [])
})
