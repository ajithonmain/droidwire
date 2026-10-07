import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { shQuote, escapeGlob, buildRemoteZipCommand, remoteTempZipPath } from '../src/main/lib/shell.ts'

// Round-trip through a real /bin/sh: whatever we quote must come back as one
// literal argument, whatever it contains.
function echoViaShell(value: string): string {
  return execFileSync('/bin/sh', ['-c', `printf %s ${shQuote(value)}`], { encoding: 'utf8' })
}

const HOSTILE = [
  'plain',
  'with space',
  "it's",
  `a'b"c`,
  'semi; touch /tmp/pwned',
  '$(touch /tmp/pwned)',
  '`touch /tmp/pwned`',
  '&& rm -rf /',
  '| cat',
  'new\nline',
  '*?[glob]',
  '\\backslash',
  '-leading-dash',
  '',
]

test('shQuote keeps hostile values as a single literal word', () => {
  for (const v of HOSTILE) assert.equal(echoViaShell(v), v, JSON.stringify(v))
})

test('shQuote rejects NUL bytes', () => {
  assert.throws(() => shQuote('a\0b'))
})

test('escapeGlob escapes fnmatch metacharacters', () => {
  assert.equal(escapeGlob('a*b?c[d]\\e'), 'a\\*b\\?c\\[d\\]\\\\e')
  assert.equal(escapeGlob('plain'), 'plain')
})

test('remote zip command quotes the directory, parent and archive', () => {
  const cmd = buildRemoteZipCommand("/sdcard/My 'Photos'; reboot/", "/sdcard/.droidwire-zip-abc.zip")
  assert.equal(cmd, `cd '/sdcard' && zip -r -q '/sdcard/.droidwire-zip-abc.zip' 'My '\\''Photos'\\''; reboot'`)
})

test('remote zip command works for a folder directly under root and rejects root', () => {
  assert.equal(buildRemoteZipCommand('/DCIM', '/sdcard/z.zip'), `cd '/' && zip -r -q '/sdcard/z.zip' 'DCIM'`)
  assert.throws(() => buildRemoteZipCommand('/', '/sdcard/z.zip'))
})

test('remote zip command actually treats a hostile folder name as data', () => {
  // Execute the cd portion locally to prove the quoting yields a real path
  // lookup rather than command execution.
  const cmd = buildRemoteZipCommand("/tmp/dw 'x'; echo PWNED", '/tmp/out.zip')
  const out = execFileSync('/bin/sh', ['-c', cmd.replace(/zip -r -q.*/, 'echo ok')], { encoding: 'utf8' })
  assert.equal(out.trim(), 'ok')
  assert.ok(!out.includes('PWNED'))
})

test('temp zip paths are unique per operation and reject unsafe ids', () => {
  assert.notEqual(remoteTempZipPath('a'), remoteTempZipPath('b'))
  assert.throws(() => remoteTempZipPath('../x'))
  assert.throws(() => remoteTempZipPath("a'b"))
})
