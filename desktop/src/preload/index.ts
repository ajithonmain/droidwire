import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('droidwire', {
  downloadFile: (url: string, fileName: string): Promise<string> =>
    ipcRenderer.invoke('download-file', url, fileName),

  openDownloads: (): Promise<void> =>
    ipcRenderer.invoke('open-downloads'),

  onTransferProgress: (callback: (progress: unknown) => void) => {
    ipcRenderer.on('transfer-progress', (_event, progress) => callback(progress))
    return () => ipcRenderer.removeAllListeners('transfer-progress')
  },
})
