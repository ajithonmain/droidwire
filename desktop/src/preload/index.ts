import { contextBridge, ipcRenderer, webUtils } from 'electron'

contextBridge.exposeInMainWorld('droidwire', {
  setConnectionType: (type: string): Promise<void> =>
    ipcRenderer.invoke('set-connection-type', type),

  getConnectionType: (): Promise<string> =>
    ipcRenderer.invoke('get-connection-type'),

  getDevices: (): Promise<{ devices: { serial: string; state: string; model: string }[]; active: string | null }> =>
    ipcRenderer.invoke('adb:devices'),

  setDevice: (serial: string): Promise<void> =>
    ipcRenderer.invoke('adb:set-device', serial),

  ejectDevice: (serial: string): Promise<void> =>
    ipcRenderer.invoke('adb:eject-device', serial),

  unejectAll: (): Promise<void> =>
    ipcRenderer.invoke('adb:uneject-all'),

  getDeviceInfo: (): Promise<{ name: string; battery: number }> =>
    ipcRenderer.invoke('adb:device-info'),

  listFiles: (dirPath: string): Promise<unknown[]> =>
    ipcRenderer.invoke('adb:list-files', dirPath),

  getStorage: (): Promise<{ total: number; used: number; free: number }> =>
    ipcRenderer.invoke('adb:storage'),

  pullFile: (remotePath: string, fileName: string, transferId: string): Promise<string> =>
    ipcRenderer.invoke('adb:pull', remotePath, fileName, transferId),

  pushFile: (localPath: string, remotePath: string, transferId: string): Promise<void> =>
    ipcRenderer.invoke('adb:push', localPath, remotePath, transferId),

  openDownloads: (): Promise<void> =>
    ipcRenderer.invoke('open-downloads'),

  showInFinder: (filePath: string): Promise<void> =>
    ipcRenderer.invoke('show-in-finder', filePath),

  previewFile: (remotePath: string, fileName: string): Promise<string | null> =>
    ipcRenderer.invoke('adb:preview', remotePath, fileName),

  showOpenDialog: (): Promise<string[]> =>
    ipcRenderer.invoke('show-open-dialog'),

  deleteFile: (remotePath: string): Promise<void> => ipcRenderer.invoke('adb:delete', remotePath),
  renameFile: (oldPath: string, newPath: string): Promise<void> => ipcRenderer.invoke('adb:rename', oldPath, newPath),
  mkdir: (dirPath: string): Promise<void> => ipcRenderer.invoke('adb:mkdir', dirPath),
  copyFile: (src: string, dest: string): Promise<void> => ipcRenderer.invoke('adb:copy', src, dest),
  findFiles: (dirPath: string, query: string): Promise<unknown[]> => ipcRenderer.invoke('adb:find', dirPath, query),
  cancelTransfer: (transferId: string): Promise<void> => ipcRenderer.invoke('adb:cancel-transfer', transferId),
  zipAndPull: (remoteDirPath: string, folderName: string, transferId: string): Promise<string> => ipcRenderer.invoke('adb:zip-pull', remoteDirPath, folderName, transferId),
  installApk: (localPath: string): Promise<void> => ipcRenderer.invoke('adb:install-apk', localPath),
  persistGet: (key: string): Promise<unknown> => ipcRenderer.invoke('persist:get', key),
  persistSet: (key: string, data: unknown): Promise<void> => ipcRenderer.invoke('persist:set', key, data),
  pickDownloadDir: (): Promise<string | null> => ipcRenderer.invoke('pick-download-dir'),
  getDownloadDir: (): Promise<string> => ipcRenderer.invoke('get-download-dir'),
  setDownloadDir: (dirPath: string): Promise<void> => ipcRenderer.invoke('set-download-dir', dirPath),

  statFile: (remotePath: string): Promise<{ permissions: string | null; octal: string | null; modified: string | null } | null> =>
    ipcRenderer.invoke('adb:stat', remotePath),

  setTitle: (title: string): Promise<void> => ipcRenderer.invoke('set-title', title),

  readLocalFile: (localPath: string): Promise<string | null> =>
    ipcRenderer.invoke('read-local-file', localPath),

  startDrag: (dragFiles: { remotePath: string; fileName: string }[]): Promise<void> =>
    ipcRenderer.invoke('adb:start-drag', dragFiles),

  newWindow: (): Promise<void> =>
    ipcRenderer.invoke('new-window'),

  storeDragNode: (node: unknown): Promise<void> =>
    ipcRenderer.invoke('drag:store', node),

  retrieveDragNode: (): Promise<unknown> =>
    ipcRenderer.invoke('drag:retrieve'),

  deleteLocalFile: (localPath: string): Promise<void> =>
    ipcRenderer.invoke('delete-local-file', localPath),

  localConflictCheck: (fileName: string): Promise<{ exists: boolean; uniqueName: string }> =>
    ipcRenderer.invoke('local-conflict-check', fileName),

  videoThumb: (remotePath: string, size: number): Promise<string | null> =>
    ipcRenderer.invoke('adb:video-thumb', remotePath, size),

  dirSize: (remotePath: string): Promise<number | null> =>
    ipcRenderer.invoke('adb:dir-size', remotePath),

  // File.path was removed in Electron 32 — this is the only way to resolve
  // a dropped File to its filesystem path, and it must run in the preload.
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),

  onTransferProgress: (callback: (progress: unknown) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, p: unknown) => callback(p)
    ipcRenderer.on('transfer-progress', handler)
    return () => ipcRenderer.removeListener('transfer-progress', handler)
  },

  editOpen: (remotePath: string, fileName: string): Promise<void> =>
    ipcRenderer.invoke('edit-open', remotePath, fileName),

  onEditEvent: (callback: (e: { type: 'opened' | 'synced' | 'failed'; fileName: string; error?: string }) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, p: { type: 'opened' | 'synced' | 'failed'; fileName: string; error?: string }) => callback(p)
    ipcRenderer.on('edit-event', handler)
    return () => ipcRenderer.removeListener('edit-event', handler)
  },

  batteryDetail: (): Promise<unknown> => ipcRenderer.invoke('adb:battery-detail'),
  deviceDetail: (): Promise<unknown> => ipcRenderer.invoke('adb:device-detail'),
  storageDetail: (): Promise<unknown[]> => ipcRenderer.invoke('adb:storage-detail'),
  listApps: (includeSystem: boolean): Promise<unknown[]> => ipcRenderer.invoke('adb:list-apps', includeSystem),
  duChildren: (dirPath: string): Promise<unknown> => ipcRenderer.invoke('adb:du-children', dirPath),

  adbPair: (hostPort: string, code: string): Promise<{ ok: boolean; message: string }> =>
    ipcRenderer.invoke('adb:pair', hostPort, code),
  adbConnect: (hostPort: string): Promise<{ ok: boolean; message: string }> =>
    ipcRenderer.invoke('adb:connect', hostPort),

  qrPairStart: (): Promise<string> => ipcRenderer.invoke('adb:qr-pair-start'),
  qrPairStop: (): Promise<void> => ipcRenderer.invoke('adb:qr-pair-stop'),
  onWirelessEvent: (callback: (e: { type: string; message?: string }) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, p: { type: string; message?: string }) => callback(p)
    ipcRenderer.on('wireless-event', handler)
    return () => ipcRenderer.removeListener('wireless-event', handler)
  },

  notify: (title: string, body: string): Promise<void> => ipcRenderer.invoke('notify', title, body),
  showMainWindow: (): Promise<void> => ipcRenderer.invoke('show-main-window'),
  hideWindow: (): Promise<void> => ipcRenderer.invoke('hide-window'),
  showAbout: (): Promise<void> => ipcRenderer.invoke('show-about'),
  getLicenses: (): Promise<string> => ipcRenderer.invoke('get-licenses'),
  quitApp: (): Promise<void> => ipcRenderer.invoke('app-quit'),

  onMenuAction: (callback: (action: string) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, action: string) => callback(action)
    ipcRenderer.on('menu-action', handler)
    return () => ipcRenderer.removeListener('menu-action', handler)
  },
})
