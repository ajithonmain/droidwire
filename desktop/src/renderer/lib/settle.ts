/**
 * Promises that must settle exactly once no matter how the work ends:
 * success, failure, cancellation or being dismissed from the queue.
 * An upload batch awaits one of these per file, so a promise that is never
 * settled would hang the whole batch (and everything after it) forever.
 */
export class SettleRegistry {
  private readonly waiters = new Map<string, (ok: boolean) => void>()

  /** Register interest in `id` and get a promise for its outcome. */
  wait(id: string): Promise<boolean> {
    return new Promise<boolean>(resolve => {
      this.waiters.set(id, resolve)
    })
  }

  /** Settle `id`; later calls for the same id are ignored. */
  settle(id: string, ok: boolean): void {
    const resolve = this.waiters.get(id)
    if (!resolve) return
    this.waiters.delete(id)
    resolve(ok)
  }

  get pending(): number {
    return this.waiters.size
  }
}
