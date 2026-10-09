import type { FileNode, StorageInfo } from '@droidwire/shared'

export interface TransportDevice {
  serial: string
  name: string
  type: 'adb' | 'mtp'
}

export interface TransferOptions {
  /** Cumulative bytes moved so far and the expected total (0 when unknown). */
  onProgress?: (sent: number, total: number) => void
  /** Abort to cancel: ADB kills its child process, MTP restarts its worker. */
  signal?: AbortSignal
}

/**
 * Every method takes the device serial explicitly. A transport holds no
 * "current device" of its own, so work for one phone can never be executed
 * against another.
 */
export interface Transport {
  type: 'adb' | 'mtp'

  getDevices(): Promise<TransportDevice[]>
  getDeviceInfo(serial: string): Promise<{ model: string; androidVersion: string; battery: number }>

  listFiles(serial: string, path: string): Promise<FileNode[]>
  pullFile(serial: string, remotePath: string, localPath: string, opts?: TransferOptions): Promise<void>
  pushFile(serial: string, localPath: string, remotePath: string, opts?: TransferOptions): Promise<void>
  deleteFile(serial: string, path: string): Promise<void>
  /** Change an object's name within its folder. */
  renameFile(serial: string, path: string, newName: string): Promise<void>
  /** Move to `destPath` (full path; may be a different folder, may carry a different name). */
  moveFile(serial: string, srcPath: string, destPath: string): Promise<void>
  makeDir(serial: string, path: string): Promise<void>
  copy(serial: string, srcPath: string, dstPath: string): Promise<void>
  getStorage(serial: string): Promise<StorageInfo>

  /**
   * Best-effort modified timestamp ("YYYY-MM-DD HH:MM:SS") or null.
   * Transports without Unix permission bits implement only this subset.
   */
  statObject?(serial: string, path: string): Promise<string | null>

  /** Forget a remembered "this phone is stuck" verdict so the next call probes the phone again (Rescan, replug). */
  resetHealth?(): void
}

export function cancelledError(): Error {
  return new Error('Transfer cancelled')
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw cancelledError()
}
