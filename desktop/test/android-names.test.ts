import { test } from 'node:test'
import assert from 'node:assert/strict'
import { androidForbiddenChars, explainRemoteNameError } from '../src/main/lib/android-names.ts'
import { cleanIpcError } from '../src/renderer/lib/errors.ts'

// Observed on a Pixel 4a (Android 13): touching or renaming to a name containing a double quote on
// /sdcard fails with a bare "Operation not permitted"; apostrophes, semicolons, $(), backticks,
// ampersands, spaces and non-Latin letters are all accepted.
test('only the characters Android shared storage rejects are reported', () => {
  assert.deepEqual(androidForbiddenChars('say "hi".txt'), ['"'])
  assert.deepEqual(androidForbiddenChars('a:b*c?.txt'), [':', '*', '?'])
  assert.deepEqual(androidForbiddenChars("it's; a & b $(x) `y` éü-日本 [z].txt"), [])
})

test('a refused name is explained instead of "Operation not permitted"', () => {
  const err = explainRemoteNameError(new Error("mv: bad '/sdcard/x': Operation not permitted"), 'say "hi".txt')
  assert.match(err.message, /Android does not allow "\"" in file names/)
  assert.match(err.message, /say "hi"\.txt/)
})

test('unrelated failures are passed through untouched', () => {
  const original = new Error('adb: device offline')
  assert.equal(explainRemoteNameError(original, 'say "hi".txt'), original)
  const refused = new Error('Operation not permitted')
  assert.equal(explainRemoteNameError(refused, 'plain.txt'), refused)
})

test('ipc wrapper text is removed from user-facing errors', () => {
  assert.equal(cleanIpcError("Error invoking remote method 'adb:push': Error: Android does not allow"), 'Android does not allow')
  assert.equal(cleanIpcError('plain message'), 'plain message')
})
