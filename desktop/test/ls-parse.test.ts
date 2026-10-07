import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseLsLa } from '../src/main/lib/ls-parse.ts'
import { guessMime } from '../src/main/lib/mime.ts'

const SAMPLE = [
  'total 24',
  'drwxrwx--x 2 u0_a1 media_rw 4096 2025-01-02 10:11 My Photos',
  '-rw-rw---- 1 u0_a1 media_rw 1234 2025-01-02 10:12 it\'s a "file".jpg',
  'lrwxrwxrwx 1 root root 10 2025-01-02 10:13 link -> /sdcard/x',
  'drwxrwx--x 2 u0_a1 media_rw 4096 2025-01-02 10:11 .',
  'garbage line',
].join('\n')

test('parseLsLa handles spaces, quotes, links and sorts dirs first', () => {
  const nodes = parseLsLa(SAMPLE, '/sdcard/')
  assert.deepEqual(nodes.map(n => n.name), ['My Photos', 'it\'s a "file".jpg', 'link'])
  assert.equal(nodes[0].type, 'dir')
  assert.equal(nodes[0].path, '/sdcard/My Photos')
  assert.equal(nodes[1].size, 1234)
  assert.equal(nodes[1].mimeType, 'image/jpeg')
})

test('guessMime', () => {
  assert.equal(guessMime('a.PDF'), 'application/pdf')
  assert.equal(guessMime('a.unknownext'), 'application/octet-stream')
  assert.equal(guessMime('noext'), 'application/octet-stream')
})
