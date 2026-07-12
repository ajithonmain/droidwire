import { useState } from 'react'
import { useTheme } from '../lib/ThemeContext'

export type ConflictChoice = 'replace' | 'keep-both' | 'cancel'

export interface ConflictResolution {
  choice: ConflictChoice
  applyToAll: boolean
}

interface Props {
  conflictNames: string[]
  showApplyAll?: boolean
  onResolve: (resolution: ConflictResolution) => void
}

export function FileConflictModal({ conflictNames, showApplyAll, onResolve }: Props) {
  const { theme } = useTheme()
  const [applyToAll, setApplyToAll] = useState(false)

  // Deliberately no Escape/outside-click dismissal - a conflict needs an
  // explicit decision, accidental dismissal cancels queued transfers.
  const resolve = (choice: ConflictChoice) => onResolve({ choice, applyToAll })

  const label = conflictNames.length === 1
    ? `"${conflictNames[0]}"`
    : `${conflictNames.length} files`

  return (
    <div
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
          maxWidth: 'calc(100vw - 24px)',
          boxSizing: 'border-box',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}
      >
        <p style={{ fontSize: '15px', fontWeight: 600, color: theme.textPrimary, margin: '0 0 6px' }}>
          Item already exists
        </p>
        <p style={{ fontSize: '13px', color: theme.textSecondary, margin: '0 0 20px', lineHeight: 1.5 }}>
          {label} {conflictNames.length === 1 ? 'already exists' : 'already exist'} at the destination.
          What would you like to do?
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button
            onClick={() => resolve('keep-both')}
            autoFocus
            style={{
              background: theme.accent, border: 'none', borderRadius: '7px',
              color: theme.accentText, fontSize: '14px', fontWeight: 600,
              padding: '9px 16px', cursor: 'pointer', textAlign: 'left',
            }}
          >
            Keep Both
            <span style={{ fontSize: '12px', fontWeight: 400, display: 'block', opacity: 0.75, marginTop: '2px' }}>
              Rename the new {conflictNames.length === 1 ? 'item' : 'items'} automatically
            </span>
          </button>
          <button
            onClick={() => resolve('replace')}
            style={{
              background: theme.surfaceHover, border: `1px solid ${theme.border}`,
              borderRadius: '7px', color: theme.textPrimary,
              fontSize: '14px', fontWeight: 500,
              padding: '9px 16px', cursor: 'pointer', textAlign: 'left',
            }}
          >
            Replace
            <span style={{ fontSize: '12px', fontWeight: 400, display: 'block', color: theme.textSecondary, marginTop: '2px' }}>
              Overwrite the existing {conflictNames.length === 1 ? 'item' : 'items'}
            </span>
          </button>
          {showApplyAll && (
            <label
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '4px 2px', cursor: 'pointer', userSelect: 'none',
              }}
            >
              <span
                onClick={e => { e.preventDefault(); setApplyToAll(v => !v) }}
                style={{
                  width: '15px', height: '15px', flexShrink: 0,
                  borderRadius: '4px',
                  border: `1px solid ${applyToAll ? theme.accent : theme.border}`,
                  background: applyToAll ? theme.accent : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                {applyToAll && (
                  <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                    <path d="M1.5 5.5L4 8L8.5 2.5" stroke="#000" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
              <span
                onClick={e => { e.preventDefault(); setApplyToAll(v => !v) }}
                style={{ fontSize: '12px', color: theme.textMuted }}
              >
                Do this for all remaining conflicts
              </span>
            </label>
          )}
          <button
            onClick={() => resolve('cancel')}
            style={{
              background: 'none', border: 'none', borderRadius: '7px',
              color: theme.textSecondary, fontSize: '13px',
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
