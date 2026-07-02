import type { FileNode, StorageInfo } from '@droidwire/shared'

export async function listFiles(dirPath: string): Promise<FileNode[]> {
  return window.droidwire.listFiles(dirPath) as Promise<FileNode[]>
}

export async function getStorage(): Promise<StorageInfo> {
  return window.droidwire.getStorage()
}
