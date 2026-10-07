import { useState, useEffect } from 'react'
import { useTheme } from '../lib/ThemeContext'

interface Banner {
  id: string
  title: string
  body: string
  action: { label: string; run: () => void } | null
}

// Update-available notice, shown at most once per release. The check runs once
// per launch (unless turned off in the Droidwire menu) and only compares the
// latest GitHub release tag to this build; dismissals persist per release.
export function MessageBanners() {
  const { theme } = useTheme()
  const [banners, setBanners] = useState<Banner[]>([])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const dismissed = new Set(
        ((await window.droidwire.persistGet('dismissedMessages')) as string[] | null) ?? []
      )
      const collected: Banner[] = []

      const update = await window.droidwire.checkUpdateSilent().catch(() => null)
      if (update?.hasUpdate && !dismissed.has(`update-${update.latestTag}`)) {
        collected.push({
          id: `update-${update.latestTag}`,
          title: `Droidwire ${update.latestTag.replace(/^v/, '')} is available`,
          body: `You are on ${update.currentVersion}. Download the new version from GitHub.`,
          action: { label: 'Download', run: () => window.droidwire.openReleasePage() },
        })
      }

      if (!cancelled && collected.length > 0) setBanners(collected)
    })()
    return () => { cancelled = true }
  }, [])

  async function dismiss(id: string) {
    setBanners(prev => prev.filter(b => b.id !== id))
    const dismissed = ((await window.droidwire.persistGet('dismissedMessages')) as string[] | null) ?? []
    if (!dismissed.includes(id)) {
      await window.droidwire.persistSet('dismissedMessages', [...dismissed, id])
    }
  }

  if (banners.length === 0) return null

  return (
    <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
      {banners.map(b => (
        <div
          key={b.id}
          style={{
            display: 'flex', alignItems: 'center', gap: '12px',
            padding: '8px 14px',
            background: theme.surface,
            borderBottom: `1px solid ${theme.border}`,
            borderLeft: `3px solid ${theme.accent}`,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary }}>{b.title}</span>
            <span style={{ fontSize: '13px', color: theme.textMuted, marginLeft: '8px' }}>{b.body}</span>
          </div>
          {b.action && (
            <button
              onClick={b.action.run}
              style={{
                flexShrink: 0, padding: '5px 12px', background: theme.accent, border: 'none',
                borderRadius: '6px', color: theme.accentText, fontSize: '12px', fontWeight: 600, cursor: 'pointer',
              }}
            >
              {b.action.label}
            </button>
          )}
          <button
            onClick={() => dismiss(b.id)}
            aria-label="Dismiss"
            style={{
              flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer',
              color: theme.textMuted, padding: '4px', display: 'flex',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  )
}
