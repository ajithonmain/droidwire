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
  status: 'pending' | 'active' | 'paused' | 'done' | 'error' | 'cancelled'
  error?: string
  localPath?: string
}

export interface BatteryDetail {
  level: number
  status: string
  health: string
  temperatureC: number | null
  voltageMv: number | null
  technology: string | null
  powerSource: string
}

export interface DeviceDetail {
  model: string
  manufacturer: string
  androidVersion: string
  sdk: string
  buildId: string
  serial: string
}

export interface MountInfo {
  mount: string
  total: number
  used: number
  free: number
}

export interface InstalledApp {
  pkg: string
  apkPath: string
}

export interface DuEntry {
  name: string
  path: string
  bytes: number
  isDir: boolean
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting'
