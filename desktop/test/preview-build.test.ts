import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { buildPreview, TEXT_PREVIEW_BYTES } from '../src/main/preview-build.ts'

function tmp(name: string, content: Buffer | string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-preview-test-'))
  const p = path.join(dir, name)
  fs.writeFileSync(p, content)
  return p
}

test('text preview returns decoded text (not a data URL or file path)', async () => {
  const p = tmp('notes.txt', 'hello\nwörld')
  assert.deepEqual(await buildPreview(p, 'notes.txt'), { kind: 'text', text: 'hello\nwörld', truncated: false })
})

test('text preview is capped at the size limit and flagged truncated', async () => {
  const p = tmp('big.log', 'a'.repeat(TEXT_PREVIEW_BYTES + 5000))
  const r = await buildPreview(p, 'big.log')
  assert.ok(r && r.kind === 'text')
  assert.equal(r.text.length, TEXT_PREVIEW_BYTES)
  assert.equal(r.truncated, true)
})

test('json and shell scripts count as text, binary content does not', async () => {
  assert.equal((await buildPreview(tmp('a.json', '{"a":1}'), 'a.json'))?.kind, 'text')
  assert.equal((await buildPreview(tmp('run.sh', '#!/bin/sh\necho hi'), 'run.sh'))?.kind, 'text')
  assert.equal(await buildPreview(tmp('fake.txt', Buffer.from([0x50, 0x4b, 0x00, 0x03])), 'fake.txt'), null)
})

test('images and audio come back as correctly typed data URLs', async () => {
  const png = await buildPreview(tmp('a.png', Buffer.from('PNGDATA')), 'a.png')
  assert.deepEqual(png, { kind: 'image', dataUrl: `data:image/png;base64,${Buffer.from('PNGDATA').toString('base64')}` })
  const mp3 = await buildPreview(tmp('a.mp3', Buffer.from('ID3')), 'a.mp3')
  assert.ok(mp3 && mp3.kind === 'audio' && mp3.dataUrl.startsWith('data:audio/mpeg;base64,'))
})

test('empty files and unsupported types have no preview', async () => {
  assert.equal(await buildPreview(tmp('empty.txt', ''), 'empty.txt'), null)
  assert.equal(await buildPreview(tmp('x.apk', 'abc'), 'x.apk'), null)
  assert.equal(await buildPreview(path.join(os.tmpdir(), 'dw-does-not-exist.txt'), 'dw-does-not-exist.txt'), null)
})
