import React, { useState, useEffect, useRef, useCallback } from 'react'
import type { FileNode } from '@droidwire/shared'
import type { Theme } from '../lib/theme'
import { useTheme } from '../lib/ThemeContext'
import { formatSize, formatDate } from '../lib/format'

type SortField = 'name' | 'size' | 'date' | 'type'
type SortDir = 'asc' | 'desc'

// Limit concurrent adb thumbnail pulls to avoid EAGAIN on large folders
let _thumbActive = 0
const _thumbQueue: Array<() => void> = []
const THUMB_MAX = 4

function thumbAcquire(): Promise<void> {
  return new Promise(resolve => {
    if (_thumbActive < THUMB_MAX) { _thumbActive++; resolve() }
    else _thumbQueue.push(() => { _thumbActive++; resolve() })
  })
}
function thumbRelease() {
  _thumbActive--
  _thumbQueue.shift()?.()
}

interface Props {
  files: FileNode[]
  loading: boolean
  currentPath: string
  selectedPaths: Set<string>
  cutPaths?: Set<string>
  viewMode: 'list' | 'grid'
  sortField: SortField
  sortDir: SortDir
  onSort: (field: SortField) => void
  onNavigate: (path: string) => void
  onSelect: (file: FileNode, multi: boolean) => void
  onRangeSelect: (files: FileNode[]) => void
  onDownload: (file: FileNode) => void
  onContextMenu: (file: FileNode, x: number, y: number) => void
  onDeselectAll: () => void
  onGoUp: () => void
  onSelectAll: () => void
  onDeleteSelected: () => void
  onRefresh: () => void
  onRenameInline: (file: FileNode, newName: string) => void
  onPreview?: (file: FileNode) => void
  onNativeDrag?: (file: FileNode) => void
  onInternalDragStart?: (file: FileNode) => void
  onInternalDragEnd?: () => void
}

function FolderIconSm({ selected, theme }: { selected: boolean; theme: Theme }) {
  const back = selected ? '#1A5EA8' : '#1E5EA0'
  const front = selected ? theme.accent : '#5BBDF8'
  return (
    <svg width="18" height="15" viewBox="0 0 36 30" fill="none">
      {/* Back plate: tab + body as single shape */}
      <path d="M3.5 4 Q1.5 4 1.5 6.5 L1.5 27 Q1.5 29.5 4 29.5 L32 29.5 Q34.5 29.5 34.5 27 L34.5 10 Q34.5 7.5 32 7.5 L15 7.5 L15 4 Z" fill={back} />
      {/* Front face */}
      <rect x="1.5" y="10" width="33" height="19.5" rx="3" fill={front} />
      {/* Top gloss */}
      <path d="M4.5 10 Q1.5 10 1.5 13 L1.5 14.5 L34.5 14.5 L34.5 13 Q34.5 10 31.5 10 Z" fill="rgba(255,255,255,0.22)" />
    </svg>
  )
}

function FolderIconLg({ selected, theme }: { selected: boolean; theme: Theme }) {
  const back = selected ? '#1A5EA8' : '#1E5EA0'
  const front = selected ? theme.accent : '#5BBDF8'
  return (
    <svg width="58" height="48" viewBox="0 0 48 40" fill="none">
      {/* Back plate: tab + body as single shape */}
      <path d="M5 6 Q2 6 2 9 L2 36 Q2 40 6 40 L42 40 Q46 40 46 36 L46 13 Q46 9 42 9 L20 9 L20 6 Z" fill={back} />
      {/* Front face */}
      <rect x="2" y="13" width="44" height="27" rx="4.5" fill={front} />
      {/* Top gloss */}
      <path d="M6.5 13 Q2 13 2 17 L2 18.5 L46 18.5 L46 17 Q46 13 41.5 13 Z" fill="rgba(255,255,255,0.23)" />
    </svg>
  )
}

function fileExt(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  if (dot < 0 || dot === fileName.length - 1) return ''
  return fileName.slice(dot + 1).toLowerCase()
}

function fileLabel(fileName: string): string {
  return fileExt(fileName).toUpperCase().slice(0, 4)
}

