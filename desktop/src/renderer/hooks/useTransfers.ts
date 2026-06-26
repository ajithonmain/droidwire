import { useState, useEffect, useCallback, useRef } from 'react'
import type { TransferProgress } from '@droidwire/shared'
import { downloadUrl } from '../lib/api'

export function useTransfers(onDisconnect: () => void) {
  const [transfers, setTransfers] = useState<TransferProgress[]>([])
  const unsubRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    unsubRef.current = window.droidwire.onTransferProgress((progress) => {
      const p = progress as Partial<TransferProgress> & { id: string }
      setTransfers(prev =>
        prev.map(t => t.id === p.id ? { ...t, ...p } : t)
      )
    })
    return () => {
      if (unsubRef.current) unsubRef.current()
    }
  }, [])

  const download = useCallback(async (filePath: string, fileName: string) => {
    const id = `dl-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const url = downloadUrl(filePath)

    const entry: TransferProgress = {
      id,
      fileName,
      filePath,
      direction: 'download',
      totalBytes: 0,
      transferredBytes: 0,
      speedBps: 0,
      status: 'pending',
    }
    setTransfers(prev => [entry, ...prev])

    try {
      setTransfers(prev => prev.map(t => t.id === id ? { ...t, status: 'active' } : t))
      await window.droidwire.downloadFile(url, fileName, id)
      setTransfers(prev => prev.map(t => t.id === id ? { ...t, status: 'done' } : t))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('fetch') || msg.includes('network') || msg.includes('connect')) {
        onDisconnect()
      }
      setTransfers(prev =>
        prev.map(t => t.id === id ? { ...t, status: 'error', error: msg } : t)
      )
    }
  }, [onDisconnect])

  const upload = useCallback(async (localPath: string, fileName: string, destPath: string) => {
    const id = `ul-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const entry: TransferProgress = {
      id,
      fileName,
      filePath: destPath,
      direction: 'upload',
      totalBytes: 0,
      transferredBytes: 0,
      speedBps: 0,
      status: 'pending',
    }
    setTransfers(prev => [entry, ...prev])

    try {
      setTransfers(prev => prev.map(t => t.id === id ? { ...t, status: 'active' } : t))
      await window.droidwire.uploadFile(localPath, fileName, destPath, id)
      setTransfers(prev => prev.map(t => t.id === id ? { ...t, status: 'done' } : t))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setTransfers(prev =>
        prev.map(t => t.id === id ? { ...t, status: 'error', error: msg } : t)
      )
    }
  }, [])

  const dismiss = useCallback((id: string) => {
    setTransfers(prev => prev.filter(t => t.id !== id))
  }, [])

  const activeCount = transfers.filter(t => t.status === 'active' || t.status === 'pending').length

  return { transfers, download, upload, dismiss, activeCount }
}
