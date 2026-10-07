import type {
  BatteryDetail, DeviceContext, DeviceDetail, DuEntry, FileNode, InstalledApp, MountInfo,
  PreviewResult, StorageInfo, UpdateCheckResult,
} from './types'

export type ConnectionTypeName = 'adb' | 'mtp' | 'wireless'

export interface DeviceListItem {
  serial: string
  state: string
  model: string
}

export interface EditEvent {
  type: 'opened' | 'synced' | 'failed'
  fileName: string
  error?: string
}

export interface WirelessEvent {
  type: 'waiting' | 'pairing' | 'connecting' | 'connected' | 'error'
  message?: string
}

export interface FileStat {
  permissions: string | null
  octal: string | null
  modified: string | null
}

export interface DragNodesPayload {
  nodes: FileNode[]
  ts: number
}

/**
 * The complete surface exposed to the renderer as `window.droidwire`.
 * Implemented by preload/index.ts (contextBridge), served by the handlers in
 * main/ipc/*. Methods that act on a phone take an optional trailing
 * DeviceContext; work that is queued or long-running (pull, push, zip) must
 * pass the context captured when it was queued, so a later device or
 * connection switch cannot redirect it.
 */
export interface DroidwireAPI {
  // Connection and device selection
  setConnectionType(type: ConnectionTypeName): Promise<void>
  getConnectionType(): Promise<ConnectionTypeName>
  getDevices(): Promise<{ devices: DeviceListItem[]; active: string | null }>
  setDevice(serial: string): Promise<void>
  ejectDevice(serial: string): Promise<void>
  unejectAll(): Promise<void>
  getDeviceInfo(): Promise<{ name: string; battery: number }>

  // Browsing and file management
  listFiles(dirPath: string, ctx?: DeviceContext): Promise<FileNode[]>
  getStorage(ctx?: DeviceContext): Promise<StorageInfo>
  findFiles(dirPath: string, query: string, ctx?: DeviceContext): Promise<FileNode[]>
  statFile(remotePath: string, ctx?: DeviceContext): Promise<FileStat | null>
  dirSize(remotePath: string, ctx?: DeviceContext): Promise<number | null>
  deleteFile(remotePath: string, ctx?: DeviceContext): Promise<void>
  /** Rename within the same folder. */
  renameFile(oldPath: string, newPath: string, ctx?: DeviceContext): Promise<void>
  /** Move to another folder (and optionally another name). */
  moveFile(srcPath: string, destPath: string, ctx?: DeviceContext): Promise<void>
  mkdir(dirPath: string, ctx?: DeviceContext): Promise<void>
  copyFile(src: string, dest: string, ctx?: DeviceContext): Promise<void>

  // Transfers
  pullFile(remotePath: string, fileName: string, transferId: string, ctx: DeviceContext): Promise<string>
  pushFile(localPath: string, remotePath: string, transferId: string, ctx: DeviceContext): Promise<void>
  zipAndPull(remoteDirPath: string, folderName: string, transferId: string, ctx: DeviceContext): Promise<string>
  cancelTransfer(transferId: string): Promise<void>
  onTransferProgress(callback: (progress: unknown) => void): () => void
  installApk(localPath: string, ctx?: DeviceContext): Promise<void>
  startDrag(dragFiles: { remotePath: string; fileName: string }[], ctx?: DeviceContext): Promise<void>
  storeDragNode(payload: DragNodesPayload | null): Promise<void>
  retrieveDragNode(): Promise<DragNodesPayload | null>

  // Preview and open-and-edit
  previewFile(remotePath: string, fileName: string, ctx?: DeviceContext): Promise<PreviewResult | null>
  videoThumb(remotePath: string, size: number, ctx?: DeviceContext): Promise<string | null>
  editOpen(remotePath: string, fileName: string, ctx?: DeviceContext): Promise<void>
  onEditEvent(callback: (e: EditEvent) => void): () => void

  // Local files and folders
  showOpenDialog(): Promise<string[]>
  getPathForFile(file: File): string
  localConflictCheck(fileName: string): Promise<{ exists: boolean; uniqueName: string }>
  deleteLocalFile(localPath: string): Promise<void>
  showInFinder(filePath: string): Promise<void>
  openDownloads(): Promise<void>
  pickDownloadDir(): Promise<string | null>
  getDownloadDir(): Promise<string>
  setDownloadDir(dirPath: string): Promise<void>

  // Device tools (ADB only)
  batteryDetail(ctx?: DeviceContext): Promise<BatteryDetail>
  deviceDetail(ctx?: DeviceContext): Promise<DeviceDetail>
  storageDetail(ctx?: DeviceContext): Promise<MountInfo[]>
  listApps(includeSystem: boolean, ctx?: DeviceContext): Promise<InstalledApp[]>
  duChildren(dirPath: string, ctx?: DeviceContext): Promise<{ entries: DuEntry[]; totalBytes: number }>

  // Wireless ADB
  adbPair(hostPort: string, code: string): Promise<{ ok: boolean; message: string }>
  adbConnect(hostPort: string): Promise<{ ok: boolean; message: string }>
  qrPairStart(): Promise<string>
  qrPairStop(): Promise<void>
  onWirelessEvent(callback: (e: WirelessEvent) => void): () => void

  // App
  persistGet(key: string): Promise<unknown>
  persistSet(key: string, data: unknown): Promise<void>
  checkUpdateSilent(): Promise<UpdateCheckResult | null>
  openReleasePage(): Promise<void>
  notify(title: string, body: string): Promise<void>
  setTitle(title: string): Promise<void>
  newWindow(): Promise<void>
  showMainWindow(): Promise<void>
  hideWindow(): Promise<void>
  showAbout(): Promise<void>
  getLicenses(): Promise<string>
  quitApp(): Promise<void>
  onMenuAction(callback: (action: string) => void): () => void
}
