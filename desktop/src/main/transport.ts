import type { FileNode, StorageInfo } from '@droidwire/shared'

export interface TransportDevice {
  serial: string
  name: string
  type: 'adb' | 'mtp'
}

export interface Transport {
  type: 'adb' | 'mtp'

  // Device info
  getDevices(): Promise<TransportDevice[]>
  getDeviceInfo(serial: string): Promise<{
    model: string
    androidVersion: string
    battery: number
  }>

  // File operations
  listFiles(serial: string, path: string): Promise<FileNode[]>
  pullFile(serial: string, remotePath: string, localPath: string, onProgress?: (sent: number, total: number) => void): Promise<void>
  pushFile(serial: string, localPath: string, remotePath: string, onProgress?: (sent: number, total: number) => void): Promise<void>
  deleteFile(serial: string, path: string): Promise<void>
  renameFile(serial: string, path: string, newName: string): Promise<void>
  makeDir(serial: string, path: string): Promise<void>

  // Storage
  getStorage(serial: string): Promise<StorageInfo>

  // Optional: Advanced features (may not be supported by all transports)
  copy?(serial: string, srcPath: string, dstPath: string): Promise<void>
  screenshot?(serial: string): Promise<Buffer>
  installApk?(serial: string, apkPath: string): Promise<void>
  // Best-effort object metadata — returns an ISO-ish "YYYY-MM-DD HH:MM:SS"
  // modified timestamp string, or null. Transports without richer stat
  // support (e.g. no Unix permission bits) implement only this subset.
  statObject?(serial: string, path: string): Promise<string | null>
}
