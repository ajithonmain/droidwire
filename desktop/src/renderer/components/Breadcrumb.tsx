import React from 'react'
import { useTheme } from '../lib/ThemeContext'

interface Props {
  path: string
  onNavigate: (path: string) => void
  compact?: boolean
}

const LABEL_OVERRIDES: Record<string, string> = {
  '/storage/emulated/0': 'Internal Storage',
  '/storage/emulated': 'Internal Storage',
  '/sdcard': 'Internal Storage',
}

const HIDDEN_SEGMENTS = new Set(['/storage', '/storage/emulated'])

export function Breadcrumb({ path, onNavigate, compact = false }: Props) {
  const { theme } = useTheme()
  const parts = path.split('/').filter(Boolean)
  const allCrumbs = [
    { label: 'Device', path: '/' },
    ...parts.map((part, i) => ({
      label: part,
      path: '/' + parts.slice(0, i + 1).join('/'),
    })),
  ]
  const crumbs = allCrumbs
    .filter(c => !HIDDEN_SEGMENTS.has(c.path))
    .map(c => ({ ...c, label: LABEL_OVERRIDES[c.path] ?? c.label }))

  if (compact) {
    // Bottom path bar - Finder style: subtle, small, full path
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '1px', overflow: 'hidden' }}>
        {crumbs.map((crumb, i) => {
          const isLast = i === crumbs.length - 1
          return (
            <React.Fragment key={crumb.path}>
              {i > 0 && (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ color: theme.border, flexShrink: 0, margin: '0 1px' }}>
                  <path d="M3.5 2L6.5 5L3.5 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              <button
                onClick={() => !isLast && onNavigate(crumb.path)}
                style={{
                  fontSize: '11px',
                  fontWeight: isLast ? 500 : 400,
                  color: isLast ? theme.textSecondary : theme.textMuted,
                  background: 'none',
                  border: 'none',
                  padding: '1px 3px',
                  cursor: isLast ? 'default' : 'pointer',
                  borderRadius: '3px',
                  flexShrink: isLast ? 1 : 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: isLast ? '200px' : '100px',
                }}
                onMouseEnter={e => { if (!isLast) (e.currentTarget as HTMLButtonElement).style.color = theme.textPrimary }}
                onMouseLeave={e => { if (!isLast) (e.currentTarget as HTMLButtonElement).style.color = theme.textMuted }}
              >
                {crumb.label}
              </button>
            </React.Fragment>
          )
        })}
      </div>
    )
  }

  return null
}
