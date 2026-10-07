import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

function run(cmd, args) {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return ''
  }
}

export function hasLibmtp(prefix) {
  return !!prefix
    && fs.existsSync(path.join(prefix, 'include', 'libmtp.h'))
    && (fs.existsSync(path.join(prefix, 'lib', 'libmtp.dylib')) || fs.existsSync(path.join(prefix, 'lib', 'libmtp.so')))
}

/** Prefix containing include/libmtp.h and lib/libmtp.dylib, or null. */
export function findLibmtpPrefix() {
  const candidates = [
    process.env.LIBMTP_PREFIX,
    run('brew', ['--prefix', 'libmtp']),
    run('pkg-config', ['--variable=prefix', 'libmtp']),
    '/opt/homebrew/opt/libmtp',
    '/usr/local/opt/libmtp',
    '/opt/homebrew',
    '/usr/local',
  ]
  return candidates.find(hasLibmtp) ?? null
}

/** Compiler/linker search paths so node-gyp can find libmtp outside the default prefixes. */
export function buildEnvFor(prefix) {
  return {
    LIBRARY_PATH: [path.join(prefix, 'lib'), process.env.LIBRARY_PATH].filter(Boolean).join(':'),
    CPATH: [path.join(prefix, 'include'), process.env.CPATH].filter(Boolean).join(':'),
  }
}
