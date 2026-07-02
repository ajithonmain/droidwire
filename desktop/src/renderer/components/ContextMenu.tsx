import React, { useRef, useEffect, useState } from 'react'
import type { FileNode } from '@droidwire/shared'
import type { Theme } from '../lib/theme'
import { useTheme } from '../lib/ThemeContext'

interface Props {
  x: number
  y: number
  file: FileNode
  onClose: () => void
  onDownload: (file: FileNode) => void
  onDelete: (file: FileNode) => void
  onRename: (file: FileNode) => void
  onCopyPath: (file: FileNode) => void
  onNewFolder: () => void
  onZipDownload?: (file: FileNode) => void
  onInstallApk?: (file: FileNode) => void
  onOpenInNewTab?: (file: FileNode) => void
  onCopy?: (file: FileNode) => void
  onCut?: (file: FileNode) => void
  onPaste?: () => void
  hasClipboard?: boolean
  downloadCount?: number
}

interface Item {
  label: string
  onClick: () => void
  danger?: boolean
  separator?: boolean
}

function MenuItem({ item, onClose, theme }: { item: Item; onClose: () => void; theme: Theme }) {
  if (item.separator) {
    return <div style={{ height: '1px', background: theme.border, margin: '3px 6px' }} />
  }
  return (
    <div
      onClick={() => { item.onClick(); onClose() }}
      style={{
        padding: '7px 12px',
        fontSize: '13px',
        cursor: 'pointer',
        borderRadius: '5px',
        color: item.danger ? theme.error : theme.textPrimary,
        userSelect: 'none',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = theme.surfaceHover }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
    >
      {item.label}
    </div>
  )
}

export function ContextMenu({
  x, y, file, onClose, onDownload, onDelete, onRename, onCopyPath, onNewFolder,
  onZipDownload, onInstallApk, onOpenInNewTab, onCopy, onCut, onPaste, hasClipboard,
  downloadCount,
}: Props) {
  const { theme } = useTheme()
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })

  useEffect(() => {
    if (!menuRef.current) return
    const rect = menuRef.current.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    let left = x
    let top = y
    if (left + rect.width > vw - 8) left = vw - rect.width - 8
    if (top + rect.height > vh - 8) top = vh - rect.height - 8
    if (top < 8) top = 8
    if (left < 8) left = 8
    setPos({ left, top })
  }, [x, y])

  const isApk = file.type === 'file' && file.name.toLowerCase().endsWith('.apk')
  const isDir = file.type === 'dir'

  const items: Item[] = []
  if (isDir) {
    if (onZipDownload) items.push({ label: 'Download as ZIP', onClick: () => onZipDownload(file) })
    if (onOpenInNewTab) items.push({ label: 'Open in New Tab', onClick: () => onOpenInNewTab(file) })
  } else {
    items.push({
      label: downloadCount && downloadCount > 1 ? `Download ${downloadCount} Files` : 'Download',
      onClick: () => onDownload(file),
    })
    if (isApk && onInstallApk) items.push({ label: 'Install APK', onClick: () => onInstallApk(file) })
  }
  items.push({ separator: true, label: '', onClick: () => {} })
  if (onCopy) items.push({ label: 'Copy     ⌘C', onClick: () => onCopy(file) })
  if (onCut) items.push({ label: 'Cut        ⌘X', onClick: () => onCut(file) })
  if (onPaste && hasClipboard) items.push({ label: 'Paste    ⌘V', onClick: () => onPaste() })
  items.push({ label: 'Rename', onClick: () => onRename(file) })
  items.push({ label: 'Copy Path', onClick: () => onCopyPath(file) })
  items.push({ separator: true, label: '', onClick: () => {} })
  items.push({ label: 'New Folder', onClick: onNewFolder })
  items.push({ separator: true, label: '', onClick: () => {} })
  items.push({ label: 'Delete', onClick: () => onDelete(file), danger: true })

  return (
    <div
      onClick={onClose}
      onContextMenu={(e: React.MouseEvent) => { e.preventDefault(); onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 1000 }}
    >
      <div
        ref={menuRef}
        onClick={e => e.stopPropagation()}
        style={{
          position: 'fixed',
          left: pos.left,
          top: pos.top,
          background: theme.surface,
          border: `1px solid ${theme.border}`,
          borderRadius: '10px',
          padding: '4px',
          minWidth: '190px',
          boxShadow: `0 12px 40px ${theme.shadow}, 0 2px 8px ${theme.shadow}`,
          zIndex: 1001,
        }}
      >
        {items.map((item, i) => <MenuItem key={i} item={item} onClose={onClose} theme={theme} />)}
      </div>
    </div>
  )
}
