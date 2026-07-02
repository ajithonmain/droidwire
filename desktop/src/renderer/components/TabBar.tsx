import { useState, useRef } from 'react'
import { useTheme } from '../lib/ThemeContext'

export interface Tab {
  id: string
  path: string
}

function pathLabel(path: string): string {
  const seg = path.split('/').filter(Boolean).pop()
  if (!seg || seg === '0') return 'Internal Storage'
  return seg
}

interface Props {
  tabs: Tab[]
  activeTabId: string
  onSwitch: (id: string) => void
  onClose: (id: string) => void
  onNew: () => void
  onDropOnTab?: (path: string) => void
}

export function TabBar({ tabs, activeTabId, onSwitch, onClose, onNew, onDropOnTab }: Props) {
  const { theme } = useTheme()
  const [hovered, setHovered] = useState<string | null>(null)
  const [dragHovId, setDragHovId] = useState<string | null>(null)
  const dragSwitchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      height: '34px',
      background: theme.bg,
      borderBottom: `1px solid ${theme.border}`,
      flexShrink: 0,
      paddingLeft: '6px',
      gap: '2px',
      overflowX: 'auto',
    }}>
      {tabs.map(tab => {
        const isActive = tab.id === activeTabId
        const isHov = hovered === tab.id

        return (
          <div
            key={tab.id}
            onMouseEnter={() => setHovered(tab.id)}
            onMouseLeave={() => setHovered(null)}
            onClick={() => onSwitch(tab.id)}
            onDragOver={e => { e.preventDefault(); setDragHovId(tab.id) }}
            onDragEnter={() => {
              if (tab.id === activeTabId) return
              if (dragSwitchTimer.current) clearTimeout(dragSwitchTimer.current)
              dragSwitchTimer.current = setTimeout(() => onSwitch(tab.id), 400)
            }}
            onDragLeave={() => {
              setDragHovId(prev => (prev === tab.id ? null : prev))
              if (dragSwitchTimer.current) { clearTimeout(dragSwitchTimer.current); dragSwitchTimer.current = null }
            }}
            onDrop={e => {
              e.preventDefault()
              e.stopPropagation()
              setDragHovId(null)
              if (dragSwitchTimer.current) { clearTimeout(dragSwitchTimer.current); dragSwitchTimer.current = null }
              onDropOnTab?.(tab.path)
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              height: '28px',
              padding: '0 8px 0 10px',
              borderRadius: '6px',
              cursor: 'pointer',
              background: dragHovId === tab.id
                ? `${theme.accent}28`
                : isActive
                  ? theme.surface
                  : isHov ? theme.surfaceHover : 'transparent',
              border: `1px solid ${dragHovId === tab.id ? theme.accent : isActive ? theme.border : 'transparent'}`,
              flexShrink: 0,
              userSelect: 'none',
              transition: 'background 80ms, border-color 80ms',
            }}
          >
            <svg width="12" height="11" viewBox="0 0 14 12" fill="none">
              <path
                d="M1 3C1 2.448 1.448 2 2 2H5.5L7 3.5H12C12.552 3.5 13 3.948 13 4.5V10C13 10.552 12.552 11 12 11H2C1.448 11 1 10.552 1 10V3Z"
                fill={isActive ? theme.accentDim : 'transparent'}
                stroke={isActive ? theme.accent : theme.textMuted}
                strokeWidth="1.1"
              />
            </svg>
            <span style={{
              fontSize: '12px',
              fontWeight: isActive ? 500 : 400,
              color: isActive ? theme.textPrimary : theme.textSecondary,
              maxWidth: '120px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {pathLabel(tab.path)}
            </span>
            {tabs.length > 1 && (
              <button
                onClick={e => { e.stopPropagation(); onClose(tab.id) }}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '2px',
                  cursor: 'pointer',
                  color: theme.textMuted,
                  display: 'flex',
                  alignItems: 'center',
                  borderRadius: '3px',
                  flexShrink: 0,
                  lineHeight: 1,
                  opacity: isActive || isHov ? 1 : 0,
                  transition: 'opacity 80ms',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = theme.textPrimary }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = theme.textMuted }}
              >
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                  <path d="M1 1l6 6M7 1L1 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>
        )
      })}

      <button
        onClick={onNew}
        title="New tab (⌘T)"
        style={{
          background: 'none',
          border: 'none',
          color: theme.textMuted,
          cursor: 'pointer',
          padding: '4px 6px',
          display: 'flex',
          alignItems: 'center',
          borderRadius: '5px',
          flexShrink: 0,
          transition: 'color 80ms, background 80ms',
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLButtonElement).style.color = theme.textPrimary
          ;(e.currentTarget as HTMLButtonElement).style.background = theme.surfaceHover
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLButtonElement).style.color = theme.textMuted
          ;(e.currentTarget as HTMLButtonElement).style.background = 'none'
        }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  )
}
