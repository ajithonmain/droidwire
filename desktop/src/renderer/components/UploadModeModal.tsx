import { useEffect } from 'react'
import { useTheme } from '../lib/ThemeContext'

interface Props {
  fileNames: string[]
  onCopy: () => void
  onMove: () => void
  onCancel: () => void
  // 'upload' = Mac -> device (default), 'onDevice' = folder -> folder on the phone
  variant?: 'upload' | 'onDevice'
  destName?: string
}

export function UploadModeModal({ fileNames, onCopy, onMove, onCancel, variant = 'upload', destName }: Props) {
  const { theme } = useTheme()

  // Deliberately no Escape/outside-click dismissal - Copy vs Move needs an
  // explicit decision. Enter picks the safe default (Copy).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Enter') onCopy()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCopy])

  const label = fileNames.length === 1
    ? `"${fileNames[0]}"`
    : `${fileNames.length} files`

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
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}
      >
        <p style={{ fontSize: '15px', fontWeight: 600, color: theme.textPrimary, margin: '0 0 6px' }}>
          {variant === 'upload' ? 'Upload to device' : `Copy or move${destName ? ` to ${destName}` : ''}`}
        </p>
        <p style={{ fontSize: '13px', color: theme.textSecondary, margin: '0 0 20px', lineHeight: 1.5 }}>
          {variant === 'upload'
            ? <>What should happen to {label} on your Mac after uploading?</>
            : <>What should happen to {label} in the original folder?</>}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button
            onClick={onCopy}
            autoFocus
            style={{
              background: theme.accent, border: 'none', borderRadius: '7px',
              color: theme.accentText, fontSize: '14px', fontWeight: 600,
              padding: '9px 16px', cursor: 'pointer', textAlign: 'left',
            }}
          >
            {variant === 'upload' ? 'Copy to Device' : 'Copy'}
            <span style={{ fontSize: '12px', fontWeight: 400, display: 'block', opacity: 0.75, marginTop: '2px' }}>
              {variant === 'upload' ? 'Keep original on Mac' : 'Keep original in its folder'}
            </span>
          </button>
          <button
            onClick={onMove}
            style={{
              background: theme.surfaceHover, border: `1px solid ${theme.border}`,
              borderRadius: '7px', color: theme.textPrimary,
              fontSize: '14px', fontWeight: 500,
              padding: '9px 16px', cursor: 'pointer', textAlign: 'left',
            }}
          >
            {variant === 'upload' ? 'Move to Device' : 'Move'}
            <span style={{ fontSize: '12px', fontWeight: 400, display: 'block', color: theme.textSecondary, marginTop: '2px' }}>
              {variant === 'upload' ? 'Delete from Mac after upload' : 'Remove from the original folder'}
            </span>
          </button>
          <button
            onClick={onCancel}
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
