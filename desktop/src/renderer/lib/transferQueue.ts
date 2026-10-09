import type { DeviceContext, TransferProgress } from '@droidwire/shared'
import { SettleRegistry } from './settle.ts'

// The transfer queue behind the transfers panel, kept free of React so its
// behaviour (concurrency limit, pause/resume/retry, cancellation, upload
// completion promises) can be tested directly. useTransfers is a thin wrapper.

/** The slice of window.droidwire the queue needs. */
export interface TransferApi {
  pullFile(remotePath: string, fileName: string, transferId: string, ctx: DeviceContext): Promise<string>
  pushFile(localPath: string, remotePath: string, transferId: string, ctx: DeviceContext): Promise<void>
  zipAndPull(remoteDirPath: string, folderName: string, transferId: string, ctx: DeviceContext): Promise<string>
  cancelTransfer(transferId: string): Promise<void>
}

export interface BatchSummary {
  total: number
  done: number
  failed: number
}

export interface QueueOptions {
  /** At most this many transfers run at once; the rest wait. adb serialises device-side anyway. */
  maxActive?: number
  /** A transfer finished successfully (recorded once per transfer). */
  onRecordDone?: (t: TransferProgress) => void
  /** The queue drained after running at least one transfer. */
  onBatchComplete?: (summary: BatchSummary) => void
}

type ProgressEvent = Partial<TransferProgress> & { id: string }
type DownloadKind = 'file' | 'folder'

import { cleanIpcError } from './errors.ts'

const errorMessage = (e: unknown): string => cleanIpcError(e instanceof Error ? e.message : String(e))
const isBusy = (t: TransferProgress): boolean => t.status === 'active' || t.status === 'pending' || t.status === 'paused' || t.status === 'cancelling'

export class TransferQueue {
  private entries: TransferProgress[] = []
  private readonly listeners = new Set<() => void>()
  // id -> thunk that actually starts the transfer. Re-registered on pause so
  // resume restarts from scratch (adb cannot resume).
  private readonly starters = new Map<string, () => void>()
  private readonly settler = new SettleRegistry()
  private readonly recorded = new Set<string>()
  private readonly errored = new Set<string>()
  private batch: BatchSummary = { total: 0, done: 0, failed: 0 }
  private wasBusy = false
  private pumping = false
  private readonly api: TransferApi
  private readonly opts: QueueOptions
  private readonly maxActive: number

  constructor(api: TransferApi, opts: QueueOptions = {}) {
    this.api = api
    this.opts = opts
    this.maxActive = opts.maxActive ?? 3
  }

  // --- observable state -------------------------------------------------------

  /** Newest first. The array identity changes on every update. */
  getSnapshot = (): TransferProgress[] => this.entries

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private update(fn: (prev: TransferProgress[]) => TransferProgress[]): void {
    const next = fn(this.entries)
    if (next === this.entries) return
    this.entries = next
    this.checkDrained()
    for (const l of this.listeners) l()
    this.pump()
  }

  private patch(id: string, fn: (t: TransferProgress) => TransferProgress): void {
    this.update(prev => prev.map(t => (t.id === id ? fn(t) : t)))
  }

  private checkDrained(): void {
    const busy = this.entries.some(isBusy)
    if (this.wasBusy && !busy) {
      const summary = this.batch
      this.batch = { total: 0, done: 0, failed: 0 }
      this.opts.onBatchComplete?.(summary)
    }
    this.wasBusy = busy
  }

  /** Start the oldest pending transfers while slots are free. */
  private pump(): void {
    if (this.pumping) return
    this.pumping = true
    try {
      // A transfer that is being cancelled still occupies the phone until the native work has really stopped
      let slots = this.maxActive - this.entries.filter(t => t.status === 'active' || t.status === 'cancelling').length
      for (let i = this.entries.length - 1; i >= 0 && slots > 0; i--) {
        const t = this.entries[i]
        if (t.status !== 'pending') continue
        const starter = this.starters.get(t.id)
        if (!starter) continue
        this.starters.delete(t.id)
        slots--
        starter() // flips the entry to 'active' (re-entrancy is guarded)
      }
    } finally {
      this.pumping = false
    }
  }

