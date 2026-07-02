export interface FileNode {
  name: string
  path: string
  size: number
  type: 'file' | 'dir'
  mimeType: string | null
  modified: number
}

export interface StorageInfo {
  total: number
  used: number
  free: number
}

export interface TransferProgress {
  id: string
  fileName: string
  filePath: string
  direction: 'download' | 'upload'
  totalBytes: number
  transferredBytes: number
  speedBps: number
  status: 'pending' | 'active' | 'done' | 'error' | 'cancelled'
  error?: string
  localPath?: string
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting'
