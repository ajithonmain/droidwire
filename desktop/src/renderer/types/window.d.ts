import type { FileNode, StorageInfo, BatteryDetail, DeviceDetail, MountInfo, InstalledApp, DuEntry } from '@droidwire/shared'

interface DroidwireAPI {
  setConnectionType(type: 'adb' | 'mtp' | 'wireless'): Promise<void>
  getConnectionType(): Promise<'adb' | 'mtp' | 'wireless'>
  getDevices(): Promise<{ devices: { serial: string; state: string; model: string }[]; active: string | null }>
  setDevice(serial: string): Promise<void>
  ejectDevice(serial: string): Promise<void>
  unejectAll(): Promise<void>
  getDeviceInfo(): Promise<{ name: string; battery: number }>
  listFiles(dirPath: string): Promise<FileNode[]>
  getStorage(): Promise<StorageInfo>
  pullFile(remotePath: string, fileName: string, transferId: string): Promise<string>
  pushFile(localPath: string, remotePath: string, transferId: string): Promise<void>
  openDownloads(): Promise<void>
  showInFinder(filePath: string): Promise<void>
  previewFile(remotePath: string, fileName: string): Promise<string | null>
  showOpenDialog(): Promise<string[]>
  deleteFile(remotePath: string): Promise<void>
  renameFile(oldPath: string, newPath: string): Promise<void>
  mkdir(dirPath: string): Promise<void>
  copyFile(src: string, dest: string): Promise<void>
  findFiles(dirPath: string, query: string): Promise<FileNode[]>
  cancelTransfer(transferId: string): Promise<void>
  zipAndPull(remoteDirPath: string, folderName: string, transferId: string): Promise<string>
  installApk(localPath: string): Promise<void>
  getBetaSignup(): Promise<{ email: string; createdAt: string; synced: boolean } | null>
  registerBeta(email: string): Promise<{ email: string; createdAt: string; synced: boolean }>
  fetchBetaMessages(): Promise<{ id: string; title: string; body: string; url: string | null }[]>
  checkUpdateSilent(): Promise<{ latestTag: string; hasUpdate: boolean } | null>
  openReleasePage(): Promise<void>
  openExternalUrl(url: string): Promise<void>
  persistGet(key: string): Promise<unknown>
  persistSet(key: string, data: unknown): Promise<void>
  pickDownloadDir(): Promise<string | null>
  getDownloadDir(): Promise<string>
  setDownloadDir(dirPath: string): Promise<void>
  statFile(remotePath: string): Promise<{ permissions: string | null; octal: string | null; modified: string | null } | null>
  setTitle(title: string): Promise<void>
  readLocalFile(localPath: string): Promise<string | null>
  startDrag(dragFiles: { remotePath: string; fileName: string }[]): Promise<void>
  newWindow(): Promise<void>
  storeDragNode(node: unknown): Promise<void>
  retrieveDragNode(): Promise<unknown>
  deleteLocalFile(localPath: string): Promise<void>
  getPathForFile(file: File): string
  localConflictCheck(fileName: string): Promise<{ exists: boolean; uniqueName: string }>
  videoThumb(remotePath: string, size: number): Promise<string | null>
  dirSize(remotePath: string): Promise<number | null>
  onTransferProgress(callback: (progress: unknown) => void): () => void
  editOpen(remotePath: string, fileName: string): Promise<void>
  onEditEvent(callback: (e: { type: 'opened' | 'synced' | 'failed'; fileName: string; error?: string }) => void): () => void
  batteryDetail(): Promise<BatteryDetail>
  deviceDetail(): Promise<DeviceDetail>
  storageDetail(): Promise<MountInfo[]>
  listApps(includeSystem: boolean): Promise<InstalledApp[]>
  duChildren(dirPath: string): Promise<{ entries: DuEntry[]; totalBytes: number }>
  adbPair(hostPort: string, code: string): Promise<{ ok: boolean; message: string }>
  adbConnect(hostPort: string): Promise<{ ok: boolean; message: string }>
  qrPairStart(): Promise<string>
  qrPairStop(): Promise<void>
  onWirelessEvent(callback: (e: { type: string; message?: string }) => void): () => void
  notify(title: string, body: string): Promise<void>
  showMainWindow(): Promise<void>
  hideWindow(): Promise<void>
  showAbout(): Promise<void>
  getLicenses(): Promise<string>
  quitApp(): Promise<void>
  onMenuAction(callback: (action: string) => void): () => void
}

declare global {
  interface Window {
    droidwire: DroidwireAPI
  }

  namespace React {
    interface CSSProperties {
      WebkitAppRegion?: 'drag' | 'no-drag'
    }
  }
}

export {}
