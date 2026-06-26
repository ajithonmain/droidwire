import RNFS from 'react-native-fs'
import type { FileNode } from '@droidwire/shared'
import { ANDROID_ROOT } from '@droidwire/shared'

export async function listDirectory(dirPath: string): Promise<FileNode[]> {
  const fullPath = dirPath.startsWith('/') ? dirPath : `${ANDROID_ROOT}/${dirPath}`
  const items = await RNFS.readDir(fullPath)

  return items.map((item): FileNode => ({
    name: item.name,
    path: item.path.replace(ANDROID_ROOT, '') || '/',
    size: Number(item.size),
    type: item.isDirectory() ? 'dir' : 'file',
    mimeType: item.isDirectory() ? null : guessMimeType(item.name),
    modified: item.mtime ? new Date(item.mtime).getTime() : 0,
  }))
}

export async function getStorageInfo() {
  const stats = await RNFS.getFSInfo()
  return {
    total: stats.totalSpace,
    free: stats.freeSpace,
    used: stats.totalSpace - stats.freeSpace,
  }
}

function guessMimeType(name: string): string | null {
  const ext = name.split('.').pop()?.toLowerCase()
  const map: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    mkv: 'video/x-matroska',
    mp3: 'audio/mpeg',
    pdf: 'application/pdf',
    zip: 'application/zip',
  }
  return ext ? (map[ext] ?? 'application/octet-stream') : null
}
