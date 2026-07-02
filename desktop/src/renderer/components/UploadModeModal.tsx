import { useEffect } from 'react'
import { useTheme } from '../lib/ThemeContext'

interface Props {
  fileNames: string[]
  onCopy: () => void
  onMove: () => void
  onCancel: () => void
}

export function UploadModeModal({ fileNames, onCopy, onMove, onCancel }: Props) {
  const { theme } = useTheme()

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
      if (e.key === 'Enter') onCopy()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel, onCopy])

  const label = fileNames.length === 1
    ? `"${fileNames[0]}"`
    : `${fileNames.length} files`

  return (
    <div
      onClick={onCancel}
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
          Upload to device
        </p>
        <p style={{ fontSize: '12px', color: theme.textMuted, margin: '0 0 20px', lineHeight: 1.5 }}>
          What should happen to {label} on your Mac after uploading?
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button
            onClick={onCopy}
            autoFocus
            style={{
              background: theme.accent, border: 'none', borderRadius: '7px',
              color: '#000', fontSize: '13px', fontWeight: 600,
              padding: '9px 16px', cursor: 'pointer', textAlign: 'left',
            }}
          >
            Copy to Device
            <span style={{ fontSize: '11px', fontWeight: 400, display: 'block', opacity: 0.7, marginTop: '1px' }}>
              Keep original on Mac
            </span>
          </button>
          <button
            onClick={onMove}
            style={{
              background: theme.surfaceHover, border: `1px solid ${theme.border}`,
              borderRadius: '7px', color: theme.textPrimary,
              fontSize: '13px', fontWeight: 500,
              padding: '9px 16px', cursor: 'pointer', textAlign: 'left',
            }}
          >
            Move to Device
            <span style={{ fontSize: '11px', fontWeight: 400, display: 'block', color: theme.textMuted, marginTop: '1px' }}>
              Delete from Mac after upload
            </span>
          </button>
          <button
            onClick={onCancel}
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
