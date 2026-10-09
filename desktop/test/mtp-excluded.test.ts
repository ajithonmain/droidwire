import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isMtpExcluded, MTP_EXCLUDED_MESSAGE, MTP_MARKER_FILE } from '../src/main/lib/mtp-excluded.ts'

test('a build is "without MTP" only when the release marker file is in Resources', () => {
  assert.equal(isMtpExcluded('/App/Resources', p => p === `/App/Resources/${MTP_MARKER_FILE}`), true)
  assert.equal(isMtpExcluded('/App/Resources', () => false), false)
})

test('the message tells the user what to use instead', () => {
  assert.match(MTP_EXCLUDED_MESSAGE, /not included/i)
  assert.match(MTP_EXCLUDED_MESSAGE, /USB/)
  assert.match(MTP_EXCLUDED_MESSAGE, /Wi-Fi/)
})