function FileIconSm({ mimeType, fileName, theme }: { mimeType: string | null; fileName: string; theme: Theme }) {
  const m = mimeType ?? ''
  const ext = fileExt(fileName)
  if (m.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'heic'].includes(ext))
    return <ImageIcon size={16} color={theme.accent} />
  if (m.startsWith('video/') || ['mp4', 'mkv', 'mov', 'avi', 'webm', 'm4v'].includes(ext))
    return <VideoIcon size={16} color={theme.warning} />
  if (m.startsWith('audio/') || ['mp3', 'aac', 'flac', 'wav', 'ogg', 'm4a'].includes(ext))
    return <AudioIcon size={16} color="#5E9CF5" />
  if (m === 'application/pdf' || ext === 'pdf')
    return <DocIcon size={16} color={theme.error} label="PDF" />
  if (m === 'application/vnd.android.package-archive' || ext === 'apk')
    return <DocIcon size={16} color={theme.accent} label="APK" />
  if (m.includes('zip') || m.includes('rar') || m.includes('7z') || m.includes('tar') || m.includes('gzip') || ['zip', 'rar', '7z', 'tar', 'gz'].includes(ext))
    return <ArchiveIcon size={16} color={theme.textMuted} />
  if (m.startsWith('text/') || ['html', 'htm', 'css', 'js', 'ts', 'json', 'xml', 'md', 'csv', 'sh', 'py', 'rb', 'c', 'cpp', 'h', 'kt', 'yaml', 'yml', 'txt'].includes(ext))
    return <CodeIcon size={16} color="#9E8CF5" />
  return <DocIcon size={16} color={theme.textMuted} label={fileLabel(fileName)} />
}

function FileIconLg({ mimeType, fileName, theme }: { mimeType: string | null; fileName: string; theme: Theme }) {
  const m = mimeType ?? ''
  const ext = fileExt(fileName)
  if (m.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'heic'].includes(ext))
    return <ImageIcon size={46} color={theme.accent} />
  if (m.startsWith('video/') || ['mp4', 'mkv', 'mov', 'avi', 'webm', 'm4v'].includes(ext))
    return <VideoIcon size={46} color={theme.warning} />
  if (m.startsWith('audio/') || ['mp3', 'aac', 'flac', 'wav', 'ogg', 'm4a'].includes(ext))
    return <AudioIcon size={46} color="#5E9CF5" />
  if (m === 'application/pdf' || ext === 'pdf')
    return <DocIcon size={46} color={theme.error} label="PDF" />
  if (m === 'application/vnd.android.package-archive' || ext === 'apk')
    return <DocIcon size={46} color={theme.accent} label="APK" />
  if (m.includes('zip') || m.includes('rar') || m.includes('7z') || m.includes('tar') || m.includes('gzip') || ['zip', 'rar', '7z', 'tar', 'gz'].includes(ext))
    return <ArchiveIcon size={46} color={theme.textMuted} />
  if (m.startsWith('text/') || ['html', 'htm', 'css', 'js', 'ts', 'json', 'xml', 'md', 'csv', 'sh', 'py', 'rb', 'c', 'cpp', 'h', 'kt', 'yaml', 'yml', 'txt'].includes(ext))
    return <CodeIcon size={46} color="#9E8CF5" label={fileLabel(fileName)} />
  return <DocIcon size={46} color={theme.textMuted} label={fileLabel(fileName)} />
}

function DocIcon({ size, color, label }: { size: number; color: string; label: string }) {
  const lg = size > 20
  const fontSize = lg ? 7 : 5.5
  const textY = lg ? 20.5 : 20
  return (
    <svg width={size} height={size} viewBox="0 0 24 28" fill="none">
      <path d="M2 3C2 1.9 2.9 1 4 1H15.5L22 7.5V25C22 26.1 21.1 27 20 27H4C2.9 27 2 26.1 2 25Z"
        fill={color} fillOpacity="0.18" />
      <path d="M2 3C2 1.9 2.9 1 4 1H15.5L22 7.5V25C22 26.1 21.1 27 20 27H4C2.9 27 2 26.1 2 25Z"
        stroke={color} strokeWidth="1.1" strokeLinejoin="round" fill="none" />
      <path d="M15.5 1 L15.5 7.5 L22 7.5" stroke={color} strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
      {label ? (
        <text x="12" y={textY} fontSize={fontSize} fill={color} fontWeight="800"
          fontFamily="system-ui,-apple-system,sans-serif" textAnchor="middle" dominantBaseline="auto"
          letterSpacing="-0.3">
          {label}
        </text>
      ) : null}
    </svg>
  )
}

