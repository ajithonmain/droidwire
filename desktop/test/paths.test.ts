import { test } from 'node:test'
import assert from 'node:assert/strict'
import { safeFileName, joinInside, isInside, assertRemotePath, assertOperationId, posixDir, posixBase } from '../src/main/lib/paths.ts'

test('safeFileName strips directories and rejects traversal', () => {
  assert.equal(safeFileName('photo.jpg'), 'photo.jpg')
  assert.equal(safeFileName('../../etc/passwd'), 'passwd')
  assert.equal(safeFileName('a/b/c.txt'), 'c.txt')
  assert.equal(safeFileName('..\\..\\evil.exe'), 'evil.exe')
  assert.throws(() => safeFileName('..'))
  assert.throws(() => safeFileName('.'))
  assert.throws(() => safeFileName(''))
  assert.throws(() => safeFileName('a\0b'))
  assert.throws(() => safeFileName('x'.repeat(300)))
  assert.throws(() => safeFileName(42))
})

test('joinInside always stays inside the destination', () => {
  assert.equal(joinInside('/tmp/dl', 'a b.txt'), '/tmp/dl/a b.txt')
  assert.equal(joinInside('/tmp/dl', '../escape'), '/tmp/dl/escape')
  assert.ok(isInside('/tmp/dl', '/tmp/dl/x'))
  assert.ok(!isInside('/tmp/dl', '/tmp/other'))
  assert.ok(!isInside('/tmp/dl', '/tmp/dl/../x'))
})

test('remote path and id validation', () => {
  assert.equal(assertRemotePath('/sdcard/a'), '/sdcard/a')
  assert.throws(() => assertRemotePath('relative'))
  assert.throws(() => assertRemotePath('/a\0b'))
  assert.throws(() => assertRemotePath(''))
  assert.equal(assertOperationId('dl-123_ab'), 'dl-123_ab')
  assert.throws(() => assertOperationId('a/b'))
  assert.throws(() => assertOperationId(''))
})

test('posix dir/base', () => {
  assert.equal(posixDir('/a/b/c'), '/a/b')
  assert.equal(posixDir('/a'), '/')
  assert.equal(posixDir('/a/b/'), '/a')
  assert.equal(posixBase('/a/b/c.txt'), 'c.txt')
})

import { isProtectedRemotePath } from '../src/main/lib/paths.ts'

test('storage roots are protected from destructive operations', () => {
  for (const p of ['/', '/sdcard', '/sdcard/', '/storage/emulated/0', '//storage//emulated/0/', '/sdcard/..', '/sdcard/a/../..']) {
    assert.ok(isProtectedRemotePath(p), p)
  }
  for (const p of ['/sdcard/DCIM', '/storage/emulated/0/Download/x', '/sdcard/a b']) {
    assert.ok(!isProtectedRemotePath(p), p)
  }
})
