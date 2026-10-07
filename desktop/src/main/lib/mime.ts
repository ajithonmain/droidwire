const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  gif: 'image/gif', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif',
  svg: 'image/svg+xml', bmp: 'image/bmp', ico: 'image/x-icon',
  tiff: 'image/tiff', tif: 'image/tiff',
  mp4: 'video/mp4', mov: 'video/quicktime', mkv: 'video/x-matroska',
  avi: 'video/x-msvideo', webm: 'video/webm', m4v: 'video/mp4', '3gp': 'video/3gpp',
  mp3: 'audio/mpeg', aac: 'audio/aac', flac: 'audio/flac',
  wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4', opus: 'audio/opus',
  pdf: 'application/pdf',
  zip: 'application/zip', rar: 'application/x-rar-compressed',
  '7z': 'application/x-7z-compressed', tar: 'application/x-tar', gz: 'application/gzip',
  apk: 'application/vnd.android.package-archive',
  txt: 'text/plain', md: 'text/markdown', csv: 'text/csv',
  html: 'text/html', htm: 'text/html',
  css: 'text/css', js: 'text/javascript', ts: 'text/plain',
  json: 'application/json', xml: 'text/xml', yaml: 'text/plain', yml: 'text/plain',
  sh: 'application/x-sh', py: 'text/plain', rb: 'text/plain',
  c: 'text/plain', cpp: 'text/plain', h: 'text/plain', kt: 'text/plain',
  log: 'text/plain',
}

/** Extension-based MIME guess; unknown or missing extensions map to octet-stream. */
export function guessMime(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase()
  return (ext && MIME_BY_EXT[ext]) || 'application/octet-stream'
}
