import fs from 'node:fs'
import path from 'node:path'

/** Total size in bytes of all regular files under `dir` (0 if it does not exist). */
export async function treeSize(dir: string): Promise<number> {
  let total = 0
  async function walk(d: string): Promise<void> {
    let entries: fs.Dirent[]
    try { entries = await fs.promises.readdir(d, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) await walk(p)
      else if (e.isFile()) {
        try { total += (await fs.promises.stat(p)).size } catch { /* vanished mid-walk */ }
      }
    }
  }
  await walk(dir)
  return total
}

/** Move a file, falling back to copy+unlink when rename crosses devices. */
export async function moveFile(from: string, to: string): Promise<void> {
  try {
    await fs.promises.rename(from, to)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EXDEV') throw err
    await fs.promises.copyFile(from, to)
    await fs.promises.unlink(from)
  }
}

/** Remove temp directories (by name prefix) under `root` untouched for `maxAgeMs`. */
export async function removeStaleDirs(root: string, prefix: string, maxAgeMs: number, now = Date.now()): Promise<number> {
  let removed = 0
  let names: string[]
  try { names = await fs.promises.readdir(root) } catch { return 0 }
  for (const name of names) {
    if (!name.startsWith(prefix)) continue
    const p = path.join(root, name)
    try {
      const st = await fs.promises.stat(p)
      if (st.isDirectory() && now - st.mtimeMs > maxAgeMs) {
        await fs.promises.rm(p, { recursive: true, force: true })
        removed++
      }
    } catch { /* raced with another cleanup */ }
  }
  return removed
}
