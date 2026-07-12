import { useState, useEffect, useRef } from 'react'
import type { FileNode } from '@droidwire/shared'
import type { Bookmark } from '../hooks/useBookmarks'
import { useTheme } from '../lib/ThemeContext'

const PINNED_DIRS = ['DCIM', 'Download', 'Documents', 'Music', 'Pictures', 'Movies', 'WhatsApp']

interface Props {
  currentPath: string
  rootDirs: FileNode[]
  onNavigate: (path: string) => void
  onOpenInNewTab?: (path: string) => void
  bookmarks: Bookmark[]
  onRemoveBookmark: (path: string) => void
  recentPaths: string[]
  onDropOnFolder?: (path: string) => void
}

const PATH_LABELS: Record<string, string> = {
  '/storage/emulated/0': 'Internal Storage',
  '/storage/emulated': 'Internal Storage',
  '/sdcard': 'Internal Storage',
}

function pathLabel(p: string): string {
  return PATH_LABELS[p] ?? (p.split('/').filter(Boolean).pop() ?? p)
}

function FolderIcon({ active }: { active?: boolean }) {
  const back = active ? '#1A5EA8' : '#1E5EA0'
  const front = active ? '#5EC9FF' : '#5BBDF8'
  return (
    <svg width="16" height="14" viewBox="0 0 36 30" fill="none" style={{ flexShrink: 0 }}>
      <path d="M3.5 4 Q1.5 4 1.5 6.5 L1.5 27 Q1.5 29.5 4 29.5 L32 29.5 Q34.5 29.5 34.5 27 L34.5 10 Q34.5 7.5 32 7.5 L15 7.5 L15 4 Z" fill={back} />
      <rect x="1.5" y="10" width="33" height="19.5" rx="3" fill={front} />
      <path d="M4.5 10 Q1.5 10 1.5 13 L1.5 14.5 L34.5 14.5 L34.5 13 Q34.5 10 31.5 10 Z" fill="rgba(255,255,255,0.22)" />
    </svg>
  )
}

interface SidebarMenu {
  x: number
  y: number
  path: string
  name: string
}

function SidebarContextMenu({ menu, onNavigate, onOpenInNewTab, onClose }: {
  menu: SidebarMenu
  onNavigate: (path: string) => void
  onOpenInNewTab?: (path: string) => void
  onClose: () => void
}) {
  const { theme } = useTheme()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', esc)
    // Click on another app / desktop
    window.addEventListener('blur', onClose)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', esc)
      window.removeEventListener('blur', onClose)
    }
  }, [onClose])

  // Clamp to viewport
  const x = Math.min(menu.x, window.innerWidth - 180)
  const y = Math.min(menu.y, window.innerHeight - 120)

  const items: { label: string; action: () => void; danger?: boolean }[] = [
    { label: 'Open', action: () => { onNavigate(menu.path); onClose() } },
    ...(onOpenInNewTab ? [{ label: 'Open in New Tab', action: () => { onOpenInNewTab(menu.path); onClose() } }] : []),
    { label: 'Copy Path', action: () => { navigator.clipboard.writeText(menu.path).catch(() => {}); onClose() } },
  ]

  const itemStyle: React.CSSProperties = {
    padding: '6px 14px',
    fontSize: '13px',
    cursor: 'pointer',
    userSelect: 'none',
    borderRadius: '5px',
    color: theme.textPrimary,
    transition: 'background 60ms',
  }

  return (
    <>
    {/* Neutralize the titlebar's native drag region so clicks there close the menu */}
    <div
      onMouseDown={onClose}
      onContextMenu={e => { e.preventDefault(); onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9998,
        WebkitAppRegion: 'no-drag' as React.CSSProperties['WebkitAppRegion'],
      }}
    />
    <div
      ref={ref}
      style={{
        position: 'fixed',
        top: y,
        left: x,
        zIndex: 9999,
        background: theme.surface,
        border: `1px solid ${theme.border}`,
        borderRadius: '8px',
        padding: '4px',
        minWidth: '160px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)',
        backdropFilter: 'blur(20px)',
      }}
    >
      {items.map(item => (
        <div
          key={item.label}
          style={itemStyle}
          onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = theme.surfaceHover }}
          onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
          onMouseDown={e => { e.preventDefault(); item.action() }}
        >
          {item.label}
        </div>
      ))}
    </div>
    </>
  )
}

