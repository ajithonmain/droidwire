import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compareVersions, isNewerVersion, parseVersion, pickNewestReleaseTag } from '../src/main/lib/version.ts'

test('parses tags with and without v and prerelease', () => {
  assert.deepEqual(parseVersion('v1.2.3'), { major: 1, minor: 2, patch: 3, prerelease: [] })
  assert.deepEqual(parseVersion('1.2.3-beta.1'), { major: 1, minor: 2, patch: 3, prerelease: ['beta', '1'] })
  assert.equal(parseVersion('latest'), null)
  assert.equal(parseVersion('1.2'), null)
})

test('only a strictly higher version is an update', () => {
  assert.equal(isNewerVersion('v1.2.2', '1.2.1'), true)
  assert.equal(isNewerVersion('v1.10.0', '1.9.9'), true)
  assert.equal(isNewerVersion('v1.2.1', '1.2.1'), false)
  // The old behaviour treated any unequal version as newer
  assert.equal(isNewerVersion('v1.1.0', '1.2.1'), false)
  assert.equal(isNewerVersion('v0.9.9', '1.0.0'), false)
})

test('prerelease ordering follows semver', () => {
  assert.equal(isNewerVersion('1.3.0', '1.3.0-beta.2'), true)
  assert.equal(isNewerVersion('1.3.0-beta.2', '1.3.0'), false)
  assert.equal(isNewerVersion('1.3.0-beta.10', '1.3.0-beta.9'), true)
  assert.equal(isNewerVersion('1.3.0-rc.1', '1.3.0-beta.9'), true)
  assert.equal(isNewerVersion('1.3.0-beta', '1.3.0-beta.1'), false)
})

test('unparseable versions never trigger an update', () => {
  assert.equal(isNewerVersion('nightly', '1.2.1'), false)
  assert.equal(isNewerVersion('1.2.3', 'dev'), false)
  assert.equal(compareVersions('x', 'y'), null)
})

test('the newest release is found among prereleases, which /releases/latest would skip', () => {
  const list = [
    { tag_name: 'v1.4.0', draft: false, prerelease: true },
    { tag_name: 'v1.3.0', draft: false, prerelease: false },
    { tag_name: 'v1.0.0-beta', draft: false, prerelease: false },
  ]
  assert.equal(pickNewestReleaseTag(list), 'v1.4.0')
  assert.equal(isNewerVersion(pickNewestReleaseTag(list)!, '1.3.0'), true)
  assert.equal(isNewerVersion(pickNewestReleaseTag(list)!, '1.4.0'), false)
})

test('drafts, unparseable tags and malformed responses are ignored', () => {
  assert.equal(pickNewestReleaseTag([{ tag_name: 'v9.0.0', draft: true }, { tag_name: 'nightly' }, null, 'x', { tag_name: 'v1.3.0' }]), 'v1.3.0')
  assert.equal(pickNewestReleaseTag([]), null)
  assert.equal(pickNewestReleaseTag({ message: 'rate limited' }), null)
  assert.equal(pickNewestReleaseTag([{ tag_name: 'v1.2.0-beta.1' }, { tag_name: 'v1.2.0' }]), 'v1.2.0')
})
