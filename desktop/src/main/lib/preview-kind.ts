import { guessMime } from './mime.ts'

export type PreviewKind = 'image' | 'convert-image' | 'pdf' | 'audio' | 'text' | 'none'

// Formats Chromium cannot decode; they are converted with macOS `sips`
const CONVERT_EXT = new Set(['heic', 'heif', 'tiff', 'tif'])

const TEXT_MIMES = new Set([
  'application/json', 'application/xml', 'application/javascript', 'application/x-sh',
])

/** What kind of preview (if any) a file name supports. Decided by extension. */
export function previewKind(fileName: string): PreviewKind {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  if (CONVERT_EXT.has(ext)) return 'convert-image'
  const mime = guessMime(fileName)
  if (mime === 'application/pdf') return 'pdf'
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime.startsWith('text/') || TEXT_MIMES.has(mime)) return 'text'
  return 'none'
}

/** Decode the head of a file as text; null when it looks binary. */
export function decodeTextPreview(sample: Buffer, totalSize: number): { text: string; truncated: boolean } | null {
  if (sample.includes(0)) return null
  return { text: new TextDecoder('utf-8', { fatal: false }).decode(sample), truncated: totalSize > sample.length }
}