export function Sidebar({ currentPath, rootDirs, onNavigate, onOpenInNewTab, bookmarks, onRemoveBookmark, recentPaths, onDropOnFolder }: Props) {
  const { theme } = useTheme()
  const [sidebarMenu, setSidebarMenu] = useState<SidebarMenu | null>(null)
  // Folder currently hovered by an in-flight drag - gets the accent highlight
  const [dragOverPath, setDragOverPath] = useState<string | null>(null)

  const dropHighlight = (path: string) =>
    dragOverPath === path
      ? { background: `${theme.accent}28`, outline: `1.5px solid ${theme.accent}`, outlineOffset: '-1.5px' }
      : {}

  const pinned = PINNED_DIRS
    .map(name => rootDirs.find(d => d.name === name))
    .filter((d): d is FileNode => d !== undefined)


  const sectionHeader = {
    fontSize: '11px',
    fontWeight: 600 as const,
    color: theme.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.09em',
    padding: '6px 10px 3px',
  }

  function DirItem({ node }: { node: FileNode }) {
    const active = currentPath === node.path || currentPath.startsWith(node.path + '/')
    const [hov, setHov] = useState(false)
    return (
      <button
        onClick={() => onNavigate(node.path)}
        onContextMenu={e => { e.preventDefault(); setSidebarMenu({ x: e.clientX, y: e.clientY, path: node.path, name: node.name }) }}
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        onDragOver={e => { e.preventDefault(); setDragOverPath(node.path) }}
        onDragLeave={() => setDragOverPath(null)}
        onDrop={e => {
          e.preventDefault()
          e.stopPropagation()
          setDragOverPath(null)
          onDropOnFolder?.(node.path)
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          width: '100%',
          padding: '5px 10px',
          fontSize: '13px',
          fontWeight: active ? 600 : 400,
          color: active ? theme.textPrimary : hov ? theme.textPrimary : theme.textSecondary,
          background: active ? `${theme.accent}18` : hov ? theme.surfaceHover : 'transparent',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
          textAlign: 'left',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          transition: 'background 70ms, color 70ms',
          ...dropHighlight(node.path),
        }}
      >
        <FolderIcon active={active} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{node.name}</span>
        {active && (
          <span style={{
            marginLeft: 'auto',
            width: 5, height: 5, borderRadius: '50%',
            background: theme.accent, flexShrink: 0,
          }} />
        )}
      </button>
    )
  }

  const isRoot = currentPath === '/storage/emulated/0'

  return (
    <aside style={{
      width: '182px',
      flexShrink: 0,
      boxShadow: `1px 0 0 ${theme.border}`,
      padding: '6px',
      overflowY: 'auto',
      display: 'flex',
      flexDirection: 'column',
      gap: '1px',
      background: theme.sidebar,
    }}>
      {/* Internal Storage root */}
      <button
        onClick={() => onNavigate('/storage/emulated/0')}
        onContextMenu={e => { e.preventDefault(); setSidebarMenu({ x: e.clientX, y: e.clientY, path: '/storage/emulated/0', name: 'Internal Storage' }) }}
        onDragOver={e => { e.preventDefault(); setDragOverPath('/storage/emulated/0') }}
        onDragLeave={() => setDragOverPath(null)}
        onDrop={e => { e.preventDefault(); e.stopPropagation(); setDragOverPath(null); onDropOnFolder?.('/storage/emulated/0') }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          width: '100%',
          padding: '5px 10px',
          fontSize: '13px',
          fontWeight: isRoot ? 600 : 400,
          color: isRoot ? theme.textPrimary : theme.textSecondary,
          background: isRoot ? `${theme.accent}18` : 'transparent',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
          textAlign: 'left',
          marginBottom: '2px',
          transition: 'background 70ms',
          ...dropHighlight('/storage/emulated/0'),
        }}
        onMouseEnter={e => { if (!isRoot) (e.currentTarget as HTMLButtonElement).style.background = theme.surfaceHover }}
        onMouseLeave={e => { if (!isRoot) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
      >
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
          <rect x="1" y="1" width="14" height="14" rx="3" fill={isRoot ? `${theme.accent}25` : 'rgba(255,255,255,0.06)'} stroke={isRoot ? theme.accent : theme.textMuted} strokeWidth="1.1" />
          <rect x="3.5" y="3.5" width="4" height="4" rx="1" fill={isRoot ? theme.accent : theme.textMuted} fillOpacity="0.7" />
          <rect x="8.5" y="3.5" width="4" height="4" rx="1" fill={isRoot ? theme.accent : theme.textMuted} fillOpacity="0.5" />
          <rect x="3.5" y="8.5" width="4" height="4" rx="1" fill={isRoot ? theme.accent : theme.textMuted} fillOpacity="0.5" />
          <rect x="8.5" y="8.5" width="4" height="4" rx="1" fill={isRoot ? theme.accent : theme.textMuted} fillOpacity="0.3" />
        </svg>
        Internal Storage
        {isRoot && (
          <span style={{ marginLeft: 'auto', width: 5, height: 5, borderRadius: '50%', background: theme.accent, flexShrink: 0 }} />
        )}
      </button>

      {pinned.length > 0 && (
        <>
          <div style={sectionHeader}>Pinned</div>
          {pinned.map(node => <DirItem key={node.path} node={node} />)}
        </>
      )}


      {bookmarks.length > 0 && (
        <>
          <div style={{ ...sectionHeader, paddingTop: '10px' }}>Bookmarks</div>
          {bookmarks.map(bm => {
            const active = currentPath === bm.path
            return (
              <div
                key={bm.path}
                style={{ display: 'flex', alignItems: 'center', width: '100%', borderRadius: '6px' }}
              >
                <button
                  onClick={() => onNavigate(bm.path)}
                  onContextMenu={e => { e.preventDefault(); setSidebarMenu({ x: e.clientX, y: e.clientY, path: bm.path, name: bm.name }) }}
                  onDragOver={e => { e.preventDefault(); setDragOverPath(bm.path) }}
                  onDragLeave={() => setDragOverPath(null)}
                  onDrop={e => { e.preventDefault(); e.stopPropagation(); setDragOverPath(null); onDropOnFolder?.(bm.path) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    flex: 1, minWidth: 0, padding: '5px 10px', fontSize: '13px', fontWeight: active ? 600 : 400,
                    color: active ? theme.textPrimary : theme.textSecondary,
                    background: active ? `${theme.accent}18` : 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                    overflow: 'hidden', borderRadius: '6px',
                    ...dropHighlight(bm.path),
                  }}
                >
                  <FolderIcon active={active} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bm.name}</span>
                </button>
                <button
                  onClick={() => onRemoveBookmark(bm.path)}
                  style={{
                    background: 'none', border: 'none', color: theme.textMuted, cursor: 'pointer',
                    padding: '4px 8px', fontSize: '14px', lineHeight: 1, flexShrink: 0, borderRadius: '4px',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = theme.error }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = theme.textMuted }}
                >
                  ×
                </button>
              </div>
            )
          })}
        </>
      )}

      {recentPaths.length > 0 && (
        <>
          <div style={{ ...sectionHeader, paddingTop: '10px' }}>Recent</div>
          {recentPaths.slice(0, 5).map(p => {
            const active = currentPath === p
            return (
              <button
                key={p}
                onClick={() => onNavigate(p)}
                onContextMenu={e => { e.preventDefault(); setSidebarMenu({ x: e.clientX, y: e.clientY, path: p, name: pathLabel(p) }) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
                  padding: '5px 10px', fontSize: '13px', fontWeight: active ? 600 : 400,
                  color: active ? theme.textPrimary : theme.textSecondary,
                  background: active ? `${theme.accent}18` : 'none',
                  border: 'none', borderRadius: '6px', cursor: 'pointer', textAlign: 'left',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
              >
                <FolderIcon active={active} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{pathLabel(p)}</span>
              </button>
            )
          })}
        </>
      )}

      {sidebarMenu && (
        <SidebarContextMenu
          menu={sidebarMenu}
          onNavigate={onNavigate}
          onOpenInNewTab={onOpenInNewTab}
          onClose={() => setSidebarMenu(null)}
        />
      )}
    </aside>
  )
}
