import { assertOperationId } from './lib/paths.ts'

// Registry of in-flight operations (transfers, zips) keyed by the id the
// renderer generated. Each gets an AbortController: aborting it kills the adb
// child process or restarts the MTP worker, whichever the transport uses.
//
// begin() is called synchronously at the top of an IPC handler, before any
// await, so a cancel that arrives immediately after the request always finds
// the operation - there is no window where work can start after being cancelled.

const operations = new Map<string, AbortController>()

export function beginOperation(rawId: unknown): { id: string; signal: AbortSignal } {
  const id = assertOperationId(rawId)
  if (operations.has(id)) throw new Error(`Operation ${id} is already running`)
  const controller = new AbortController()
  operations.set(id, controller)
  return { id, signal: controller.signal }
}

export function endOperation(id: string): void {
  operations.delete(id)
}

export function cancelOperation(rawId: unknown): boolean {
  const id = assertOperationId(rawId)
  const controller = operations.get(id)
  if (!controller) return false
  controller.abort()
  return true
}

export function cancelAllOperations(): void {
  for (const controller of operations.values()) controller.abort()
}

export function activeOperationCount(): number {
  return operations.size
}
