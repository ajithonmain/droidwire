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

/** Which protocol reaches a device. Wireless ADB is still `adb`. */
export type TransportKind = 'adb' | 'mtp'

/**
 * Identity of the device an operation belongs to. It is captured when the
 * operation is queued and travels with it, so switching the active device or
 * connection mode later cannot redirect queued work to a different phone.
 */
export interface DeviceContext {
  transport: TransportKind
  serial: string
}

export interface TransferProgress {
  id: string
  fileName: string
  filePath: string
  direction: 'download' | 'upload'
  totalBytes: number
  transferredBytes: number
  speedBps: number
  /**
   * 'cancelling': the user asked to cancel but the native transfer has not stopped yet (MTP can take a while to
   * wind one down). Only 'cancelled' means the work really stopped.
   */
  status: 'pending' | 'active' | 'paused' | 'cancelling' | 'done' | 'error' | 'cancelled'
  error?: string
  localPath?: string
  /** When a cancel was requested for a transfer that is still winding down (renderer-side bookkeeping). */
  cancelRequestedAt?: number
  /** Device the transfer was queued against (renderer-side bookkeeping). */
  device?: DeviceContext
  /** 'folder' downloads are zipped; everything else is a single file. */
  kind?: 'file' | 'folder'
}

/**
 * Result of `previewFile`. Images (including generated HEIC/PDF thumbnails)
 * and audio come back as data URLs; text comes back as already-decoded text,
 * so the renderer never needs filesystem access to display it.
 * `null` means "no preview available".
 */
export type PreviewResult =
  | { kind: 'image' | 'audio'; dataUrl: string }
  | { kind: 'text'; text: string; truncated: boolean }

export interface UpdateCheckResult {
  currentVersion: string
  latestTag: string
  hasUpdate: boolean
}

/** What the installed app can actually do, for first-run checks and bug reports. */
export interface Diagnostics {
  app: { version: string; packaged: boolean; electron: string; arch: string; macos: string }
  adb: { path: string; source: 'override' | 'bundled' | 'sdk' | 'homebrew' | 'path'; version: string | null; error: string | null }
  /** `excluded`: this build deliberately ships without MTP (not a failure to load it). */
  mtp: { available: boolean; error: string | null; addon: string | null; excluded?: boolean }
  thumbnails: { native: string | null; ffmpeg: string | null }
}

export interface AppSettings {
  downloadDir?: string
  /** Check GitHub for a newer release on launch. Defaults to true. */
  checkForUpdatesOnLaunch?: boolean
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

export * from "./api"
