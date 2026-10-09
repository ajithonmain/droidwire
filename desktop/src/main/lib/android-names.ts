// Android's shared storage (FUSE / sdcardfs, FAT SD cards) refuses file names containing
// these characters even though macOS allows most of them. The device reports only a bare
// "Operation not permitted", so a refused rename, folder or upload looks like a random failure.
const FORBIDDEN = /["*:<>?\\|]/g

/** The characters in `name` that Android shared storage does not accept (unique, in order of appearance). */
export function androidForbiddenChars(name: string): string[] {
  return [...new Set(name.match(FORBIDDEN) ?? [])]
}

/**
 * Turn a refused operation into an explanation when the name is the likely cause. Only rewrites a
 * permission-style refusal for a name that actually contains a forbidden character; anything else
 * is passed through untouched.
 */
export function explainRemoteNameError(err: unknown, name: string): Error {
  const message = err instanceof Error ? err.message : String(err)
  const bad = androidForbiddenChars(name)
  if (bad.length > 0 && /operation not permitted|permission denied|couldn't create file|invalid argument/i.test(message)) {
    return new Error(`Android does not allow ${bad.map(c => `"${c}"`).join(' ')} in file names. Rename "${name}" without ${bad.length > 1 ? 'those characters' : 'that character'} and try again.`)
  }
  return err instanceof Error ? err : new Error(message)
}
