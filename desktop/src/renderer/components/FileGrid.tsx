import React, { useState } from 'react'
import type { FileNode } from '@droidwire/shared'
import { formatSize, formatDate } from '../lib/format'

interface Props {
  files: FileNode[]
  loading: boolean
  currentPath: string
  onNavigate: (path: string) => void
  onDownload: (file: FileNode) => void
}

function FileIcon({ mimeType }: { mimeType: string | null }) {
  const color = '#6B6B6B'
  if (!mimeType) return <GenericIcon color={color} />
  if (mimeType.startsWith('image/')) return <ImageIcon color="#00D84A" />
  if (mimeType.startsWith('video/')) return <VideoIcon color="#FF9500" />
  if (mimeType.startsWith('audio/')) return <AudioIcon color="#007AFF" />
  if (mimeType === 'application/pdf') return <PdfIcon color="#FF4444" />
  if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('7z')) return <ArchiveIcon color="#6B6B6B" />
  return <GenericIcon color={color} />
}

function FolderIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2 4.5C2 3.672 2.672 3 3.5 3H6.5L7.5 4.5H12.5C13.328 4.5 14 5.172 14 6V12C14 12.828 13.328 13.5 12.5 13.5H3.5C2.672 13.5 2 12.828 2 12V4.5Z" fill="#6B6B6B" fillOpacity="0.7" />
    </svg>
  )
}

function GenericIcon({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M4 2h5.5L12 4.5V14H4V2Z" stroke={color} strokeWidth="1.2" fill="none" strokeLinejoin="round" />
      <path d="M9.5 2v2.5H12" stroke={color} strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ImageIcon({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="2" width="12" height="12" rx="2" stroke={color} strokeWidth="1.2" fill="none" />
      <circle cx="5.5" cy="5.5" r="1.2" fill={color} />
      <path d="M2 10.5l3.5-3.5L8 9.5l2.5-2 3.5 2.5" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function VideoIcon({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="3" width="9" height="10" rx="1.5" stroke={color} strokeWidth="1.2" fill="none" />
      <path d="M11 6l3-2v8l-3-2V6Z" stroke={color} strokeWidth="1.2" fill="none" strokeLinejoin="round" />
    </svg>
  )
}

function AudioIcon({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M6 3v10M4 5v6M2 7v2M8 2v12M10 4v8M12 6v4M14 7v2" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

function PdfIcon({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M4 2h5.5L12 4.5V14H4V2Z" stroke={color} strokeWidth="1.2" fill="none" strokeLinejoin="round" />
      <path d="M9.5 2v2.5H12" stroke={color} strokeWidth="1.2" fill="none" />
      <text x="5" y="11" fontSize="4" fill={color} fontWeight="bold">PDF</text>
    </svg>
  )
}

function ArchiveIcon({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="2" width="12" height="12" rx="2" stroke={color} strokeWidth="1.2" fill="none" />
      <path d="M6 2v12M6 5h4M6 8h4" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M7 2v7M4 6.5L7 9.5l3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2 11h10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

export function FileGrid({ files, loading, currentPath: _currentPath, onNavigate, onDownload }: Props) {
  const [hovered, setHovered] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const sorted = [...files].sort((a, b) => {
    if (a.type === b.type) return a.name.localeCompare(b.name)
    return a.type === 'dir' ? -1 : 1
  })

  function toggleSelect(path: string, e: React.MouseEvent) {
    e.stopPropagation()
    setSelected(prev => {
      const next = new Set(prev)
      next.has(path) ? next.delete(path) : next.add(path)
      return next
    })
  }

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3a3a3a', fontSize: '13px' }}>
        Loading...
      </div>
    )
  }

  if (files.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3a3a3a', fontSize: '13px' }}>
        Empty folder
      </div>
    )
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #1E1E1E', color: '#3a3a3a', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            <th style={{ padding: '6px 16px', textAlign: 'left', fontWeight: 500, width: '40%' }}>Name</th>
            <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 500, width: '80px' }}>Size</th>
            <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 500 }}>Modified</th>
            <th style={{ padding: '6px 16px', width: '40px' }} />
          </tr>
        </thead>
        <tbody>
          {sorted.map(file => {
            const isHovered = hovered === file.path
            const isSelected = selected.has(file.path)
            return (
              <tr
                key={file.path}
                onClick={() => file.type === 'dir' ? onNavigate(file.path) : onDownload(file)}
                onMouseEnter={() => setHovered(file.path)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  borderBottom: '1px solid #1E1E1E',
                  cursor: 'pointer',
                  background: isSelected ? '#00D84A10' : isHovered ? '#141414' : 'transparent',
                  transition: 'background 80ms',
                }}
              >
                <td style={{ padding: '7px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span onClick={e => file.type === 'file' && toggleSelect(file.path, e)}>
                      {file.type === 'dir' ? <FolderIcon /> : <FileIcon mimeType={file.mimeType} />}
                    </span>
                    <span style={{
                      color: file.type === 'dir' ? '#F5F5F5' : '#D0D0D0',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: '280px',
                    }}>
                      {file.name}
                    </span>
                  </div>
                </td>
                <td style={{ padding: '7px 8px', textAlign: 'right', color: '#6B6B6B', whiteSpace: 'nowrap' }}>
                  {file.type === 'file' ? formatSize(file.size) : '—'}
                </td>
                <td style={{ padding: '7px 8px', color: '#6B6B6B', whiteSpace: 'nowrap' }}>
                  {formatDate(file.modified)}
                </td>
                <td style={{ padding: '7px 16px', textAlign: 'center' }}>
                  {file.type === 'file' && (
                    <button
                      onClick={e => { e.stopPropagation(); onDownload(file) }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: isHovered ? '#00D84A' : 'transparent',
                        cursor: 'pointer',
                        padding: '2px',
                        transition: 'color 100ms',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                    >
                      <DownloadIcon />
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
