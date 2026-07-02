import { useEffect } from 'react'
import { useTheme } from '../lib/ThemeContext'

export type ConflictChoice = 'replace' | 'keep-both' | 'cancel'

interface Props {
  conflictNames: string[]
  onResolve: (choice: ConflictChoice) => void
}

export function FileConflictModal({ conflictNames, onResolve }: Props) {
  const { theme } = useTheme()

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onResolve('cancel')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onResolve])

  const label = conflictNames.length === 1
    ? `"${conflictNames[0]}"`
    : `${conflictNames.length} files`

  return (
    <div
      onClick={() => onResolve('cancel')}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: theme.surface,
          border: `1px solid ${theme.border}`,
          borderRadius: '12px',
          padding: '22px 24px',
          width: '340px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}
      >
        <p style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary, margin: '0 0 6px' }}>
          Item already exists
        </p>
        <p style={{ fontSize: '12px', color: theme.textMuted, margin: '0 0 20px', lineHeight: 1.5 }}>
          {label} {conflictNames.length === 1 ? 'already exists' : 'already exist'} at the destination.
          What would you like to do?
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button
            onClick={() => onResolve('keep-both')}
            autoFocus
            style={{
              background: theme.accent, border: 'none', borderRadius: '7px',
              color: '#000', fontSize: '13px', fontWeight: 600,
              padding: '9px 16px', cursor: 'pointer', textAlign: 'left',
            }}
          >
            Keep Both
            <span style={{ fontSize: '11px', fontWeight: 400, display: 'block', opacity: 0.7, marginTop: '1px' }}>
              Rename the new {conflictNames.length === 1 ? 'item' : 'items'} automatically
            </span>
          </button>
          <button
            onClick={() => onResolve('replace')}
            style={{
              background: theme.surfaceHover, border: `1px solid ${theme.border}`,
              borderRadius: '7px', color: theme.textPrimary,
              fontSize: '13px', fontWeight: 500,
              padding: '9px 16px', cursor: 'pointer', textAlign: 'left',
            }}
          >
            Replace
            <span style={{ fontSize: '11px', fontWeight: 400, display: 'block', color: theme.textMuted, marginTop: '1px' }}>
              Overwrite the existing {conflictNames.length === 1 ? 'item' : 'items'}
            </span>
          </button>
          <button
            onClick={() => onResolve('cancel')}
            style={{
              background: 'none', border: 'none', borderRadius: '7px',
              color: theme.textMuted, fontSize: '12px',
              padding: '7px 16px', cursor: 'pointer', textAlign: 'center',
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
