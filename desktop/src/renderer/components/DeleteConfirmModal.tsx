import React, { useEffect } from 'react'
import type { FileNode } from '@droidwire/shared'
import { useTheme } from '../lib/ThemeContext'

interface Props {
  files: FileNode[]
  onConfirm: () => void
  onClose: () => void
}

export function DeleteConfirmModal({ files, onConfirm, onClose }: Props) {
  const { theme } = useTheme()

  useEffect(() => {
    if (files.length === 0) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'Enter') onConfirm()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [files, onConfirm, onClose])

  if (files.length === 0) return null

  const isSingle = files.length === 1
  const first = files[0]
  const label = isSingle
    ? `${first.type === 'dir' ? 'folder' : 'file'}`
    : `${files.length} items`

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
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
        style={{
          background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: '12px',
          padding: '20px', width: '360px', boxShadow: `0 20px 60px ${theme.shadow}`,
        }}
      >
        <p style={{ fontSize: '16px', fontWeight: 600, color: theme.textPrimary, margin: '0 0 8px' }}>
          Delete {label}?
        </p>
        {isSingle ? (
          <p style={{ fontSize: '14px', color: theme.textSecondary, margin: '0 0 4px', wordBreak: 'break-word', lineHeight: 1.4 }}>
            {first.name}
          </p>
        ) : (
          <div style={{ marginBottom: '4px' }}>
            {files.slice(0, 4).map(f => (
              <p key={f.path} style={{ fontSize: '13px', color: theme.textSecondary, margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {f.name}
              </p>
            ))}
            {files.length > 4 && (
              <p style={{ fontSize: '12px', color: theme.textMuted, margin: '2px 0 0' }}>
                +{files.length - 4} more
              </p>
            )}
          </div>
        )}
        <p style={{ fontSize: '13px', color: theme.warning, margin: '0 0 4px' }}>
          This cannot be undone.
        </p>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
          <button
            onClick={onClose}
            style={{
              padding: '7px 14px', background: theme.surfaceHover, border: `1px solid ${theme.border}`,
              borderRadius: '6px', color: theme.textSecondary, fontSize: '13px', cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: '7px 14px', background: theme.error, border: 'none',
              borderRadius: '6px', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}
