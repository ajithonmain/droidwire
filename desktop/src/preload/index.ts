import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { DroidwireAPI, EditEvent, WirelessEvent } from '@droidwire/shared'

const invoke = <T>(channel: string, ...args: unknown[]): Promise<T> => ipcRenderer.invoke(channel, ...args)

function subscribe<T>(channel: string, callback: (payload: T) => void): () => void {
  const handler = (_e: Electron.IpcRendererEvent, payload: T) => callback(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

// Every method is a thin, typed forwarder to one ipcMain handler. The renderer
// gets exactly this object and nothing else: no Node, no ipcRenderer.
const api: DroidwireAPI = {
  setConnectionType: type => invoke('set-connection-type', type),
  getConnectionType: () => invoke('get-connection-type'),
  getDevices: () => invoke('adb:devices'),
  setDevice: serial => invoke('adb:set-device', serial),
  ejectDevice: serial => invoke('adb:eject-device', serial),
  unejectAll: () => invoke('adb:uneject-all'),
  getDeviceInfo: () => invoke('adb:device-info'),

  listFiles: (dirPath, ctx) => invoke('adb:list-files', dirPath, ctx),
  getStorage: ctx => invoke('adb:storage', ctx),
  findFiles: (dirPath, query, ctx) => invoke('adb:find', dirPath, query, ctx),
  statFile: (remotePath, ctx) => invoke('adb:stat', remotePath, ctx),
  dirSize: (remotePath, ctx) => invoke('adb:dir-size', remotePath, ctx),
  deleteFile: (remotePath, ctx) => invoke('adb:delete', remotePath, ctx),
  renameFile: (oldPath, newPath, ctx) => invoke('adb:rename', oldPath, newPath, ctx),
  moveFile: (srcPath, destPath, ctx) => invoke('adb:move', srcPath, destPath, ctx),
  mkdir: (dirPath, ctx) => invoke('adb:mkdir', dirPath, ctx),
  copyFile: (src, dest, ctx) => invoke('adb:copy', src, dest, ctx),

  pullFile: (remotePath, fileName, transferId, ctx) => invoke('adb:pull', remotePath, fileName, transferId, ctx),
  pushFile: (localPath, remotePath, transferId, ctx) => invoke('adb:push', localPath, remotePath, transferId, ctx),
  zipAndPull: (remoteDirPath, folderName, transferId, ctx) => invoke('adb:zip-pull', remoteDirPath, folderName, transferId, ctx),
  cancelTransfer: transferId => invoke('adb:cancel-transfer', transferId),
  onTransferProgress: callback => subscribe('transfer-progress', callback),
  installApk: (localPath, ctx) => invoke('adb:install-apk', localPath, ctx),
  startDrag: (dragFiles, ctx) => invoke('adb:start-drag', dragFiles, ctx),
  storeDragNode: payload => invoke('drag:store', payload),
  retrieveDragNode: () => invoke('drag:retrieve'),

  previewFile: (remotePath, fileName, ctx) => invoke('adb:preview', remotePath, fileName, ctx),
  videoThumb: (remotePath, size, ctx) => invoke('adb:video-thumb', remotePath, size, ctx),
  editOpen: (remotePath, fileName, ctx) => invoke('edit-open', remotePath, fileName, ctx),
  onEditEvent: callback => subscribe<EditEvent>('edit-event', callback),

  showOpenDialog: () => invoke('show-open-dialog'),
  // File.path was removed in Electron 32 - this is the only way to resolve
  // a dropped File to its filesystem path, and it must run in the preload.
  getPathForFile: file => webUtils.getPathForFile(file),
  localConflictCheck: fileName => invoke('local-conflict-check', fileName),
  deleteLocalFile: localPath => invoke('delete-local-file', localPath),
  showInFinder: filePath => invoke('show-in-finder', filePath),
  openDownloads: () => invoke('open-downloads'),
  pickDownloadDir: () => invoke('pick-download-dir'),
  getDownloadDir: () => invoke('get-download-dir'),
  setDownloadDir: dirPath => invoke('set-download-dir', dirPath),

  batteryDetail: ctx => invoke('adb:battery-detail', ctx),
  deviceDetail: ctx => invoke('adb:device-detail', ctx),
  storageDetail: ctx => invoke('adb:storage-detail', ctx),
  listApps: (includeSystem, ctx) => invoke('adb:list-apps', includeSystem, ctx),
  duChildren: (dirPath, ctx) => invoke('adb:du-children', dirPath, ctx),

  adbPair: (hostPort, code) => invoke('adb:pair', hostPort, code),
  adbConnect: hostPort => invoke('adb:connect', hostPort),
  qrPairStart: () => invoke('adb:qr-pair-start'),
  qrPairStop: () => invoke('adb:qr-pair-stop'),
  onWirelessEvent: callback => subscribe<WirelessEvent>('wireless-event', callback),

  persistGet: key => invoke('persist:get', key),
  persistSet: (key, data) => invoke('persist:set', key, data),
  getDiagnostics: () => invoke('app:diagnostics'),
  checkUpdateSilent: () => invoke('update:check-silent'),
  openReleasePage: () => invoke('open-release-page'),
  notify: (title, body) => invoke('notify', title, body),
  setTitle: title => invoke('set-title', title),
  newWindow: () => invoke('new-window'),
  showMainWindow: () => invoke('show-main-window'),
  hideWindow: () => invoke('hide-window'),
  showAbout: () => invoke('show-about'),
  getLicenses: () => invoke('get-licenses'),
  quitApp: () => invoke('app-quit'),
  onMenuAction: callback => subscribe('menu-action', callback),
}

contextBridge.exposeInMainWorld('droidwire', api)