function CodeIcon({ size, color, label }: { size: number; color: string; label?: string }) {
  const lg = size > 20
  const fontSize = lg ? 7 : 5.5
  const textY = lg ? 20.5 : 20
  return (
    <svg width={size} height={size} viewBox="0 0 24 28" fill="none">
      <path d="M2 3C2 1.9 2.9 1 4 1H15.5L22 7.5V25C22 26.1 21.1 27 20 27H4C2.9 27 2 26.1 2 25Z"
        fill={color} fillOpacity="0.18" />
      <path d="M2 3C2 1.9 2.9 1 4 1H15.5L22 7.5V25C22 26.1 21.1 27 20 27H4C2.9 27 2 26.1 2 25Z"
        stroke={color} strokeWidth="1.1" strokeLinejoin="round" fill="none" />
      <path d="M15.5 1 L15.5 7.5 L22 7.5" stroke={color} strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
      {label && lg ? (
        <text x="12" y={textY} fontSize={fontSize} fill={color} fontWeight="800"
          fontFamily="system-ui,-apple-system,sans-serif" textAnchor="middle" dominantBaseline="auto"
          letterSpacing="-0.3">
          {label}
        </text>
      ) : (
        <>
          <path d="M8 14.5l-2.5 2L8 18.5" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M16 14.5l2.5 2L16 18.5" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M13.5 12l-3 9" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
        </>
      )}
    </svg>
  )
}

function ImageIcon({ size, color }: { size: number; color: string }) {
  const lg = size > 20
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="1.5" y="1.5" width="21" height="21" rx="3.5" fill={color} fillOpacity="0.15" />
      <rect x="1.5" y="1.5" width="21" height="21" rx="3.5" stroke={color} strokeWidth="1.1" />
      <circle cx="8" cy="8.5" r={lg ? 2.2 : 1.8} fill={color} fillOpacity="0.9" />
      <path d="M2 17 L7.5 11.5 L11.5 15.5 L15 12.5 L22 17.5"
        stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" fill={color} fillOpacity="0.15" />
    </svg>
  )
}

function VideoIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="1.5" y="4.5" width="14" height="15" rx="2.5" fill={color} fillOpacity="0.18" stroke={color} strokeWidth="1.1" />
      <path d="M15.5 10 L21.5 7 L21.5 17 L15.5 14 Z" fill={color} fillOpacity="0.8" stroke={color} strokeWidth="1.1" strokeLinejoin="round" />
      <path d="M5.5 10.5 L5.5 13.5 M8.5 9 L8.5 15" stroke={color} strokeWidth="1.3" strokeLinecap="round" opacity="0.7" />
    </svg>
  )
}

function AudioIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="1.5" y="1.5" width="21" height="21" rx="3.5" fill={color} fillOpacity="0.15" stroke={color} strokeWidth="1.1" />
      <circle cx="12" cy="12" r="5" stroke={color} strokeWidth="1.1" fill={color} fillOpacity="0.1" />
      <circle cx="12" cy="12" r="1.8" fill={color} />
      <path d="M12 7 A5 5 0 0 1 17 12" stroke={color} strokeWidth="1.2" strokeLinecap="round" fill="none" />
    </svg>
  )
}

function ArchiveIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 28" fill="none">
      <path d="M2 3C2 1.9 2.9 1 4 1H15.5L22 7.5V25C22 26.1 21.1 27 20 27H4C2.9 27 2 26.1 2 25Z"
        fill={color} fillOpacity="0.15" />
      <path d="M2 3C2 1.9 2.9 1 4 1H15.5L22 7.5V25C22 26.1 21.1 27 20 27H4C2.9 27 2 26.1 2 25Z"
        stroke={color} strokeWidth="1.1" strokeLinejoin="round" fill="none" />
      <path d="M15.5 1 L15.5 7.5 L22 7.5" stroke={color} strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="9" y="10" width="6" height="2.5" rx="0.8" fill={color} fillOpacity="0.7" />
      <rect x="9" y="14" width="6" height="2.5" rx="0.8" fill={color} fillOpacity="0.5" />
      <rect x="9" y="18" width="6" height="2.5" rx="0.8" fill={color} fillOpacity="0.3" />
      <circle cx="12" cy="11.25" r="0.8" fill={color} />
      <circle cx="12" cy="15.25" r="0.8" fill={color} fillOpacity="0.6" />
    </svg>
  )
}

