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

// At most this many transfers run at once — the rest wait in the queue.
// adb serializes device-side anyway; more concurrency just splits bandwidth.
const MAX_ACTIVE = 3

export function useTransfers() {
  const [transfers, setTransfers] = useState<TransferProgress[]>([])
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const unsubRef = useRef<(() => void) | null>(null)
  const historyLoaded = useRef(false)
  const recordedIds = useRef<Set<string>>(new Set())
  const erroredIds = useRef<Set<string>>(new Set())

  // Queued work: id → thunk that actually runs the transfer. Re-registered
  // on pause so resume restarts the transfer from scratch (adb can't resume).
  const startersRef = useRef<Map<string, () => void>>(new Map())
  // Upload callers await completion (move-after-upload) — deferred per id
  const uploadResolversRef = useRef<Map<string, (ok: boolean) => void>>(new Map())
  // Batch counters for the completion notification
  const batchRef = useRef({ total: 0, done: 0, failed: 0 })
  const prevBusyRef = useRef(false)

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
    batchRef.current.done++
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

  const recordFailed = useCallback((id: string) => {
    if (erroredIds.current.has(id)) return
    erroredIds.current.add(id)
    batchRef.current.failed++
  }, [])

  useEffect(() => {
    unsubRef.current = window.droidwire.onTransferProgress((raw) => {
      const p = raw as Partial<TransferProgress> & { id: string }
      setTransfers(prev => prev.map(t => {
        if (t.id !== p.id) return t
        // Killing a paused/cancelled transfer makes adb emit a late error —
        // the user's chosen state wins
        if (t.status === 'paused' || t.status === 'cancelled') return t
        const merged = { ...t, ...p }
        if (merged.status === 'done') recordDone(merged)
        if (merged.status === 'error') recordFailed(merged.id)
        return merged
      }))
    })
    return () => { if (unsubRef.current) unsubRef.current() }
  }, [recordDone, recordFailed])

  // Queue runner — start the oldest pending transfers while slots are free
  useEffect(() => {
    const active = transfers.filter(t => t.status === 'active').length
    let slots = MAX_ACTIVE - active
    if (slots <= 0) return
    for (let i = transfers.length - 1; i >= 0 && slots > 0; i--) {
      const t = transfers[i]
      if (t.status !== 'pending') continue
      const starter = startersRef.current.get(t.id)
      if (!starter) continue
      startersRef.current.delete(t.id)
      slots--
      starter()
    }
  }, [transfers])

  // Batch-complete notification: fires when the queue drains
  useEffect(() => {
    const busy = transfers.some(t => t.status === 'active' || t.status === 'pending' || t.status === 'paused')
    if (prevBusyRef.current && !busy) {
      const b = batchRef.current
      if (b.done >= 1 && (b.total >= 2 || !document.hasFocus())) {
        const body = b.failed > 0
          ? `${b.done} of ${b.total} files transferred, ${b.failed} failed`
          : `${b.done} file${b.done !== 1 ? 's' : ''} transferred`
        window.droidwire.notify('Transfers complete', body).catch(() => {})
      }
      batchRef.current = { total: 0, done: 0, failed: 0 }
    }
    prevBusyRef.current = busy
  }, [transfers])

  const markError = useCallback((id: string, error: string) => {
    recordFailed(id)
    setTransfers(prev => prev.map(t =>
      t.id === id && t.status !== 'paused' && t.status !== 'cancelled'
        ? { ...t, status: 'error', error }
        : t
    ))
  }, [recordFailed])

  const makeDownloadStarter = useCallback((id: string, remotePath: string, fileName: string) => {
    return () => {
      setTransfers(prev => prev.map(t => t.id === id ? { ...t, status: 'active', transferredBytes: 0, speedBps: 0 } : t))
      window.droidwire.pullFile(remotePath, fileName, id)
        .then(localPath => {
          setTransfers(prev => prev.map(t => {
            if (t.id !== id) return t
            const merged = { ...t, localPath }
            if (merged.status === 'done') recordDone(merged)
            return merged
          }))
        })
        .catch(e => markError(id, e instanceof Error ? e.message : String(e)))
    }
  }, [recordDone, markError])

  const makeUploadStarter = useCallback((id: string, localPath: string, remotePath: string) => {
    return () => {
      setTransfers(prev => prev.map(t => t.id === id ? { ...t, status: 'active', transferredBytes: 0, speedBps: 0 } : t))
      window.droidwire.pushFile(localPath, remotePath, id)
        .then(() => {
          uploadResolversRef.current.get(id)?.(true)
          uploadResolversRef.current.delete(id)
        })
        .catch(e => {
          markError(id, e instanceof Error ? e.message : String(e))
        })
    }
  }, [markError])

  const download = useCallback(async (remotePath: string, fileName: string) => {
    const id = `dl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const entry: TransferProgress = {
      id, fileName, filePath: remotePath,
      direction: 'download', totalBytes: 0, transferredBytes: 0,
      speedBps: 0, status: 'pending',
    }
    batchRef.current.total++
    startersRef.current.set(id, makeDownloadStarter(id, remotePath, fileName))
    setTransfers(prev => [entry, ...prev])
  }, [makeDownloadStarter])

  const upload = useCallback(async (localPath: string, remoteDirPath: string, destName?: string) => {
    const fileName = destName ?? localPath.split('/').pop() ?? 'file'
    const remotePath = remoteDirPath.replace(/\/$/, '') + '/' + fileName
    const id = `ul-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const entry: TransferProgress = {
      id, fileName, filePath: remotePath,
      direction: 'upload', totalBytes: 0, transferredBytes: 0,
      speedBps: 0, status: 'pending',
    }
    batchRef.current.total++
    startersRef.current.set(id, makeUploadStarter(id, localPath, remotePath))
    setTransfers(prev => [entry, ...prev])
    return new Promise<boolean>(resolve => {
      uploadResolversRef.current.set(id, resolve)
    })
  }, [makeUploadStarter])

  const cancel = useCallback(async (id: string) => {
    startersRef.current.delete(id)
    uploadResolversRef.current.get(id)?.(false)
    uploadResolversRef.current.delete(id)
    setTransfers(prev => prev.map(t => t.id === id ? { ...t, status: 'cancelled' } : t))
    try {
      await window.droidwire.cancelTransfer(id)
    } catch { /* already finished */ }
  }, [])

  const pause = useCallback(async (id: string) => {
    const t = transfers.find(x => x.id === id)
    if (!t || (t.status !== 'active' && t.status !== 'pending')) return
    if (t.status === 'active') {
      // Active uploads can't be rebuilt from state (the local source path only
      // lives in the starter closure) — pausing them is not offered (canPause)
      if (t.direction !== 'download') return
      // adb can't suspend a transfer — kill it and restart from scratch on resume
      startersRef.current.set(id, makeDownloadStarter(id, t.filePath, t.fileName))
      setTransfers(prev => prev.map(x => x.id === id ? { ...x, status: 'paused', speedBps: 0 } : x))
      try { await window.droidwire.cancelTransfer(id) } catch { /* already dead */ }
    } else {
      setTransfers(prev => prev.map(x => x.id === id ? { ...x, status: 'paused' } : x))
    }
  }, [transfers, makeDownloadStarter])

  const resume = useCallback((id: string) => {
    if (!startersRef.current.has(id)) return
    setTransfers(prev => prev.map(t => t.id === id ? { ...t, status: 'pending', error: undefined } : t))
  }, [])

  const canPause = useCallback((t: TransferProgress) => {
    // Active uploads can't restart from state (local path lives in the starter
    // closure) — only queued uploads and any download are pausable
    return t.status === 'pending' || (t.status === 'active' && t.direction === 'download')
  }, [])

  // Move a queued transfer earlier/later in the run order. Queue order is
  // oldest-first, i.e. from the END of the transfers array (new entries are
  // prepended), so "up" swaps toward the array end.
  const reorder = useCallback((id: string, dir: 'up' | 'down') => {
    setTransfers(prev => {
      const arr = [...prev]
      const queueIdx: number[] = []
      for (let i = arr.length - 1; i >= 0; i--) {
        if (arr[i].status === 'pending') queueIdx.push(i)
      }
      const pos = queueIdx.findIndex(i => arr[i].id === id)
      if (pos < 0) return prev
      const target = dir === 'up' ? pos - 1 : pos + 1
      if (target < 0 || target >= queueIdx.length) return prev
      const a = queueIdx[pos]
      const b = queueIdx[target]
      ;[arr[a], arr[b]] = [arr[b], arr[a]]
      return arr
    })
  }, [])

  const retry = useCallback((transfer: TransferProgress) => {
    setTransfers(prev => prev.filter(t => t.id !== transfer.id))
    if (transfer.direction === 'download') {
      download(transfer.filePath, transfer.fileName)
    }
  }, [download])

  const dismiss = useCallback((id: string) => {
    startersRef.current.delete(id)
    setTransfers(prev => prev.filter(t => t.id !== id))
  }, [])

  const clearHistory = useCallback(() => {
    setHistory([])
  }, [])

  const activeCount = transfers.filter(t => t.status === 'active' || t.status === 'pending').length

  return { transfers, download, upload, cancel, pause, resume, canPause, reorder, retry, dismiss, activeCount, history, clearHistory }
}
