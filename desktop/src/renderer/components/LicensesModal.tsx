import React, { useState, useEffect } from 'react'
import { useTheme } from '../lib/ThemeContext'

interface Props {
  onClose: () => void
}

// Renders THIRD-PARTY-NOTICES.md with just enough markdown support for
// that file: #/## headings, - bullets, **bold**, --- rules. Links stay
// as plain text - the renderer has no external-open bridge.
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={`${keyPrefix}-${i}`}>{part.slice(2, -2)}</strong>
      : <React.Fragment key={`${keyPrefix}-${i}`}>{part}</React.Fragment>
  )
}

export function LicensesModal({ onClose }: Props) {
  const { theme } = useTheme()
  const [text, setText] = useState<string | null>(null)

  useEffect(() => {
    window.droidwire.getLicenses().then(setText).catch(() => setText('Could not load license notices.'))
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Merge markdown soft-wrapped lines into logical blocks before rendering
  const blocks: { kind: 'h1' | 'h2' | 'li' | 'hr' | 'p'; text: string }[] = []
  if (text) {
    for (const raw of text.split('\n')) {
      const line = raw.trimEnd()
      if (!line.trim()) continue
      if (line.startsWith('## ')) blocks.push({ kind: 'h2', text: line.slice(3) })
      else if (line.startsWith('# ')) blocks.push({ kind: 'h1', text: line.slice(2) })
      else if (line.trim() === '---') blocks.push({ kind: 'hr', text: '' })
      else if (line.startsWith('- ')) blocks.push({ kind: 'li', text: line.slice(2) })
      else if (raw.startsWith('  ') && blocks.length && (blocks[blocks.length - 1].kind === 'li' || blocks[blocks.length - 1].kind === 'p')) {
        blocks[blocks.length - 1].text += ' ' + line.trim()
      } else if (blocks.length && blocks[blocks.length - 1].kind === 'p') {
        blocks[blocks.length - 1].text += ' ' + line.trim()
      } else blocks.push({ kind: 'p', text: line.trim() })
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1100,
        background: theme.overlay,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: '12px',
          width: '560px', maxWidth: 'calc(100vw - 48px)', maxHeight: 'calc(100vh - 96px)',
          display: 'flex', flexDirection: 'column',
          boxShadow: `0 20px 60px ${theme.shadow}`,
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px 12px', borderBottom: `1px solid ${theme.border}`,
        }}>
          <p style={{ fontSize: '16px', fontWeight: 600, color: theme.textPrimary, margin: 0 }}>Licenses</p>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'none', border: 'none', color: theme.textMuted,
              fontSize: '16px', cursor: 'pointer', padding: '2px 6px', lineHeight: 1,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div style={{ overflowY: 'auto', padding: '16px 20px 20px' }}>
          {text === null && (
            <p style={{ fontSize: '13px', color: theme.textMuted, margin: 0 }}>Loading…</p>
          )}
          {blocks.map((b, i) => {
            if (b.kind === 'hr') return <div key={i} style={{ borderTop: `1px solid ${theme.border}`, margin: '14px 0' }} />
            if (b.kind === 'h1') return <p key={i} style={{ fontSize: '15px', fontWeight: 700, color: theme.textPrimary, margin: '0 0 8px' }}>{b.text}</p>
            if (b.kind === 'h2') return <p key={i} style={{ fontSize: '13px', fontWeight: 700, color: theme.textPrimary, margin: '16px 0 6px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{b.text}</p>
            if (b.kind === 'li') return (
              <p key={i} style={{ fontSize: '13px', color: theme.textSecondary, margin: '0 0 5px', paddingLeft: '14px', position: 'relative', wordBreak: 'break-word' }}>
                <span style={{ position: 'absolute', left: 0 }}>·</span>
                {renderInline(b.text, `b${i}`)}
              </p>
            )
            return <p key={i} style={{ fontSize: '13px', color: theme.textSecondary, margin: '0 0 10px', wordBreak: 'break-word' }}>{renderInline(b.text, `b${i}`)}</p>
          })}
        </div>
      </div>
    </div>
  )
}
