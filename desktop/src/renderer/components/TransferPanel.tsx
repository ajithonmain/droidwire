import React from 'react'
import type { TransferProgress } from '@droidwire/shared'
import { formatSize, formatSpeed, formatEta, formatPercent } from '../lib/format'

interface Props {
  transfers: TransferProgress[]
  onDismiss: (id: string) => void
  onOpenDownloads: () => void
}

function XIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

function TransferRow({ t, onDismiss, onOpenDownloads }: { t: TransferProgress; onDismiss: () => void; onOpenDownloads: () => void }) {
  const pct = formatPercent(t.transferredBytes, t.totalBytes)
  const remaining = t.totalBytes - t.transferredBytes
  const statusColor = t.status === 'done' ? '#00D84A' : t.status === 'error' ? '#FF4444' : '#6B6B6B'
  const isActive = t.status === 'active' || t.status === 'pending'
  const label = t.direction === 'download' ? 'DL' : 'UL'

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      padding: '6px 0',
      borderBottom: '1px solid #1E1E1E',
    }}>
      <span style={{ fontSize: '10px', color: '#3a3a3a', width: '18px', flexShrink: 0 }}>{label}</span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
          <span style={{ fontSize: '12px', color: '#D0D0D0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>
            {t.fileName}
          </span>
          <span style={{ fontSize: '11px', color: statusColor, flexShrink: 0, marginLeft: '8px' }}>
            {t.status === 'done' ? 'Done' : t.status === 'error' ? 'Error' : t.status === 'pending' ? 'Pending' : `${pct}%`}
          </span>
        </div>

        {isActive && t.totalBytes > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ flex: 1, height: '2px', background: '#1E1E1E', borderRadius: '1px', overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: '#00D84A', transition: 'width 300ms', borderRadius: '1px' }} />
            </div>
            <span style={{ fontSize: '10px', color: '#6B6B6B', flexShrink: 0, whiteSpace: 'nowrap' }}>
              {formatSpeed(t.speedBps)} · {formatEta(remaining, t.speedBps)}
            </span>
          </div>
        )}

        {t.status === 'error' && t.error && (
          <span style={{ fontSize: '10px', color: '#FF4444' }}>{t.error}</span>
        )}

        {t.status === 'done' && (
          <span
            onClick={onOpenDownloads}
            style={{ fontSize: '10px', color: '#00D84A', cursor: 'pointer', textDecoration: 'underline' }}
          >
            Open folder
          </span>
        )}
      </div>

      <button
        onClick={onDismiss}
        style={{ background: 'none', border: 'none', color: '#3a3a3a', cursor: 'pointer', padding: '2px', flexShrink: 0, display: 'flex', alignItems: 'center' }}
      >
        <XIcon />
      </button>
    </div>
  )
}

export function TransferPanel({ transfers, onDismiss, onOpenDownloads }: Props) {
  if (transfers.length === 0) return null

  const active = transfers.filter(t => t.status === 'active' || t.status === 'pending')

  return (
    <div style={{
      borderTop: '1px solid #1E1E1E',
      background: '#0D0D0D',
      maxHeight: '160px',
      overflowY: 'auto',
      flexShrink: 0,
    }}>
      <div style={{ padding: '6px 16px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '10px', color: '#3a3a3a', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Transfers {active.length > 0 ? `· ${active.length} active` : ''}
        </span>
      </div>
      <div style={{ padding: '0 16px 6px' }}>
        {transfers.map(t => (
          <TransferRow
            key={t.id}
            t={t}
            onDismiss={() => onDismiss(t.id)}
            onOpenDownloads={onOpenDownloads}
          />
        ))}
      </div>
    </div>
  )
}
