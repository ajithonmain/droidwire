import type { TransferProgress } from '@droidwire/shared'

interface DroidwireAPI {
  downloadFile(url: string, fileName: string, transferId: string): Promise<string>
  uploadFile(localPath: string, fileName: string, destPath: string, transferId: string): Promise<void>
  openDownloads(): Promise<void>
  onTransferProgress(callback: (progress: unknown) => void): () => void
}

declare global {
  interface Window {
    droidwire: DroidwireAPI
  }

  // allow WebkitAppRegion on React style props
  namespace React {
    interface CSSProperties {
      WebkitAppRegion?: 'drag' | 'no-drag'
    }
  }
}

export {}
