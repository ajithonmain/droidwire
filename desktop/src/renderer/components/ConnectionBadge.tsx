import { useState, useEffect, useRef } from 'react'
import type { ConnectionStatus } from '@droidwire/shared'
import type { DeviceInfo, AdbDevice } from '../hooks/useDevice'
import { useTheme } from '../lib/ThemeContext'

interface Props {
  status: ConnectionStatus
  device: DeviceInfo | null
  devices?: AdbDevice[]
  safeToUnplug: boolean
  onRescan: () => void
  onDisconnect: () => void
  onSelectDevice?: (serial: string) => void
}

export function ConnectionBadge({ status, device, devices = [], safeToUnplug, onRescan, onDisconnect, onSelectDevice }: Props) {
  const { theme } = useTheme()
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const switcherRef = useRef<HTMLDivElement>(null)
  const multi = devices.length > 1 && !!onSelectDevice

  useEffect(() => {
    if (!switcherOpen) return
    const handler = (e: MouseEvent) => {
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) setSwitcherOpen(false)
    }
    const close = () => setSwitcherOpen(false)
    document.addEventListener('mousedown', handler)
    window.addEventListener('blur', close)
    return () => {
      document.removeEventListener('mousedown', handler)
      window.removeEventListener('blur', close)
    }
  }, [switcherOpen])

  const statusColor: Record<ConnectionStatus, string> = {
    connected: theme.accent,
    connecting: theme.warning,
    reconnecting: theme.warning,
    disconnected: theme.error,
  }

  const statusLabel: Record<ConnectionStatus, string> = {
    connected: 'Connected',
    connecting: 'Scanning...',
    reconnecting: 'Reconnecting...',
    disconnected: 'No device',
  }

  if (safeToUnplug) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: theme.accent, boxShadow: `0 0 6px ${theme.accent}80`, flexShrink: 0 }} />
        <span style={{ fontSize: '12px', fontWeight: 600, color: theme.accent }}>Safe to unplug</span>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      {device && (
        <div ref={switcherRef} style={{ position: 'relative' }}>
          <span
            onClick={multi ? () => setSwitcherOpen(o => !o) : undefined}
            data-tip={multi ? 'Switch device' : undefined}
            style={{
              fontSize: '13px', fontWeight: 500, color: theme.textSecondary,
              cursor: multi ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', gap: '4px',
            }}
          >
            {device.name}
            {device.battery > 0 && (
              <span style={{ color: theme.textMuted }}>
                {device.battery}%
              </span>
            )}
            {multi && (
              <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </span>

          {switcherOpen && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 8px)', right: 0,
              background: theme.surface,
              border: `1px solid ${theme.border}`,
              borderRadius: '10px', padding: '4px',
              minWidth: '180px', zIndex: 300,
              boxShadow: `0 16px 48px ${theme.shadow}`,
            }}>
              {devices.map(d => {
                const active = d.serial === device.serial
                return (
                  <div
                    key={d.serial}
                    onClick={() => { setSwitcherOpen(false); if (!active) onSelectDevice?.(d.serial) }}
                    style={{
                      padding: '7px 10px', fontSize: '13px', cursor: 'pointer',
                      borderRadius: '6px',
                      color: active ? theme.accent : theme.textPrimary,
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
                      userSelect: 'none',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = theme.surfaceHover }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.model || d.serial}</span>
                    {active && (
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: theme.accent, flexShrink: 0 }} />
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span
          style={{
            width: '7px',
            height: '7px',
            borderRadius: '50%',
            backgroundColor: statusColor[status],
            boxShadow: status === 'connected' ? `0 0 6px ${statusColor[status]}80` : 'none',
            flexShrink: 0,
          }}
        />
        <span style={{ fontSize: '12px', fontWeight: 500, color: theme.textSecondary }}>
          {statusLabel[status]}
        </span>
      </div>

      {status === 'connected' && (
        <button
          onClick={onDisconnect}
          data-tip="Eject device"
          style={{
            fontSize: '11px',
            color: theme.textMuted,
            background: 'none',
            border: `1px solid ${theme.border}`,
            borderRadius: '4px',
            padding: '2px 8px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <path d="M6 1L11 7H1L6 1Z" fill={theme.textMuted} />
            <rect x="1" y="9" width="10" height="2" rx="1" fill={theme.textMuted} />
          </svg>
          Eject
        </button>
      )}

      {status === 'disconnected' && !safeToUnplug && (
        <button
          onClick={onRescan}
          style={{
            fontSize: '11px',
            color: theme.textMuted,
            background: 'none',
            border: `1px solid ${theme.border}`,
            borderRadius: '4px',
            padding: '2px 8px',
            cursor: 'pointer',
          }}
        >
          Scan
        </button>
      )}
    </div>
  )
}
