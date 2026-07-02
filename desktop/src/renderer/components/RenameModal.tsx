import React, { useState, useEffect, useRef } from 'react'
import type { FileNode } from '@droidwire/shared'
import { useTheme } from '../lib/ThemeContext'

interface Props {
  file: FileNode | null
  onConfirm: (newName: string) => void
  onClose: () => void
}

export function RenameModal({ file, onConfirm, onClose }: Props) {
  const { theme } = useTheme()
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!file) return
    setValue(file.name)
    const t = setTimeout(() => {
      const input = inputRef.current
      if (!input) return
      input.focus()
      const dot = file.name.lastIndexOf('.')
      input.setSelectionRange(0, dot > 0 ? dot : file.name.length)
    }, 0)
    return () => clearTimeout(t)
  }, [file])

  if (!file) return null

  function submit() {
    const trimmed = value.trim()
    if (trimmed) onConfirm(trimmed)
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter') submit()
    else if (e.key === 'Escape') onClose()
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
          padding: '20px', width: '360px', boxShadow: `0 20px 60px ${theme.shadow}`,
        }}
      >
        <p style={{ fontSize: '16px', fontWeight: 600, color: theme.textPrimary, margin: '0 0 12px' }}>Rename</p>
        <input
          ref={inputRef}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={handleKey}
          style={{
            width: '100%', boxSizing: 'border-box',
            background: theme.inputBg, border: `1px solid ${theme.border}`, borderRadius: '4px',
            padding: '8px 10px', fontSize: '14px', color: theme.textPrimary, outline: 'none',
          }}
        />
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
            onClick={submit}
            style={{
              padding: '7px 14px', background: theme.accent, border: 'none',
              borderRadius: '6px', color: theme.accentText, fontSize: '13px', fontWeight: 600, cursor: 'pointer',
            }}
          >
            Rename
          </button>
        </div>
      </div>
    </div>
  )
}
