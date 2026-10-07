import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from 'react'
import type { TransferProgress } from '@droidwire/shared'
import { TransferQueue } from '../lib/transferQueue'

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
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const historyLoaded = useRef(false)

  // The queue itself (concurrency, pause/resume/retry, cancellation, upload
  // settling) lives in lib/transferQueue.ts; this hook binds it to React.
  const queueRef = useRef<TransferQueue | null>(null)
  if (queueRef.current === null) {
    queueRef.current = new TransferQueue(window.droidwire, {
      onRecordDone: t => {
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
      },
      // Batch-complete notification: fires when the queue drains
      onBatchComplete: b => {
        if (b.done >= 1 && (b.total >= 2 || !document.hasFocus())) {
          const body = b.failed > 0
            ? `${b.done} of ${b.total} files transferred, ${b.failed} failed`
            : `${b.done} file${b.done !== 1 ? 's' : ''} transferred`
          window.droidwire.notify('Transfers complete', body).catch(() => {})
        }
      },
    })
  }
  const queue = queueRef.current
  const transfers = useSyncExternalStore(queue.subscribe, queue.getSnapshot)

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

  useEffect(() => {
    return window.droidwire.onTransferProgress(raw => queue.handleProgress(raw as Partial<TransferProgress> & { id: string }))
  }, [queue])

  const clearHistory = useCallback(() => setHistory([]), [])
  const activeCount = transfers.filter(t => t.status === 'active' || t.status === 'pending').length

  return {
    transfers,
    download: queue.download.bind(queue),
    upload: queue.upload.bind(queue),
    cancel: queue.cancel.bind(queue),
    pause: queue.pause.bind(queue),
    resume: queue.resume.bind(queue),
    canPause: queue.canPause,
    reorder: queue.reorder.bind(queue),
    retry: queue.retry.bind(queue),
    dismiss: queue.dismiss.bind(queue),
    activeCount,
    history,
    clearHistory,
  }
}
