import React, { useState, useEffect } from 'react'
import type { FileNode } from '@droidwire/shared'
import { useDevice } from '../hooks/useDevice'
import { useTransfers } from '../hooks/useTransfers'
import { formatSpeed, formatPercent } from '../lib/format'
import { uniqueDestName } from '../lib/names'
import { FileConflictModal } from './FileConflictModal'
import { TransportIcon } from './TransportIcon'
import type { ConflictResolution, ConflictChoice } from './FileConflictModal'
import { useTheme } from '../lib/ThemeContext'

// Quick drops from the menu bar always land in the phone's Download folder
const DROP_DEST = '/storage/emulated/0/Download'

export function MenubarApp() {
  const { theme } = useTheme()
  const { status, device, devices, selectDevice } = useDevice()
  const { transfers, upload, cancel } = useTransfers()
  const [dragOver, setDragOver] = useState(false)
  const [conflictState, setConflictState] = useState<{
    names: string[]
    showApplyAll: boolean
    resolve: (r: ConflictResolution) => void
  } | null>(null)

  const connected = status === 'connected'
  const visible = transfers.slice(0, 6)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') window.droidwire.hideWindow().catch(() => {})
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    if (!connected) return
    const files = Array.from(e.dataTransfer.files)
      .map(f => window.droidwire.getPathForFile(f))
      .filter((p): p is string => !!p)
    if (files.length === 0) return

    // Duplicate check against the phone's Download folder — same
    // Replace / Keep Both / Cancel prompt as the main window
    let existingNames = new Set<string>()
    try {
      const listing = await window.droidwire.listFiles(DROP_DEST) as FileNode[]
      existingNames = new Set(listing.map(f => f.name))
    } catch { /* folder unreadable — push with original names */ }

    const names = files.map(p => p.split('/').pop() ?? 'file')
    const conflictCount = names.filter(n => existingNames.has(n)).length

    // One prompt per conflicting file; "Do this for all" remembers the choice
    let remembered: ConflictChoice | null = null
    for (let i = 0; i < files.length; i++) {
      let destName = names[i]
      if (existingNames.has(destName)) {
        let choice: ConflictChoice | null = remembered
        if (!choice) {
          const res = await new Promise<ConflictResolution>(resolve =>
            setConflictState({ names: [destName], showApplyAll: conflictCount > 1, resolve })
          )
          setConflictState(null)
          choice = res.choice
          if (res.applyToAll) remembered = choice
        }
        if (choice === 'cancel') continue
        if (choice === 'keep-both') destName = uniqueDestName(destName, existingNames)
      }
      existingNames.add(destName)
      void upload(files[i], DROP_DEST, destName)
    }
  }

  return (
    <div
      style={{
        height: '100vh', display: 'flex', flexDirection: 'column',
        background: theme.bg, color: theme.textPrimary,
        borderRadius: '10px', overflow: 'hidden',
        border: `1px solid ${theme.border}`, boxSizing: 'border-box',
      }}
      onDragOver={e => { e.preventDefault(); if (connected) setDragOver(true) }}
      onDragLeave={e => {
        if (!e.relatedTarget || !(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setDragOver(false)
      }}
      onDrop={handleDrop}
    >
      {/* Header: device status */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: '10px 14px', borderBottom: `1px solid ${theme.border}`,
        background: theme.surface, flexShrink: 0,
      }}>
        <span style={{
          width: '7px', height: '7px', borderRadius: '50%', flexShrink: 0,
          background: connected ? theme.accent : theme.textMuted,
        }} />
        {connected && device && <TransportIcon serial={device.serial} color={theme.textMuted} />}
        <span style={{ fontSize: '13px', fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {connected ? (device?.name ?? 'Android device') : 'No device'}
        </span>
        {connected && device && device.battery >= 0 && (
          <span style={{ fontSize: '11px', color: theme.textMuted, flexShrink: 0 }}>{device.battery}%</span>
        )}
        <button
          onClick={() => window.droidwire.hideWindow().catch(() => {})}
          style={{
            background: 'none', border: 'none', color: theme.textMuted, cursor: 'pointer',
            padding: '3px', display: 'flex', alignItems: 'center', flexShrink: 0,
          }}
        >
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Device switcher — only when 2+ phones are connected */}
      {devices.length >= 2 && (
        <div style={{ borderBottom: `1px solid ${theme.border}`, padding: '6px 8px', flexShrink: 0 }}>
          {devices.map(d => {
            const isActive = d.serial === device?.serial
            return (
              <div
                key={d.serial}
                onClick={() => { if (!isActive) selectDevice(d.serial) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '5px 8px', borderRadius: '6px',
                  cursor: isActive ? 'default' : 'pointer',
                  background: isActive ? theme.accentDim : 'transparent',
                }}
                onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = theme.surfaceHover }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = isActive ? theme.accentDim : 'transparent' }}
              >
                <span style={{ width: '13px', display: 'flex', alignItems: 'center', color: theme.accent, flexShrink: 0 }}>
                  {isActive && (
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <TransportIcon serial={d.serial} color={isActive ? theme.accent : theme.textMuted} />
                <span style={{
                  fontSize: '12px', flex: 1, minWidth: 0,
                  color: isActive ? theme.accent : theme.textPrimary,
                  fontWeight: isActive ? 600 : 400,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {d.model || d.serial}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* Drop zone */}
      <div style={{ flex: 1, padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px', minHeight: 0 }}>
        <div style={{
          flex: visible.length > 0 ? '0 0 110px' : 1,
          border: `1.5px dashed ${dragOver ? theme.accent : theme.border}`,
          borderRadius: '10px',
          background: dragOver ? theme.accentDim : 'transparent',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px',
          transition: 'border-color 120ms, background 120ms',
          opacity: connected ? 1 : 0.45,
        }}>
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <path d="M11 15V4M6.5 8.5L11 4l4.5 4.5" stroke={dragOver ? theme.accent : theme.textMuted} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 18h14" stroke={dragOver ? theme.accent : theme.textMuted} strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <span style={{ fontSize: '12px', color: dragOver ? theme.accent : theme.textMuted, textAlign: 'center', padding: '0 12px' }}>
            {connected ? 'Drop files to send to Download' : 'Connect a phone to send files'}
          </span>
        </div>

        {/* Transfers */}
        {visible.length > 0 && (
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {visible.map(t => {
              const pct = formatPercent(t.transferredBytes, t.totalBytes)
              const running = t.status === 'active' || t.status === 'pending'
              const color = t.status === 'done' ? theme.accent : t.status === 'error' ? theme.error : theme.textMuted
              return (
                <div key={t.id} style={{ padding: '6px 2px', borderBottom: `1px solid ${theme.border}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginBottom: running ? '4px' : 0 }}>
                    <span style={{ fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.fileName}</span>
                    <span style={{ fontSize: '11px', color, flexShrink: 0 }}>
                      {t.status === 'done' ? 'Done' : t.status === 'error' ? 'Error' : t.status === 'pending' ? 'Queued' : `${pct}% · ${formatSpeed(t.speedBps)}`}
                    </span>
                  </div>
                  {running && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ flex: 1, height: '3px', background: theme.surfaceHover, borderRadius: '2px', overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: theme.accent, borderRadius: '2px', transition: 'width 300ms' }} />
                      </div>
                      <span
                        onClick={() => cancel(t.id)}
                        style={{ fontSize: '11px', color: theme.warning, cursor: 'pointer', flexShrink: 0 }}
                      >
                        Cancel
                      </span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 12px', borderTop: `1px solid ${theme.border}`,
        background: theme.surface, flexShrink: 0,
      }}>
        <button
          onClick={() => window.droidwire.showMainWindow().catch(() => {})}
          style={{
            background: 'none', border: `1px solid ${theme.border}`, borderRadius: '7px',
            height: '26px', padding: '0 10px', fontSize: '12px',
            color: theme.textSecondary, cursor: 'pointer',
          }}
        >
          Open Droidwire
        </button>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            onClick={() => window.droidwire.showAbout().catch(() => {})}
            style={{
              background: 'none', border: 'none', height: '26px', padding: '0 6px',
              fontSize: '12px', color: theme.textMuted, cursor: 'pointer',
            }}
          >
            About
          </button>
          <button
            onClick={() => window.droidwire.quitApp().catch(() => {})}
            style={{
              background: 'none', border: 'none', height: '26px', padding: '0 6px',
              fontSize: '12px', color: theme.textMuted, cursor: 'pointer',
            }}
          >
            Quit
          </button>
        </div>
      </div>

      {conflictState && (
        <FileConflictModal
          conflictNames={conflictState.names}
          showApplyAll={conflictState.showApplyAll}
          onResolve={conflictState.resolve}
        />
      )}
    </div>
  )
}
