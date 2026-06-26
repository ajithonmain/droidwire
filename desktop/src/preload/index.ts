import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('droidwire', {
  downloadFile: (url: string, fileName: string, transferId: string): Promise<string> =>
    ipcRenderer.invoke('download-file', url, fileName, transferId),

  uploadFile: (localPath: string, fileName: string, destPath: string, transferId: string): Promise<void> =>
    ipcRenderer.invoke('upload-file', localPath, fileName, destPath, transferId),

  openDownloads: (): Promise<void> =>
    ipcRenderer.invoke('open-downloads'),

  onTransferProgress: (callback: (progress: unknown) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: unknown) => callback(progress)
    ipcRenderer.on('transfer-progress', handler)
    return () => ipcRenderer.removeListener('transfer-progress', handler)
  },
})
