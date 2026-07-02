import React, { useState, useRef, useEffect } from 'react'
import { useTheme } from '../lib/ThemeContext'
import type { Theme } from '../lib/theme'

type FilterType = 'all' | 'image' | 'video' | 'audio' | 'doc' | 'other'
type ViewMode = 'list' | 'grid'
type SearchMode = 'local' | 'deep'
type SortField = 'name' | 'size' | 'date' | 'type'
type SortDir = 'asc' | 'desc'

interface Props {
  filterType: FilterType
  onFilter: (type: FilterType) => void
  viewMode: ViewMode
  onViewMode: (mode: ViewMode) => void
  searchQuery: string
  onSearch: (q: string) => void
  searchMode: SearchMode
  onSearchMode: (mode: SearchMode) => void
  searching: boolean
  onNewFolder: () => void
  downloadDir: string
  onPickDownloadDir: () => void
  sortField: SortField
  sortDir: SortDir
  onSort: (field: SortField) => void
}

const FILTER_OPTIONS: { value: FilterType; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'image', label: 'Images' },
  { value: 'video', label: 'Videos' },
  { value: 'audio', label: 'Audio' },
  { value: 'doc', label: 'Docs' },
  { value: 'other', label: 'Other' },
]

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'size', label: 'Size' },
  { value: 'date', label: 'Date Modified' },
  { value: 'type', label: 'Kind' },
]

function CheckIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Dropdown<T extends string>({
  value, onChange, options, theme, minWidth, activeCheck,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
  theme: Theme
  minWidth?: number
  activeCheck?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = options.find(o => o.value === value) ?? options[0]
  const active = activeCheck !== undefined ? activeCheck : (value !== (options[0]?.value ?? ''))

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: '5px',
          background: active ? theme.accentDim : 'transparent',
          border: `1px solid ${active ? theme.borderFocus : theme.border}`,
          borderRadius: '7px',
          color: active ? theme.accent : theme.textSecondary,
          fontSize: '12px', fontWeight: active ? 600 : 400,
          padding: '5px 9px', cursor: 'pointer',
          minWidth: minWidth ? `${minWidth}px` : undefined,
          justifyContent: 'space-between',
          whiteSpace: 'nowrap',
          transition: 'background 80ms, border-color 80ms',
        }}
        onMouseEnter={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = theme.surfaceHover }}
        onMouseLeave={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
      >
        <span>{selected.label}</span>
        <svg width="9" height="9" viewBox="0 0 10 10" fill="none" style={{ marginLeft: '2px', flexShrink: 0 }}>
          <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 5px)', left: 0,
          background: theme.surface,
          border: `1px solid ${theme.border}`,
          borderRadius: '10px',
          padding: '4px',
          minWidth: '150px',
          boxShadow: `0 16px 48px ${theme.shadow}, 0 4px 16px ${theme.shadow}`,
          zIndex: 200,
          backdropFilter: 'blur(20px)',
        }}>
          {options.map(opt => (
            <div
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false) }}
              style={{
                padding: '7px 10px', fontSize: '13px', cursor: 'pointer',
                borderRadius: '6px',
                color: value === opt.value ? theme.accent : theme.textPrimary,
                background: 'transparent',
                display: 'flex', alignItems: 'center', gap: '8px',
                userSelect: 'none',
                transition: 'background 60ms',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = theme.surfaceHover }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
            >
              <span style={{ width: '13px', display: 'flex', alignItems: 'center', color: theme.accent, flexShrink: 0 }}>
                {value === opt.value && <CheckIcon />}
              </span>
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ToolBtn({ children, onClick, title, active, theme }: {
  children: React.ReactNode; onClick: () => void; title: string; active?: boolean; theme: Theme
}) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      title={title}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: active ? theme.accentDim : hov ? theme.surfaceHover : 'transparent',
        border: active ? `1px solid ${theme.borderFocus}` : '1px solid transparent',
        color: active ? theme.accent : hov ? theme.textPrimary : theme.textSecondary,
        cursor: 'pointer', padding: '5px 7px', display: 'flex',
        alignItems: 'center', borderRadius: '7px', transition: 'all 80ms',
      }}
    >
      {children}
    </button>
  )
}

