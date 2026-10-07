import type { FileNode } from '@droidwire/shared'
import { guessMime } from './mime.ts'

// `adb shell ls -la` output varies between toybox and busybox and across OEM
// builds. This parser accepts the common "perms links owner group size date
// time name" layout and silently skips anything it does not recognise.
const LS_LINE = /^([dlrwxst-]{10})\s+\d+\s+\S+\s+\S+\s+(\d+)\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\s+(.+)$/

export function sortNodes(nodes: FileNode[]): FileNode[] {
  return nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  })
}

export function parseLsLa(output: string, dirPath: string): FileNode[] {
  const nodes: FileNode[] = []
  for (const line of output.split('\n')) {
    const m = line.replace(/\r$/, '').match(LS_LINE)
    if (!m) continue
    const [, perms, sizeStr, date, time, rawName] = m
    const name = rawName.trim()
    if (name === '.' || name === '..') continue
    const isDir = perms[0] === 'd'
    const isLink = perms[0] === 'l'
    const cleanName = isLink ? name.split(' -> ')[0].trim() : name
    nodes.push({
      name: cleanName,
      path: dirPath.replace(/\/$/, '') + '/' + cleanName,
      size: isDir ? 0 : parseInt(sizeStr, 10),
      type: isDir ? 'dir' : 'file',
      mimeType: isDir ? null : guessMime(cleanName),
      modified: new Date(`${date}T${time}:00`).getTime(),
    })
  }
  return sortNodes(nodes)
}
