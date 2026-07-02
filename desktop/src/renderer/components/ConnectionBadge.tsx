import type { ConnectionStatus } from '@droidwire/shared'
import type { DeviceInfo } from '../hooks/useDevice'
import { useTheme } from '../lib/ThemeContext'

interface Props {
  status: ConnectionStatus
  device: DeviceInfo | null
  safeToUnplug: boolean
  onRescan: () => void
  onDisconnect: () => void
}

export function ConnectionBadge({ status, device, safeToUnplug, onRescan, onDisconnect }: Props) {
  const { theme } = useTheme()

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
        <span style={{ fontSize: '13px', fontWeight: 500, color: theme.textSecondary }}>
          {device.name}
          {device.battery > 0 && (
            <span style={{ marginLeft: '6px', color: theme.textMuted }}>
              {device.battery}%
            </span>
          )}
        </span>
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
          title="Eject device"
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
