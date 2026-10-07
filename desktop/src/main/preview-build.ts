import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import type { PreviewResult } from '@droidwire/shared'
import { guessMime } from './lib/mime.ts'
import { decodeTextPreview, previewKind } from './lib/preview-kind.ts'

// Turns a file already pulled to local disk into a PreviewResult.
//   image / generated thumbnail  -> { kind: 'image', dataUrl }
//   audio                        -> { kind: 'audio', dataUrl }
//   text (first 64 KiB)          -> { kind: 'text', text, truncated }
//   unsupported, empty, binary   -> null
// The renderer never receives a filesystem path.

export const TEXT_PREVIEW_BYTES = 64 * 1024

function runQuiet(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'ignore'] })
    proc.on('error', reject)
    proc.on('close', code => code === 0 ? resolve() : reject(new Error(`${cmd} exited with ${code}`)))
  })
}

const asDataUrl = (mime: string, buf: Buffer): string => `data:${mime};base64,${buf.toString('base64')}`

export async function buildPreview(localFile: string, fileName: string): Promise<PreviewResult | null> {
  const stat = await fs.promises.stat(localFile).catch(() => null)
  // Files unscanned by Android's media store report size 0 over MTP and the
  // device sends 0 bytes on download - fall back to the generic icon
  if (!stat || stat.size === 0) return null

  switch (previewKind(fileName)) {
    case 'convert-image': {
      // HEIC/HEIF/TIFF: Chromium can't decode these - convert with sips (macOS built-in)
      const out = `${localFile}.preview.jpg`
      try {
        await runQuiet('sips', ['-s', 'format', 'jpeg', '--resampleHeightWidthMax', '1200', localFile, '--out', out])
        const buf = await fs.promises.readFile(out)
        return buf.length > 0 ? { kind: 'image', dataUrl: asDataUrl('image/jpeg', buf) } : null
      } catch { return null }
    }
    case 'pdf': {
      // PDF: first-page thumbnail via Quick Look (macOS built-in)
      try {
        await runQuiet('qlmanage', ['-t', '-s', '600', '-o', path.dirname(localFile), localFile])
        const buf = await fs.promises.readFile(`${localFile}.png`)
        return { kind: 'image', dataUrl: asDataUrl('image/png', buf) }
      } catch { return null }
    }
    case 'image':
      return { kind: 'image', dataUrl: asDataUrl(guessMime(fileName), await fs.promises.readFile(localFile)) }
    case 'audio':
      return { kind: 'audio', dataUrl: asDataUrl(guessMime(fileName), await fs.promises.readFile(localFile)) }
    case 'text': {
      const fh = await fs.promises.open(localFile, 'r')
      try {
        const sample = Buffer.alloc(Math.min(stat.size, TEXT_PREVIEW_BYTES))
        const { bytesRead } = await fh.read(sample, 0, sample.length, 0)
        const decoded = decodeTextPreview(sample.subarray(0, bytesRead), stat.size)
        return decoded ? { kind: 'text', ...decoded } : null
      } finally {
        await fh.close()
      }
    }
    default:
      return null
  }
}