export function Toolbar({
  filterType, onFilter, viewMode, onViewMode,
  searchQuery, onSearch, searchMode, onSearchMode, searching,
  onNewFolder, downloadDir, onPickDownloadDir,
  sortField, sortDir, onSort,
}: Props) {
  const { theme } = useTheme()
  const searchRef = useRef<HTMLInputElement>(null)
  const dirLabel = downloadDir.split('/').filter(Boolean).pop() ?? downloadDir

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  const sortActive = sortField !== 'name' || sortDir !== 'asc'

  return (
    <div style={{
      padding: '5px 12px',
      borderBottom: `1px solid ${theme.border}`,
      background: theme.surface,
      display: 'flex',
      gap: '6px',
      alignItems: 'center',
      height: '40px',
      flexShrink: 0,
    }}>
      {/* Left: view + filter + sort + actions */}
      <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexShrink: 0 }}>
        {/* View toggle */}
        <div style={{
          display: 'flex',
          background: theme.surfaceHover,
          border: `1px solid ${theme.border}`,
          borderRadius: '7px', padding: '2px', gap: '1px',
        }}>
          <button
            onClick={() => onViewMode('list')}
            title="List view"
            style={{
              background: viewMode === 'list' ? theme.surface : 'transparent',
              border: 'none', borderRadius: '5px',
              color: viewMode === 'list' ? theme.textPrimary : theme.textMuted,
              cursor: 'pointer', padding: '4px 7px', display: 'flex', alignItems: 'center',
              boxShadow: viewMode === 'list' ? `0 1px 3px ${theme.shadow}` : 'none',
              transition: 'all 100ms',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 15 15" fill="none">
              <path d="M2 4h11M2 7.5h11M2 11h11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
          <button
            onClick={() => onViewMode('grid')}
            title="Grid view"
            style={{
              background: viewMode === 'grid' ? theme.surface : 'transparent',
              border: 'none', borderRadius: '5px',
              color: viewMode === 'grid' ? theme.textPrimary : theme.textMuted,
              cursor: 'pointer', padding: '4px 7px', display: 'flex', alignItems: 'center',
              boxShadow: viewMode === 'grid' ? `0 1px 3px ${theme.shadow}` : 'none',
              transition: 'all 100ms',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 15 15" fill="none">
              <rect x="2" y="2" width="4.5" height="4.5" rx="1.2" stroke="currentColor" strokeWidth="1.2" />
              <rect x="8.5" y="2" width="4.5" height="4.5" rx="1.2" stroke="currentColor" strokeWidth="1.2" />
              <rect x="2" y="8.5" width="4.5" height="4.5" rx="1.2" stroke="currentColor" strokeWidth="1.2" />
              <rect x="8.5" y="8.5" width="4.5" height="4.5" rx="1.2" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
        </div>

        <div style={{ width: '1px', height: '18px', background: theme.border, margin: '0 1px' }} />

        <Dropdown<FilterType>
          value={filterType}
          onChange={onFilter}
          options={FILTER_OPTIONS}
          theme={theme}
          minWidth={80}
        />

        {/* Sort control */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
          <Dropdown<SortField>
            value={sortField}
            onChange={onSort}
            options={SORT_OPTIONS}
            theme={theme}
            minWidth={90}
            activeCheck={sortActive}
          />
          <button
            onClick={() => onSort(sortField)}
            title={`Sort ${sortDir === 'asc' ? 'descending' : 'ascending'}`}
            style={{
              background: 'transparent', border: `1px solid ${theme.border}`,
              borderRadius: '7px', padding: '5px 7px',
              color: sortActive ? theme.accent : theme.textMuted,
              cursor: 'pointer', display: 'flex', alignItems: 'center',
              transition: 'background 80ms',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = theme.surfaceHover }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              {sortDir === 'asc' ? (
                <>
                  <path d="M6 9.5V2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                  <path d="M3.5 4.5L6 2.5l2.5 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </>
              ) : (
                <>
                  <path d="M6 2.5v7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                  <path d="M3.5 7.5L6 9.5l2.5-2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </>
              )}
            </svg>
          </button>
        </div>

        <div style={{ width: '1px', height: '18px', background: theme.border, margin: '0 1px' }} />

        <ToolBtn title="New folder (⌘⇧N)" onClick={onNewFolder} theme={theme}>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <path d="M1 4C1 3.448 1.448 3 2 3H6L7.5 4.5H14C14.552 4.5 15 4.948 15 5.5V12C15 12.552 14.552 13 14 13H2C1.448 13 1 12.552 1 12V4Z" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinejoin="round" />
            <path d="M8 7v4M6 9h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        </ToolBtn>

        <button
          onClick={onPickDownloadDir}
          title={`Save to: ${downloadDir}`}
          style={{
            display: 'flex', alignItems: 'center', gap: '4px',
            background: 'transparent', border: `1px solid ${theme.border}`,
            borderRadius: '7px', padding: '5px 8px',
            color: theme.textSecondary, fontSize: '12px', cursor: 'pointer',
            maxWidth: '110px', transition: 'background 80ms',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = theme.surfaceHover }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
        >
          <svg width="12" height="11" viewBox="0 0 14 12" fill="none" style={{ flexShrink: 0 }}>
            <path d="M1 3C1 2.448 1.448 2 2 2H5.5L7 3.5H12C12.552 3.5 13 3.948 13 4.5V10C13 10.552 12.552 11 12 11H2C1.448 11 1 10.552 1 10V3Z" fill="currentColor" fillOpacity="0.6" />
          </svg>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {dirLabel}
          </span>
        </button>
      </div>

      <div style={{ flex: 1 }} />

      {/* Search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
        {searchQuery && (
          <div style={{ display: 'flex', gap: '3px' }}>
            {(['local', 'deep'] as SearchMode[]).map(mode => {
              const active = searchMode === mode
              return (
                <button
                  key={mode}
                  onClick={() => onSearchMode(mode)}
                  style={{
                    fontSize: '11px', fontWeight: 500,
                    padding: '4px 8px', borderRadius: '6px',
                    border: `1px solid ${active ? theme.borderFocus : theme.border}`,
                    color: active ? theme.accent : theme.textMuted,
                    background: active ? theme.accentDim : 'transparent',
                    cursor: 'pointer', whiteSpace: 'nowrap',
                  }}
                >
                  {mode === 'local' ? 'In folder' : 'Deep'}
                </button>
              )
            })}
            {searching && <span style={{ fontSize: '12px', color: theme.textMuted, padding: '4px 2px' }}>…</span>}
          </div>
        )}

        <div style={{ position: 'relative' }}>
          <svg
            width="13" height="13" viewBox="0 0 14 14" fill="none"
            style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
          >
            <circle cx="6" cy="6" r="4.5" stroke={searchQuery ? theme.textSecondary : theme.textMuted} strokeWidth="1.3" />
            <path d="M10 10l2.5 2.5" stroke={searchQuery ? theme.textSecondary : theme.textMuted} strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          <input
            ref={searchRef}
            type="text"
            value={searchQuery}
            onChange={e => onSearch(e.target.value)}
            placeholder="Search"
            style={{
              width: searchQuery ? '210px' : '160px',
              boxSizing: 'border-box',
              background: theme.inputBg,
              border: `1px solid ${searchQuery ? theme.borderFocus : theme.border}`,
              borderRadius: '20px',
              paddingLeft: '30px',
              paddingRight: searchQuery ? '28px' : '10px',
              paddingTop: '5px', paddingBottom: '5px',
              fontSize: '12px',
              color: theme.textPrimary,
              outline: 'none',
              transition: 'width 150ms, border-color 80ms',
            }}
            onFocus={e => { (e.currentTarget as HTMLInputElement).style.width = '210px' }}
            onBlur={e => { if (!searchQuery) (e.currentTarget as HTMLInputElement).style.width = '160px' }}
          />
          {searchQuery && (
            <button
              onClick={() => onSearch('')}
              style={{
                position: 'absolute', right: '7px', top: '50%', transform: 'translateY(-50%)',
                background: theme.textMuted, border: 'none', borderRadius: '50%',
                width: '14px', height: '14px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: theme.bg, padding: 0, flexShrink: 0,
              }}
            >
              <svg width="7" height="7" viewBox="0 0 8 8" fill="none">
                <path d="M1 1l6 6M7 1L1 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
