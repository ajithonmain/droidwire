import React from 'react'
import type { ConnectionStatus } from '@droidwire/shared'
import type { DeviceInfo } from '../hooks/useDevice'

interface Props {
  status: ConnectionStatus
  device: DeviceInfo | null
  onRescan: () => void
}

const STATUS_COLOR: Record<ConnectionStatus, string> = {
  connected: '#00D84A',
  connecting: '#FF9500',
  reconnecting: '#FF9500',
  disconnected: '#FF4444',
}

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  connected: 'Connected',
  connecting: 'Scanning...',
  reconnecting: 'Reconnecting...',
  disconnected: 'No device',
}

export function ConnectionBadge({ status, device, onRescan }: Props) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      {device && (
        <span style={{ fontSize: '13px', color: '#6B6B6B' }}>
          {device.name}
          {device.battery > 0 && (
            <span style={{ marginLeft: '6px', color: '#6B6B6B' }}>
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
            backgroundColor: STATUS_COLOR[status],
            boxShadow: status === 'connected' ? `0 0 6px ${STATUS_COLOR[status]}80` : 'none',
            flexShrink: 0,
          }}
        />
        <span style={{ fontSize: '12px', color: '#6B6B6B' }}>
          {STATUS_LABEL[status]}
        </span>
      </div>

      {(status === 'disconnected') && (
        <button
          onClick={onRescan}
          style={{
            fontSize: '11px',
            color: '#6B6B6B',
            background: 'none',
            border: '1px solid #1E1E1E',
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
