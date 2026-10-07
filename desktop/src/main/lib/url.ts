// External URLs may only be opened if they are https and on a known host.
const ALLOWED_HOSTS = new Set(['github.com'])

export function isAllowedExternalUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && ALLOWED_HOSTS.has(u.hostname) && u.username === '' && u.password === ''
  } catch {
    return false
  }
}

/** Is `target` the app's own page? Used to block renderer navigation away from it. */
export function isAppUrl(target: string, appUrls: string[]): boolean {
  try {
    const t = new URL(target)
    return appUrls.some(base => {
      const b = new URL(base)
      if (b.protocol === 'file:') return t.protocol === 'file:' && t.pathname === b.pathname
      return t.origin === b.origin
    })
  } catch {
    return false
  }
}
