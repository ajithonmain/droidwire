import { useState, useEffect, useRef, type CSSProperties } from 'react'
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
  onEjectDevice?: (serial: string) => void
}

export function ConnectionBadge({ status, device, devices = [], safeToUnplug, onRescan, onDisconnect, onSelectDevice, onEjectDevice }: Props) {
  const { theme } = useTheme()
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [ejectMenuOpen, setEjectMenuOpen] = useState(false)
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
            <>
            {/* Full-window overlay: closes on any click, including the titlebar drag region */}
            <div
              onMouseDown={() => setSwitcherOpen(false)}
              style={{
                position: 'fixed', inset: 0, zIndex: 299,
                WebkitAppRegion: 'no-drag' as CSSProperties['WebkitAppRegion'],
              }}
            />
            <div style={{
              position: 'absolute', top: 'calc(100% + 8px)', right: 0,
              background: theme.surface,
              border: `1px solid ${theme.border}`,
              borderRadius: '10px', padding: '4px',
              minWidth: '200px', zIndex: 300,
              boxShadow: `0 16px 48px ${theme.shadow}`,
            }}>
              {devices.map(d => {
                const active = d.serial === device.serial
                return (
                  <div
                    key={d.serial}
                    onClick={() => { setSwitcherOpen(false); if (!active) onSelectDevice?.(d.serial) }}
                    style={{
                      padding: '8px 10px', fontSize: '13px', cursor: 'pointer',
                      borderRadius: '6px',
                      color: active ? theme.accent : theme.textPrimary,
                      fontWeight: active ? 600 : 400,
                      background: active ? `${theme.accent}18` : 'transparent',
                      display: 'flex', alignItems: 'center', gap: '8px',
                      userSelect: 'none',
                    }}
                    onMouseEnter={e => { if (!active) (e.currentTarget as HTMLDivElement).style.background = theme.surfaceHover }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = active ? `${theme.accent}18` : 'transparent' }}
                  >
                    <span style={{ width: '13px', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                      {active && (
                        <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                          <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.model || d.serial}</span>
                    {active && (
                      <span style={{ fontSize: '10px', fontWeight: 600, color: theme.accent, textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>
                        Current
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
            </>
          )}
        </div>
      )}

      {status === 'connected' && (
        <button
          onClick={onRescan}
          data-tip="Scan for devices"
          style={{
            background: 'none', border: `1px solid ${theme.border}`, borderRadius: '4px',
            width: '20px', height: '20px', padding: 0, cursor: 'pointer',
            color: theme.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'color 80ms, background 80ms',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = theme.surfaceHover; (e.currentTarget as HTMLButtonElement).style.color = theme.textSecondary }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; (e.currentTarget as HTMLButtonElement).style.color = theme.textMuted }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
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
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => {
              // Multiple phones: let the user pick current-only or all
              if (devices.length > 1 && onEjectDevice) setEjectMenuOpen(o => !o)
              else onDisconnect()
            }}
            data-tip={devices.length > 1 ? 'Eject…' : 'Eject device'}
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

          {ejectMenuOpen && (
            <>
            <div
              onMouseDown={() => setEjectMenuOpen(false)}
              style={{
                position: 'fixed', inset: 0, zIndex: 299,
                WebkitAppRegion: 'no-drag' as CSSProperties['WebkitAppRegion'],
              }}
            />
            <div style={{
              position: 'absolute', top: 'calc(100% + 8px)', right: 0,
              background: theme.surface,
              border: `1px solid ${theme.border}`,
              borderRadius: '10px', padding: '4px',
              minWidth: '210px', zIndex: 300,
              boxShadow: `0 16px 48px ${theme.shadow}`,
            }}>
              {[
                { label: `Eject ${device?.name ?? 'this device'}`, sub: 'Keep other devices connected', action: () => { setEjectMenuOpen(false); if (device) onEjectDevice?.(device.serial) } },
                { label: 'Eject All Devices', sub: 'Back to the start screen', action: () => { setEjectMenuOpen(false); onDisconnect() } },
              ].map(item => (
                <div
                  key={item.label}
                  onClick={item.action}
                  style={{
                    padding: '8px 10px', fontSize: '13px', cursor: 'pointer',
                    borderRadius: '6px', color: theme.textPrimary, userSelect: 'none',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = theme.surfaceHover }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
                >
                  {item.label}
                  <span style={{ display: 'block', fontSize: '11px', color: theme.textMuted, marginTop: '1px' }}>{item.sub}</span>
                </div>
              ))}
            </div>
            </>
          )}
        </div>
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