function ThumbnailLg({ file, theme }: { file: FileNode; theme: Theme }) {
  const [src, setSrc] = useState<string | null>(null)
  const eligible = !!file.mimeType?.startsWith('image/') && file.size <= 5 * 1024 * 1024

  useEffect(() => {
    let cancelled = false
    if (!eligible) return
    let acquired = false
    thumbAcquire().then(() => {
      acquired = true
      if (cancelled) { thumbRelease(); return }
      return window.droidwire.previewFile(file.path, file.name)
        .then(r => { if (!cancelled && r) setSrc(r) })
        .catch(() => {})
        .finally(() => thumbRelease())
    })
    return () => {
      cancelled = true
      if (!acquired) {
        // Remove from queue — replace with a no-op that immediately releases
        const idx = _thumbQueue.length - 1
        if (idx >= 0) _thumbQueue.splice(idx, 1, () => { _thumbActive++; thumbRelease() })
      }
    }
  }, [file.path, file.name, eligible])

  if (src) return <img src={src} alt={file.name} style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: '6px' }} />
  return <FileIconLg mimeType={file.mimeType} fileName={file.name} theme={theme} />
}

function SortHeader({ field, label, sortField, sortDir, onSort, style }: {
  field: SortField; label: string; sortField: SortField; sortDir: SortDir
  onSort: (f: SortField) => void; style?: React.CSSProperties
}) {
  const { theme } = useTheme()
  const active = sortField === field
  return (
    <th
      onClick={() => onSort(field)}
      style={{ cursor: 'pointer', userSelect: 'none', color: active ? theme.textPrimary : theme.textMuted, fontWeight: active ? 600 : 500, ...style }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
        {label}
        {active && <span style={{ fontSize: '10px', color: theme.accent }}>{sortDir === 'asc' ? '↑' : '↓'}</span>}
      </div>
    </th>
  )
}

function InlineRename({ file, onConfirm, onCancel, theme, listMode }: {
  file: FileNode; onConfirm: (name: string) => void; onCancel: () => void; theme: Theme; listMode: boolean
}) {
  const [value, setValue] = useState(file.name)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!inputRef.current) return
    inputRef.current.focus()
    const dot = file.name.lastIndexOf('.')
    const end = dot > 0 && file.type === 'file' ? dot : file.name.length
    inputRef.current.setSelectionRange(0, end)
  }, [file.name, file.type])

  const confirm = () => {
    const t = value.trim()
    if (t && t !== file.name) onConfirm(t)
    else onCancel()
  }

  return (
    <input
      ref={inputRef}
      value={value}
      onChange={e => setValue(e.target.value)}
      onBlur={confirm}
      onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') confirm(); if (e.key === 'Escape') onCancel() }}
      onClick={e => e.stopPropagation()}
      style={{
        background: theme.bg,
        border: `1.5px solid ${theme.borderFocus}`,
        borderRadius: '4px',
        color: theme.textPrimary,
        fontSize: listMode ? '13px' : '12px',
        fontWeight: 500,
        padding: listMode ? '1px 5px' : '2px 6px',
        outline: 'none',
        width: '100%',
        minWidth: 0,
        textAlign: listMode ? 'left' : 'center',
        boxShadow: `0 0 0 3px ${theme.borderFocus}30`,
      }}
    />
  )
}

const GRID_H = 124   // height of each grid cell row in px
const GRID_MIN_W = 110
const LIST_H = 36    // height of each list row in px
const OVERSCAN = 8   // buffer rows — 8*124=992px grid, 8*36=288px list

