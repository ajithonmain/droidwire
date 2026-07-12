export function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const val = bytes / Math.pow(1024, i)
  return `${val < 10 ? val.toFixed(1) : Math.round(val)} ${units[i]}`
}

export function formatSpeed(bps: number): string {
  if (bps <= 0) return '-'
  return `${formatSize(bps)}/s`
}

export function formatEta(remainingBytes: number, bps: number): string {
  if (bps <= 0 || remainingBytes <= 0) return '-'
  const secs = remainingBytes / bps
  if (secs < 60) return `${Math.ceil(secs)}s`
  const m = Math.floor(secs / 60)
  const s = Math.ceil(secs % 60)
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

export function formatDate(timestamp: number): string {
  if (!timestamp) return '-'
  return new Date(timestamp).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function formatPercent(transferred: number, total: number): number {
  if (total <= 0) return 0
  return Math.min(100, Math.round((transferred / total) * 100))
}
