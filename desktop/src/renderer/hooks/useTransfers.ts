import { useState, useEffect, useCallback, useRef } from 'react'
import type { TransferProgress } from '@droidwire/shared'

export interface HistoryEntry {
  id: string
  fileName: string
  filePath: string
  direction: 'download' | 'upload'
  totalBytes: number
  completedAt: number
  localPath?: string
}

export function useTransfers() {
  const [transfers, setTransfers] = useState<TransferProgress[]>([])
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const unsubRef = useRef<(() => void) | null>(null)
  const historyLoaded = useRef(false)
  const recordedIds = useRef<Set<string>>(new Set())

  useEffect(() => {
    window.droidwire.persistGet('transfer-history').then(data => {
      if (Array.isArray(data)) setHistory(data as HistoryEntry[])
      historyLoaded.current = true
    }).catch(() => { historyLoaded.current = true })
  }, [])

  useEffect(() => {
    if (!historyLoaded.current) return
    window.droidwire.persistSet('transfer-history', history).catch(() => {})
  }, [history])

  const recordDone = useCallback((t: TransferProgress) => {
    if (recordedIds.current.has(t.id)) return
    recordedIds.current.add(t.id)
    const entry: HistoryEntry = {
      id: t.id,
      fileName: t.fileName,
      filePath: t.filePath,
      direction: t.direction,
      totalBytes: t.totalBytes,
      completedAt: Date.now(),
      localPath: t.localPath,
    }
    setHistory(prev => [entry, ...prev].slice(0, 100))
  }, [])

  useEffect(() => {
    unsubRef.current = window.droidwire.onTransferProgress((raw) => {
      const p = raw as Partial<TransferProgress> & { id: string }
      setTransfers(prev => prev.map(t => {
        if (t.id !== p.id) return t
        const merged = { ...t, ...p }
        if (merged.status === 'done') recordDone(merged)
        return merged
      }))
    })
    return () => { if (unsubRef.current) unsubRef.current() }
  }, [recordDone])

  const download = useCallback(async (remotePath: string, fileName: string) => {
    const id = `dl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const entry: TransferProgress = {
      id, fileName, filePath: remotePath,
      direction: 'download', totalBytes: 0, transferredBytes: 0,
      speedBps: 0, status: 'active',
    }
    setTransfers(prev => [entry, ...prev])
    try {
      const localPath = await window.droidwire.pullFile(remotePath, fileName, id)
      setTransfers(prev => prev.map(t => {
        if (t.id !== id) return t
        const merged = { ...t, localPath }
        if (merged.status === 'done') recordDone(merged)
        return merged
      }))
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      setTransfers(prev => prev.map(t => t.id === id ? { ...t, status: 'error', error } : t))
    }
  }, [recordDone])

  const upload = useCallback(async (localPath: string, remoteDirPath: string, destName?: string) => {
    const fileName = destName ?? localPath.split('/').pop() ?? 'file'
    const remotePath = remoteDirPath.replace(/\/$/, '') + '/' + fileName
    const id = `ul-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const entry: TransferProgress = {
      id, fileName, filePath: remotePath,
      direction: 'upload', totalBytes: 0, transferredBytes: 0,
      speedBps: 0, status: 'active',
    }
    setTransfers(prev => [entry, ...prev])
    try {
      await window.droidwire.pushFile(localPath, remotePath, id)
      return true
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      setTransfers(prev => prev.map(t => t.id === id ? { ...t, status: 'error', error } : t))
      return false
    }
  }, [])

  const cancel = useCallback(async (id: string) => {
    try {
      await window.droidwire.cancelTransfer(id)
    } catch { /* already finished */ }
    setTransfers(prev => prev.map(t => t.id === id ? { ...t, status: 'cancelled' } : t))
  }, [])

  const retry = useCallback((transfer: TransferProgress) => {
    setTransfers(prev => prev.filter(t => t.id !== transfer.id))
    if (transfer.direction === 'download') {
      download(transfer.filePath, transfer.fileName)
    }
  }, [download])

  const dismiss = useCallback((id: string) => {
    setTransfers(prev => prev.filter(t => t.id !== id))
  }, [])

  const clearHistory = useCallback(() => {
    setHistory([])
  }, [])

  const activeCount = transfers.filter(t => t.status === 'active').length

  return { transfers, download, upload, cancel, retry, dismiss, activeCount, history, clearHistory }
}