  // --- bookkeeping --------------------------------------------------------------

  private recordDone(t: TransferProgress): void {
    if (this.recorded.has(t.id)) return
    this.recorded.add(t.id)
    this.batch.done++
    this.opts.onRecordDone?.(t)
  }

  private recordFailed(id: string): void {
    if (this.errored.has(id)) return
    this.errored.add(id)
    this.batch.failed++
  }

  private markError(id: string, error: string): void {
    this.recordFailed(id)
    this.settler.settle(id, false)
    // A cancel that was requested is now complete: the native work has ended, whatever error it ended with
    this.patch(id, t => (t.status === 'cancelling' ? { ...t, status: 'cancelled', speedBps: 0 }
      : t.status === 'paused' || t.status === 'cancelled' ? t : { ...t, status: 'error', error }))
  }

  private markActive(id: string): void {
    this.patch(id, t => ({ ...t, status: 'active', transferredBytes: 0, speedBps: 0 }))
  }

  // --- progress events from the main process ----------------------------------------

  handleProgress(p: ProgressEvent): void {
    this.patch(p.id, t => {
      // Killing a paused/cancelled transfer makes adb emit a late error - the user's chosen state wins
      if (t.status === 'paused' || t.status === 'cancelled') return t
      if (t.status === 'cancelling') {
        // Still winding down: only the end of the native work changes anything
        if (p.status === 'error') { this.recordFailed(t.id); this.settler.settle(t.id, false); return { ...t, status: 'cancelled', speedBps: 0 } }
        if (p.status === 'done') { const done = { ...t, ...p }; this.recordDone(done); this.settler.settle(t.id, true); return done }
        return t
      }
      const merged = { ...t, ...p }
      if (merged.status === 'done') this.recordDone(merged)
      if (merged.status === 'error') {
        this.recordFailed(merged.id)
        this.settler.settle(merged.id, false)
      }
      return merged
    })
  }

  // --- starting work ------------------------------------------------------------------

  private makeDownloadStarter(id: string, remotePath: string, fileName: string, ctx: DeviceContext, kind: DownloadKind): () => void {
    return () => {
      this.markActive(id)
      const run = kind === 'folder'
        ? this.api.zipAndPull(remotePath, fileName.replace(/\.zip$/i, ''), id, ctx)
        : this.api.pullFile(remotePath, fileName, id, ctx)
      run
        .then(localPath => this.patch(id, t => {
          // Finished anyway before the cancel took effect: the file exists, so say so
          const merged = { ...t, localPath, ...(t.status === 'cancelling' ? { status: 'done' as const, speedBps: 0 } : {}) }
          if (merged.status === 'done') this.recordDone(merged)
          return merged
        }))
        .catch(e => this.markError(id, errorMessage(e)))
    }
  }

  private makeUploadStarter(id: string, localPath: string, remotePath: string, ctx: DeviceContext): () => void {
    return () => {
      this.markActive(id)
      this.api.pushFile(localPath, remotePath, id, ctx)
        .then(() => {
          this.settler.settle(id, true)
          this.patch(id, t => (t.status === 'cancelling' ? { ...t, status: 'done', speedBps: 0 } : t))
        })
        // markError also settles the upload as failed, so a failed push can never leave its caller waiting
        .catch(e => this.markError(id, errorMessage(e)))
    }
  }

