export const SERVER_PORT = 8765
export const FALLBACK_PORTS = [8766, 8767]
export const TETHERING_SUBNETS = ['192.168.42', '192.168.43']
export const CHUNK_SIZE = 1024 * 1024 // 1MB
export const MAX_CONCURRENT_TRANSFERS = 3
export const RECONNECT_INTERVAL_MS = 3000
export const ANDROID_ROOT = '/storage/emulated/0'
export const DOWNLOAD_DIR = '~/Downloads/Droidwire'

export const API_ENDPOINTS = {
  PING: '/ping',
  FILES: '/files',
  DOWNLOAD: '/download',
  UPLOAD: '/upload',
  STORAGE: '/storage',
} as const

export interface PingResponse {
  status: 'ok'
  device: string
  battery: number
}

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
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting'
