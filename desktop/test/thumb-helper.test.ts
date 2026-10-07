import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Exercises the real AVFoundation helper (macOS only, skipped when it has not been built:
// run `bash native/thumb/build.sh`). Videos are read over HTTP range requests, exactly as
// the app reads them from a phone through its loopback server.
const here = path.dirname(fileURLToPath(import.meta.url))
const helper = process.env.DROIDWIRE_THUMB ?? path.join(here, '..', '..', 'native', '.out', 'thumb', 'droidwire-thumb')
const fixture = path.join(here, 'fixtures', 'sample.mp4')
const available = process.platform === 'darwin' && fs.existsSync(helper)

function rangeServer(file: string, requests: string[]): Promise<http.Server> {
  const size = fs.statSync(file).size
  const server = http.createServer((req, res) => {
    const m = (req.headers.range ?? '').match(/bytes=(\d*)-(\d*)/)
    requests.push(req.headers.range ?? 'full')
    let a = 0, b = size - 1
    if (m) { if (m[1]) a = +m[1]; b = m[2] ? Math.min(+m[2], size - 1) : size - 1 }
    res.writeHead(m ? 206 : 200, {
      'Accept-Ranges': 'bytes', 'Content-Length': b - a + 1, 'Content-Type': 'video/mp4',
      ...(m ? { 'Content-Range': `bytes ${a}-${b}/${size}` } : {}),
    })
    fs.createReadStream(file, { start: a, end: b }).pipe(res)
  })
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)))
}

const isJpeg = (p: string) => { const b = fs.readFileSync(p); return b.length > 500 && b[0] === 0xff && b[1] === 0xd8 }

test('writes a JPEG poster frame from a local file', { skip: !available }, () => {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dw-thumb-')), 'a.jpg')
  const r = spawnSync(helper, [fixture, out, '64'])
  assert.equal(r.status, 0, r.stderr.toString())
  assert.ok(isJpeg(out))
})

test('reads the video over HTTP range requests, as it does from the phone', { skip: !available }, async () => {
  const requests: string[] = []
  const server = await rangeServer(fixture, requests)
  try {
    const { port } = server.address() as { port: number }
    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dw-thumb-')), 'b.jpg')
    // Asynchronous on purpose: a blocking spawn would freeze the server the helper is reading from
    const r = await new Promise<{ status: number | null; stderr: string }>(resolve => {
      const p = spawn(helper, [`http://127.0.0.1:${port}/v/token`, out, '64'])
      let stderr = ''
      p.stderr.on('data', d => { stderr += d })
      p.on('close', status => resolve({ status, stderr }))
    })
    assert.equal(r.status, 0, r.stderr)
    assert.ok(isJpeg(out))
    assert.ok(requests.some(q => q.startsWith('bytes=')), 'must use range requests')
  } finally {
    server.close()
  }
})

test('exits 3 with a message for formats it cannot decode, so the caller can fall back', { skip: !available }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-thumb-'))
  const bogus = path.join(dir, 'not-a-video.mp4')
  fs.writeFileSync(bogus, 'this is not a video')
  const r = spawnSync(helper, [bogus, path.join(dir, 'x.jpg')])
  assert.equal(r.status, 3)
  assert.match(r.stderr.toString(), /could not decode/)
})

test('usage errors exit 2', { skip: !available }, () => {
  assert.equal(spawnSync(helper, []).status, 2)
})
