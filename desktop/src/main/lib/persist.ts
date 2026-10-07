// The renderer persists small JSON documents (bookmarks, transfer history,
// ...) through `persist:get` / `persist:set`. The key becomes a file name in
// userData, so it must come from a fixed allowlist rather than being trusted.
// Notably absent: `settings` (owned by the main process) and `beta-signup`
// (a legacy file Droidwire no longer reads or writes).

export const PERSIST_KEYS = ['bookmarks', 'transfer-history', 'dismissedMessages'] as const
export type PersistKey = typeof PERSIST_KEYS[number]

const MAX_PERSIST_BYTES = 2 * 1024 * 1024

export function assertPersistKey(key: unknown): PersistKey {
  if (typeof key !== 'string' || !(PERSIST_KEYS as readonly string[]).includes(key)) {
    throw new Error(`Unknown persistence key: ${JSON.stringify(key)}`)
  }
  return key as PersistKey
}

/** Serialise renderer data for disk, enforcing a size cap. */
export function serializePersisted(data: unknown): string {
  const json = JSON.stringify(data)
  if (json === undefined) throw new Error('Value is not serialisable')
  if (Buffer.byteLength(json) > MAX_PERSIST_BYTES) throw new Error('Persisted value too large')
  return json
}
