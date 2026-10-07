import http from 'node:http'
import crypto from 'node:crypto'

// Loopback HTTP range server used for video thumbnails: ffmpeg needs random
// access to a file that lives on the phone, and this serves byte ranges of it
// by streaming `dd` output from `adb exec-out`.
//
// Hardening - the port is reachable by any local process (and, via DNS
// rebinding, by web pages), so it must not become a file-read primitive:
//   * each stream has an unguessable 128-bit token bound to one device serial,
//     remote path and size; the URL never carries a path
//   * the Host header must be exactly the loopback address we bound
//   * only GET is served; malformed ranges get 416, unknown tokens 404
//   * the token table is bounded and everything is torn down by shutdown()

export interface StreamEntry {
  serial: string
  remotePath: string
  size: number
}

export interface ReaderProc {
  stdout: NodeJS.ReadableStream | null
  kill(): unknown
  on(event: 'close', cb: () => void): unknown
  on(event: 'error', cb: () => void): unknown
}

export interface StreamServerDeps {
  /** Start a reader that emits `blockCount` blocks of `blockSize` bytes from `blockStart`. */
  spawnReader(entry: StreamEntry, blockSize: number, blockStart: number, blockCount: number): ReaderProc
}

export const BLOCK = 65536
const MAX_STREAMS = 256
const OPEN_ENDED_CAP = 4 * 1024 * 1024

/** Parse a Range header against a known size. 'invalid' maps to HTTP 416. */
export function parseRange(
  header: string | undefined,
  size: number,
): { start: number; end: number; partial: boolean } | 'invalid' {
  if (size <= 0) return 'invalid'
  if (!header) return { start: 0, end: size - 1, partial: false }
  const m = header.match(/^bytes=(\d*)-(\d*)$/)
  if (!m || (m[1] === '' && m[2] === '')) return 'invalid'
  let start: number
  let end: number
  if (m[1] === '') {
    // suffix range: the last N bytes
    start = Math.max(0, size - parseInt(m[2], 10))
    end = size - 1
  } else {
    start = parseInt(m[1], 10)
    // Cap open-ended reads - ffmpeg probes with them and never needs much
    end = m[2] === '' ? Math.min(size - 1, start + OPEN_ENDED_CAP - 1) : Math.min(parseInt(m[2], 10), size - 1)
  }
  if (!Number.isFinite(start) || start >= size || start > end) return 'invalid'
  return { start, end, partial: true }
}

export function createStreamServer(deps: StreamServerDeps) {
  const streams = new Map<string, StreamEntry>()
  const live = new Set<ReaderProc>()
  let server: http.Server | null = null
  let port = 0
  let starting: Promise<number> | null = null

  function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const reject = (status: number) => { res.writeHead(status); res.end() }
    if (req.method !== 'GET' || req.headers.host !== `127.0.0.1:${port}`) return reject(403)
    const token = /^\/v\/([0-9a-f]{32})$/.exec((req.url ?? '').split('?')[0])?.[1]
    const entry = token ? streams.get(token) : undefined
    if (!entry) return reject(404)
    const range = parseRange(req.headers.range, entry.size)
    if (range === 'invalid') return reject(416)

    const { start, end, partial } = range
    const len = end - start + 1
    const blockStart = Math.floor(start / BLOCK)
    let toSkip = start - blockStart * BLOCK
    const blockCount = Math.ceil((toSkip + len) / BLOCK)
    res.writeHead(partial ? 206 : 200, {
      'Accept-Ranges': 'bytes',
      'Content-Length': len,
      ...(partial ? { 'Content-Range': `bytes ${start}-${end}/${entry.size}` } : {}),
    })

    const proc = deps.spawnReader(entry, BLOCK, blockStart, blockCount)
    live.add(proc)
    let remaining = len
    proc.stdout?.on('data', (chunk: Buffer | string) => {
      let c = typeof chunk === 'string' ? Buffer.from(chunk) : chunk
      if (toSkip > 0) {
        if (c.length <= toSkip) { toSkip -= c.length; return }
        c = c.subarray(toSkip)
        toSkip = 0
      }
      if (remaining <= 0) return
      if (c.length > remaining) c = c.subarray(0, remaining)
      remaining -= c.length
      res.write(c)
      if (remaining === 0) { res.end(); proc.kill() }
    })
    proc.on('close', () => { live.delete(proc); if (remaining > 0) res.end() })
    proc.on('error', () => { live.delete(proc); res.end() })
    res.on('close', () => proc.kill())
  }

  return {
    /** Start listening (idempotent). Resolves with the loopback port. */
    ensure(): Promise<number> {
      if (port) return Promise.resolve(port)
      if (starting) return starting
      starting = new Promise(resolve => {
        server = http.createServer((req, res) => {
          try { handleRequest(req, res) } catch { res.writeHead(500); res.end() }
        })
        server.listen(0, '127.0.0.1', () => {
          port = (server!.address() as { port: number }).port
          resolve(port)
        })
      })
      return starting
    },

    /** Register a stream and get its URL. ensure() must have resolved first. */
    register(entry: StreamEntry): string {
      if (!port) throw new Error('Stream server is not running')
      const token = crypto.randomBytes(16).toString('hex')
      streams.set(token, entry)
      if (streams.size > MAX_STREAMS) streams.delete(streams.keys().next().value as string)
      return `http://127.0.0.1:${port}/v/${token}`
    },

    shutdown(): void {
      for (const proc of live) { try { proc.kill() } catch { /* already gone */ } }
      live.clear()
      streams.clear()
      // Also drop open connections: close() alone waits for in-flight responses
      server?.close()
      server?.closeAllConnections()
      server = null
      port = 0
      starting = null
    },
  }
}