export function FileGrid({
  files, loading, currentPath: _currentPath, selectedPaths, cutPaths, viewMode,
  sortField, sortDir, onSort,
  onNavigate, onSelect, onRangeSelect, onDownload, onContextMenu,
  onDeselectAll, onGoUp, onSelectAll, onDeleteSelected, onRefresh, onRenameInline, onPreview, onNativeDrag: _onNativeDrag,
  onInternalDragStart, onInternalDragEnd,
}: Props) {
  const { theme } = useTheme()
  const [hovered, setHovered] = useState<string | null>(null)
  const [cursorIndex, setCursorIndex] = useState(-1)
  const [editingPath, setEditingPath] = useState<string | null>(null)
  const lastClickIndexRef = useRef(-1)
  const shiftAnchorRef = useRef(-1)
  const renameTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Scroll position and viewport live in refs — never cause re-renders
  const scrollTopRef = useRef(0)
  const viewHRef = useRef(700)
  const viewWRef = useRef(900)

  // Visible slice — state updated only when row window actually changes
  const [slice, setSlice] = useState({ s: 0, e: 80 })

  const recomputeSlice = useCallback(() => {
    const st = scrollTopRef.current
    const vh = viewHRef.current
    const vw = viewWRef.current
    let s: number, e: number
    if (viewMode === 'grid') {
      const cols = Math.max(1, Math.floor((vw - 20) / GRID_MIN_W))
      const totalRows = Math.ceil(files.length / cols)
      const rowS = Math.max(0, Math.floor(st / GRID_H) - OVERSCAN)
      const rowE = Math.min(totalRows, Math.ceil((st + vh) / GRID_H) + OVERSCAN)
      s = rowS * cols
      e = Math.min(files.length, rowE * cols)
    } else {
      s = Math.max(0, Math.floor(st / LIST_H) - OVERSCAN)
      e = Math.min(files.length, Math.ceil((st + vh) / LIST_H) + OVERSCAN)
    }
    setSlice(prev => (prev.s === s && prev.e === e) ? prev : { s, e })
  }, [files.length, viewMode])

  // Reset on folder/mode change
  useEffect(() => {
    scrollTopRef.current = 0
    if (scrollRef.current) scrollRef.current.scrollTop = 0
    recomputeSlice()
  }, [files, viewMode, recomputeSlice])

  // Measure container
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        viewHRef.current = entry.contentRect.height
        viewWRef.current = entry.contentRect.width
        recomputeSlice()
      }
    })
    ro.observe(el)
    viewHRef.current = el.clientHeight
    viewWRef.current = el.clientWidth
    recomputeSlice()
    return () => ro.disconnect()
  }, [viewMode, recomputeSlice])

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    scrollTopRef.current = e.currentTarget.scrollTop
    recomputeSlice()
  }, [recomputeSlice])

  const clearRenameTimer = () => {
    if (renameTimerRef.current) { clearTimeout(renameTimerRef.current); renameTimerRef.current = null }
  }

  useEffect(() => { setCursorIndex(-1); lastClickIndexRef.current = -1; clearRenameTimer() }, [files])
  useEffect(() => () => clearRenameTimer(), [])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
      const meta = e.metaKey || e.ctrlKey

      if (e.key === 'Escape') { onDeselectAll(); setCursorIndex(-1); shiftAnchorRef.current = -1; clearRenameTimer() }
      else if (e.key === 'Backspace' && !meta) { e.preventDefault(); onGoUp() }
      else if (e.key === 'ArrowDown' && !meta) {
        e.preventDefault()
        const next = Math.min(cursorIndex + 1, files.length - 1)
        if (e.shiftKey) {
          if (shiftAnchorRef.current === -1) shiftAnchorRef.current = Math.max(cursorIndex, 0)
          onRangeSelect(files.slice(Math.min(shiftAnchorRef.current, next), Math.max(shiftAnchorRef.current, next) + 1))
        } else { shiftAnchorRef.current = -1 }
        setCursorIndex(next)
      } else if (e.key === 'ArrowUp' && !meta) {
        e.preventDefault()
        const prev = Math.max(cursorIndex - 1, 0)
        if (e.shiftKey) {
          if (shiftAnchorRef.current === -1) shiftAnchorRef.current = Math.max(cursorIndex, 0)
          onRangeSelect(files.slice(Math.min(shiftAnchorRef.current, prev), Math.max(shiftAnchorRef.current, prev) + 1))
        } else { shiftAnchorRef.current = -1 }
        setCursorIndex(prev)
      } else if (e.key === 'ArrowDown' && meta) {
        e.preventDefault()
        const active = cursorIndex >= 0 ? files[cursorIndex]
          : selectedPaths.size === 1 ? files.find(f => f.path === [...selectedPaths][0]) ?? null : null
        if (active) { if (active.type === 'dir') onNavigate(active.path); else if (onPreview) onPreview(active) }
      } else if (e.key === 'ArrowUp' && meta) {
        e.preventDefault(); onGoUp()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const active = cursorIndex >= 0 ? files[cursorIndex]
          : selectedPaths.size === 1 ? files.find(f => f.path === [...selectedPaths][0]) ?? null : null
        if (active) {
          if (active.type === 'dir') onNavigate(active.path)
          else setEditingPath(active.path)
        }
      } else if (e.key === ' ') {
        const path = [...selectedPaths][0]
        const file = path ? files.find(f => f.path === path) : null
        if (file?.type === 'file' && onPreview) { e.preventDefault(); onPreview(file) }
      } else if (meta && e.key.toLowerCase() === 'a') { e.preventDefault(); onSelectAll() }
      else if (meta && e.key === 'Backspace') { if (selectedPaths.size > 0) { e.preventDefault(); onDeleteSelected() } }
      else if (meta && e.key.toLowerCase() === 'r') { e.preventDefault(); onRefresh() }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [files, selectedPaths, cursorIndex, editingPath, onDeselectAll, onGoUp, onSelectAll,
      onDeleteSelected, onRefresh, onRangeSelect, onPreview, onNavigate, onSelect])

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.textMuted, fontSize: '14px' }}>
      Loading...
    </div>
  )

  if (files.length === 0) return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', color: theme.textMuted }}>
      <FolderIconLg selected={false} theme={theme} />
      <span style={{ fontSize: '13px' }}>This folder is empty</span>
    </div>
  )

  if (viewMode === 'grid') {
    const cols = Math.max(1, Math.floor((viewWRef.current - 20) / GRID_MIN_W))
    const totalRows = Math.ceil(files.length / cols)
    const rowS = Math.floor(slice.s / cols)
    const rowE = Math.ceil(slice.e / cols)
    const topPad = rowS * GRID_H
    const botPad = Math.max(0, totalRows - rowE) * GRID_H

    return (
      <div
        ref={scrollRef}
        style={{ flex: 1, overflowY: 'auto' }}
        onScroll={handleScroll}
        onClick={(e) => { if (e.target === e.currentTarget) { onDeselectAll(); clearRenameTimer() } }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '2px', padding: '10px' }}>
          {topPad > 0 && <div style={{ height: topPad, gridColumn: '1 / -1' }} />}
          {files.slice(slice.s, slice.e).map((file, relIdx) => {
            const idx = slice.s + relIdx
            const isSelected = selectedPaths.has(file.path)
            const isCut = cutPaths?.has(file.path)
            const isEditing = editingPath === file.path
            const isHov = hovered === file.path

            return (
              <div
                key={file.path}
                draggable={file.type === 'file'}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'copyMove'
                  e.dataTransfer.setData('application/droidwire-file', JSON.stringify(file))
                  window.droidwire.storeDragNode({ node: file, ts: Date.now() }).catch(() => {})
                  onInternalDragStart?.(file)
                }}
                onDragEnd={() => { onInternalDragEnd?.() }}
                onMouseEnter={() => setHovered(file.path)}
                onMouseLeave={() => setHovered(null)}
                onClick={(e) => {
                  e.stopPropagation()
                  clearRenameTimer()
                  if (e.shiftKey && lastClickIndexRef.current !== -1) {
                    const lo = Math.min(lastClickIndexRef.current, idx)
                    const hi = Math.max(lastClickIndexRef.current, idx)
                    onRangeSelect(files.slice(lo, hi + 1))
                  } else if (e.metaKey || e.ctrlKey) {
                    onSelect(file, true)
                    lastClickIndexRef.current = idx
                  } else {
                    if (isSelected && selectedPaths.size === 1 && !isEditing) {
                      renameTimerRef.current = setTimeout(() => setEditingPath(file.path), 450)
                    } else {
                      onSelect(file, false)
                      lastClickIndexRef.current = idx
                    }
                  }
                  setCursorIndex(idx)
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation()
                  clearRenameTimer()
                  if (file.type === 'dir') onNavigate(file.path)
                  else if (onPreview) onPreview(file)
                }}
                onContextMenu={(e) => { e.preventDefault(); clearRenameTimer(); onContextMenu(file, e.clientX, e.clientY) }}
                style={{
                  borderRadius: '7px',
                  padding: '10px 6px 8px',
                  cursor: 'default',

                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
                  background: isSelected
                    ? `${theme.accent}22`
                    : isHov ? theme.surfaceHover : 'transparent',
                  outline: isSelected ? `1.5px solid ${theme.accent}55` : '1.5px solid transparent',
                  opacity: isCut ? 0.45 : 1,
                  userSelect: 'none',
                  transition: 'background 60ms',
                }}
              >
                <div style={{ height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {file.type === 'dir' ? (
                    <FolderIconLg selected={isSelected} theme={theme} />
                  ) : file.mimeType?.startsWith('image/') ? (
                    <ThumbnailLg file={file} theme={theme} />
                  ) : (
                    <FileIconLg mimeType={file.mimeType} fileName={file.name} theme={theme} />
                  )}
                </div>
                {isEditing ? (
                  <InlineRename
                    file={file} theme={theme} listMode={false}
                    onConfirm={(name) => { setEditingPath(null); onRenameInline(file, name) }}
                    onCancel={() => setEditingPath(null)}
                  />
                ) : (
                  <span style={{
                    fontSize: '11px', fontWeight: 500,
                    color: isSelected ? theme.textPrimary : theme.textSecondary,
                    textAlign: 'center', width: '100%',
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                    overflow: 'hidden', wordBreak: 'break-all', lineHeight: 1.35,
                  }}>
                    {file.name}
                  </span>
                )}
              </div>
            )
          })}
          {botPad > 0 && <div style={{ height: botPad, gridColumn: '1 / -1' }} />}
        </div>
      </div>
    )
  }

  // List view
  const listTopPad = slice.s * LIST_H
  const listBotPad = Math.max(0, files.length - slice.e) * LIST_H

  return (
    <div
      ref={scrollRef}
      style={{ flex: 1, overflowY: 'auto' }}
      onScroll={handleScroll}
      onClick={(e) => { if (e.target === e.currentTarget) { onDeselectAll(); clearRenameTimer() } }}
    >
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: '50%' }} />
          <col style={{ width: '80px' }} />
          <col />
          <col style={{ width: '64px' }} />
          <col style={{ width: '32px' }} />
        </colgroup>
        <thead>
          <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
            <SortHeader field="name" label="Name" sortField={sortField} sortDir={sortDir} onSort={onSort}
              style={{ padding: '7px 12px', textAlign: 'left', fontSize: '12px' }} />
            <SortHeader field="size" label="Size" sortField={sortField} sortDir={sortDir} onSort={onSort}
              style={{ padding: '7px 8px', textAlign: 'right', fontSize: '12px' }} />
            <SortHeader field="date" label="Date Modified" sortField={sortField} sortDir={sortDir} onSort={onSort}
              style={{ padding: '7px 8px', textAlign: 'left', fontSize: '12px' }} />
            <SortHeader field="type" label="Kind" sortField={sortField} sortDir={sortDir} onSort={onSort}
              style={{ padding: '7px 8px', textAlign: 'left', fontSize: '12px' }} />
            <th />
          </tr>
        </thead>
        <tbody>
          {listTopPad > 0 && <tr><td colSpan={5} style={{ height: listTopPad, padding: 0 }} /></tr>}
          {files.slice(slice.s, slice.e).map((file, relIdx) => {
            const idx = slice.s + relIdx
            const isHovered = hovered === file.path
            const isSelected = selectedPaths.has(file.path)
            const isCursor = cursorIndex === idx
            const isCut = cutPaths?.has(file.path)
            const isEditing = editingPath === file.path
            const ext = file.name.includes('.') ? file.name.split('.').pop()?.toUpperCase() ?? '' : ''

            return (
              <tr
                key={file.path}
                draggable={file.type === 'file'}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'copyMove'
                  e.dataTransfer.setData('application/droidwire-file', JSON.stringify(file))
                  window.droidwire.storeDragNode({ node: file, ts: Date.now() }).catch(() => {})
                  onInternalDragStart?.(file)
                }}
                onDragEnd={() => { onInternalDragEnd?.() }}
                onClick={(e) => {
                  if (isEditing) return
                  clearRenameTimer()
                  if (e.shiftKey && lastClickIndexRef.current !== -1) {
                    const lo = Math.min(lastClickIndexRef.current, idx)
                    const hi = Math.max(lastClickIndexRef.current, idx)
                    onRangeSelect(files.slice(lo, hi + 1))
                  } else if (e.metaKey || e.ctrlKey) {
                    onSelect(file, true)
                    lastClickIndexRef.current = idx
                  } else {
                    if (isSelected && selectedPaths.size === 1) {
                      renameTimerRef.current = setTimeout(() => setEditingPath(file.path), 450)
                    } else {
                      onSelect(file, false)
                      lastClickIndexRef.current = idx
                    }
                  }
                  setCursorIndex(idx)
                }}
                onDoubleClick={(e) => {
                  e.preventDefault()
                  clearRenameTimer()
                  if (file.type === 'dir') onNavigate(file.path)
                  else if (onPreview) onPreview(file)
                }}
                onContextMenu={(e) => { e.preventDefault(); clearRenameTimer(); onContextMenu(file, e.clientX, e.clientY) }}
                onMouseEnter={() => setHovered(file.path)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  cursor: 'default',
                  background: isSelected
                    ? `${theme.accent}22`
                    : isCursor ? theme.surfaceHover
                    : isHovered ? theme.surfaceHover
                    : 'transparent',
                  borderBottom: `1px solid ${isSelected ? 'transparent' : theme.border}`,
                  outline: isSelected ? `1px solid ${theme.accent}50` : 'none',
                  outlineOffset: '-1px',
                  opacity: isCut ? 0.45 : 1,
                  userSelect: 'none',
                }}
              >
                <td style={{ padding: '5px 12px', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0 }}>
                    <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                      {file.type === 'dir'
                        ? <FolderIconSm selected={isSelected} theme={theme} />
                        : <FileIconSm mimeType={file.mimeType} fileName={file.name} theme={theme} />}
                    </span>
                    {isEditing ? (
                      <InlineRename
                        file={file} theme={theme} listMode={true}
                        onConfirm={(name) => { setEditingPath(null); onRenameInline(file, name) }}
                        onCancel={() => setEditingPath(null)}
                      />
                    ) : (
                      <span style={{
                        fontSize: '13px', fontWeight: 400,
                        color: isSelected ? theme.textPrimary : theme.textPrimary,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {file.name}
                      </span>
                    )}
                  </div>
                </td>
                <td style={{ padding: '5px 8px', textAlign: 'right', fontSize: '12px', color: theme.textSecondary, whiteSpace: 'nowrap' }}>
                  {file.type === 'file' ? formatSize(file.size) : '—'}
                </td>
                <td style={{ padding: '5px 8px', fontSize: '12px', color: theme.textSecondary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {formatDate(file.modified)}
                </td>
                <td style={{ padding: '5px 8px', fontSize: '12px', color: theme.textMuted, whiteSpace: 'nowrap' }}>
                  {file.type === 'dir' ? 'Folder' : ext || 'File'}
                </td>
                <td style={{ padding: '5px 8px', textAlign: 'center' }}>
                  {file.type === 'file' && !isEditing && (
                    <button
                      onClick={e => { e.stopPropagation(); clearRenameTimer(); onDownload(file) }}
                      style={{
                        background: 'none', border: 'none',
                        color: isHovered || isSelected ? theme.accent : 'transparent',
                        cursor: 'pointer', padding: '2px',
                        transition: 'color 80ms', display: 'flex', alignItems: 'center',
                      }}
                    >
                      <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                        <path d="M7 2v7M4 6.5L7 9.5l3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M2 11h10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                      </svg>
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
          {listBotPad > 0 && <tr><td colSpan={5} style={{ height: listBotPad, padding: 0 }} /></tr>}
        </tbody>
      </table>
    </div>
  )
}