  /**
   * Queue a download. `ctx` is the device the user was looking at when they
   * asked; it is stored on the entry and reused for every (re)start.
   */
  download(remotePath: string, fileName: string, ctx: DeviceContext, kind: DownloadKind = 'file'): string {
    const id = `dl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const entry: TransferProgress = {
      id, fileName, filePath: remotePath, direction: 'download',
      totalBytes: 0, transferredBytes: 0, speedBps: 0, status: 'pending', device: ctx, kind,
    }
    this.batch.total++
    this.starters.set(id, this.makeDownloadStarter(id, remotePath, fileName, ctx, kind))
    this.update(prev => [entry, ...prev])
    return id
  }

  /** Queue an upload. Resolves true on success; false on failure, cancellation or dismissal. */
  upload(localPath: string, remoteDirPath: string, destName: string | undefined, ctx: DeviceContext): Promise<boolean> {
    const fileName = destName ?? localPath.split('/').pop() ?? 'file'
    const remotePath = remoteDirPath.replace(/\/$/, '') + '/' + fileName
    const id = `ul-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const entry: TransferProgress = {
      id, fileName, filePath: remotePath, direction: 'upload',
      totalBytes: 0, transferredBytes: 0, speedBps: 0, status: 'pending', device: ctx,
    }
    this.batch.total++
    this.starters.set(id, this.makeUploadStarter(id, localPath, remotePath, ctx))
    // Register the waiter before the entry becomes visible to the runner
    const outcome = this.settler.wait(id)
    this.update(prev => [entry, ...prev])
    return outcome
  }

  // --- user actions -----------------------------------------------------------------------

  /**
   * Cancel a transfer. One that never started (queued or paused) is cancelled at once. One that is running is
   * 'cancelling' until the native work has really stopped - which is when the main process answers - so the UI never
   * claims a cancellation that is still in progress. An upload waits for that point before its promise settles.
   */
  async cancel(id: string): Promise<void> {
    const t = this.entries.find(x => x.id === id)
    this.starters.delete(id)
    if (t?.status === 'active') {
      this.patch(id, x => ({ ...x, status: 'cancelling', speedBps: 0, cancelRequestedAt: Date.now() }))
    } else {
      this.settler.settle(id, false)
      this.patch(id, x => ({ ...x, status: 'cancelled' }))
    }
    try { await this.api.cancelTransfer(id) } catch { /* already finished */ }
  }

  /** Only queued transfers and active downloads can pause: an active upload's source path lives in its starter. */
  canPause = (t: TransferProgress): boolean =>
    t.status === 'pending' || (t.status === 'active' && t.direction === 'download')

  async pause(id: string): Promise<void> {
    const t = this.entries.find(x => x.id === id)
    if (!t || (t.status !== 'active' && t.status !== 'pending')) return
    if (t.status === 'pending') {
      this.patch(id, x => ({ ...x, status: 'paused' }))
      return
    }
    if (t.direction !== 'download' || !t.device) return
    // adb cannot suspend a transfer: stop it and restart from scratch on resume
    this.starters.set(id, this.makeDownloadStarter(id, t.filePath, t.fileName, t.device, t.kind ?? 'file'))
    this.patch(id, x => ({ ...x, status: 'paused', speedBps: 0 }))
    try { await this.api.cancelTransfer(id) } catch { /* already dead */ }
  }

  resume(id: string): void {
    if (!this.starters.has(id)) return
    this.patch(id, t => ({ ...t, status: 'pending', error: undefined }))
  }

  /** Move a queued transfer earlier/later in run order (oldest runs first, i.e. from the END of the list). */
  reorder(id: string, dir: 'up' | 'down'): void {
    this.update(prev => {
      const arr = [...prev]
      const queueIdx: number[] = []
      for (let i = arr.length - 1; i >= 0; i--) if (arr[i].status === 'pending') queueIdx.push(i)
      const pos = queueIdx.findIndex(i => arr[i].id === id)
      if (pos < 0) return prev
      const target = dir === 'up' ? pos - 1 : pos + 1
      if (target < 0 || target >= queueIdx.length) return prev
      const a = queueIdx[pos]
      const b = queueIdx[target]
      ;[arr[a], arr[b]] = [arr[b], arr[a]]
      return arr
    })
  }

  /** Re-queue a failed download against the device it originally used. */
  retry(transfer: TransferProgress): void {
    this.update(prev => prev.filter(t => t.id !== transfer.id))
    if (transfer.direction === 'download' && transfer.device) {
      this.download(transfer.filePath, transfer.fileName, transfer.device, transfer.kind ?? 'file')
    }
  }

  dismiss(id: string): void {
    this.starters.delete(id)
    this.settler.settle(id, false)
    this.update(prev => prev.filter(t => t.id !== id))
  }
}
