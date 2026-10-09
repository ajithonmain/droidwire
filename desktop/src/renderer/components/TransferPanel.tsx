import { useEffect, useRef } from 'react'
import type { TransferProgress } from '@droidwire/shared'
import { formatSpeed, formatEta, formatPercent } from '../lib/format'
import { useTheme } from '../lib/ThemeContext'

interface Props {
  transfers: TransferProgress[]
  onDismiss: (id: string) => void
  onCancel: (id: string) => void
  onPause: (id: string) => void
  onResume: (id: string) => void
  canPause: (t: TransferProgress) => boolean
  onReorder: (id: string, dir: 'up' | 'down') => void
  onRetry: (transfer: TransferProgress) => void
  onOpenDownloads: () => void
  onReveal: (filePath: string) => void
}

function XIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

function TransferRow({ t, onDismiss, onCancel, onPause, onResume, pausable, onReorder, queuePos, queueLen, onRetry, onOpenDownloads, onReveal }: { t: TransferProgress; onDismiss: () => void; onCancel: () => void; onPause: () => void; onResume: () => void; pausable: boolean; onReorder: (dir: 'up' | 'down') => void; queuePos: number; queueLen: number; onRetry: () => void; onOpenDownloads: () => void; onReveal: (path: string) => void }) {
  const { theme } = useTheme()
  const pct = formatPercent(t.transferredBytes, t.totalBytes)
  const remaining = t.totalBytes - t.transferredBytes
  const statusColor = t.status === 'done' ? theme.accent : t.status === 'error' ? theme.error : t.status === 'cancelled' || t.status === 'paused' || t.status === 'cancelling' ? theme.warning : theme.textMuted
  const isActive = t.status === 'active' || t.status === 'pending'
  const label = t.direction === 'download' ? 'DL' : 'UL'

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      padding: '6px 0',
      borderBottom: `1px solid ${theme.border}`,
    }}>
      <span style={{ fontSize: '11px', color: theme.textMuted, width: '18px', flexShrink: 0 }}>{label}</span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
          <span style={{ fontSize: '14px', color: theme.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>
            {t.fileName}
          </span>
          <span style={{ fontSize: '13px', color: statusColor, flexShrink: 0, marginLeft: '8px' }}>
            {t.status === 'done' ? 'Done' : t.status === 'error' ? 'Error' : t.status === 'cancelling' ? 'Cancelling…' : t.status === 'cancelled' ? 'Cancelled' : t.status === 'paused' ? 'Paused' : t.status === 'pending' ? 'Queued' : `${pct}%`}
          </span>
        </div>

        {isActive && t.totalBytes > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ flex: 1, height: '4px', background: theme.border, borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: theme.accent, transition: 'width 300ms', borderRadius: '2px' }} />
            </div>
            <span style={{ fontSize: '12px', color: theme.textMuted, flexShrink: 0, whiteSpace: 'nowrap' }}>
              {formatSpeed(t.speedBps)} · {formatEta(remaining, t.speedBps)}
            </span>
          </div>
        )}

        {isActive && (
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            {t.status === 'pending' && queueLen > 1 && (
              <span style={{ display: 'flex', gap: '4px' }}>
                <button
                  onClick={() => onReorder('up')}
                  disabled={queuePos === 0}
                  data-tip="Run sooner"
                  style={{
                    background: 'none', border: 'none', padding: '1px', display: 'flex',
                    color: queuePos === 0 ? theme.border : theme.textMuted,
                    cursor: queuePos === 0 ? 'default' : 'pointer',
                  }}
                >
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                    <path d="M6 9.5v-7M3 5l3-2.5L9 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <button
                  onClick={() => onReorder('down')}
                  disabled={queuePos === queueLen - 1}
                  data-tip="Run later"
                  style={{
                    background: 'none', border: 'none', padding: '1px', display: 'flex',
                    color: queuePos === queueLen - 1 ? theme.border : theme.textMuted,
                    cursor: queuePos === queueLen - 1 ? 'default' : 'pointer',
                  }}
                >
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                    <path d="M6 2.5v7M3 7l3 2.5L9 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </span>
            )}
            {pausable && (
              <span
                onClick={onPause}
                style={{ fontSize: '12px', color: theme.textMuted, cursor: 'pointer', textDecoration: 'underline' }}
              >
                Pause
              </span>
            )}
            <span
              onClick={onCancel}
              style={{ fontSize: '12px', color: theme.warning, cursor: 'pointer', textDecoration: 'underline' }}
            >
              Cancel
            </span>
          </div>
        )}

        {t.status === 'cancelling' && (
          <span style={{ fontSize: '12px', color: theme.textMuted, lineHeight: 1.4 }}>
            {t.device?.transport === 'mtp'
              ? 'Waiting for the phone to stop the transfer - MTP can take up to two minutes. Keep the cable connected.'
              : 'Stopping the transfer…'}
          </span>
        )}

        {t.status === 'paused' && (
          <div style={{ display: 'flex', gap: '10px' }}>
            <span
              onClick={onResume}
              style={{ fontSize: '12px', color: theme.accent, cursor: 'pointer', textDecoration: 'underline' }}
            >
              Resume
            </span>
            <span
              onClick={onCancel}
              style={{ fontSize: '12px', color: theme.warning, cursor: 'pointer', textDecoration: 'underline' }}
            >
              Cancel
            </span>
          </div>
        )}

        {t.status === 'error' && (
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            {t.error && <span style={{ fontSize: '12px', color: theme.error }}>{t.error}</span>}
            <span
              onClick={onRetry}
              style={{ fontSize: '12px', color: theme.accent, cursor: 'pointer', textDecoration: 'underline', flexShrink: 0 }}
            >
              Retry
            </span>
          </div>
        )}

        {t.status === 'done' && (
          <div style={{ display: 'flex', gap: '10px' }}>
            {t.localPath && t.direction === 'download' && (
              <span
                onClick={() => onReveal(t.localPath!)}
                style={{ fontSize: '12px', color: theme.accent, cursor: 'pointer', textDecoration: 'underline' }}
              >
                Reveal in Finder
              </span>
            )}
            <span
              onClick={onOpenDownloads}
              style={{ fontSize: '12px', color: theme.textMuted, cursor: 'pointer', textDecoration: 'underline' }}
            >
              Open folder
            </span>
          </div>
        )}
      </div>

      {/* A transfer that is still being stopped stays visible until the phone has really let go of it */}
      {t.status !== 'cancelling' && (
        <button
          onClick={onDismiss}
          style={{ background: 'none', border: 'none', color: theme.textMuted, cursor: 'pointer', padding: '2px', flexShrink: 0, display: 'flex', alignItems: 'center' }}
        >
          <XIcon />
        </button>
      )}
    </div>
  )
}

export function TransferPanel({ transfers, onDismiss, onCancel, onPause, onResume, canPause, onReorder, onRetry, onOpenDownloads, onReveal }: Props) {
  const { theme } = useTheme()
  const scheduledRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    for (const t of transfers) {
      if ((t.status === 'done' || t.status === 'cancelled') && !scheduledRef.current.has(t.id)) {
        scheduledRef.current.add(t.id)
        setTimeout(() => {
          onDismiss(t.id)
          scheduledRef.current.delete(t.id)
        }, 5000)
      }
    }
  }, [transfers, onDismiss])

  if (transfers.length === 0) return null

  const active = transfers.filter(t => t.status === 'active' || t.status === 'pending')

  return (
    <div style={{
      borderTop: `1px solid ${theme.border}`,
      background: theme.surface,
      maxHeight: '160px',
      overflowY: 'auto',
      flexShrink: 0,
    }}>
      <div style={{ padding: '6px 16px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '12px', fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Transfers {active.length > 0 ? `· ${active.length} active` : ''}
        </span>
      </div>
      <div style={{ padding: '0 16px 6px' }}>
        {(() => {
          // Queue order = oldest first (array is newest-first)
          const queueIds = transfers.filter(t => t.status === 'pending').map(t => t.id).reverse()
          return transfers.map(t => (
            <TransferRow
              key={t.id}
              t={t}
              onDismiss={() => onDismiss(t.id)}
              onCancel={() => onCancel(t.id)}
              onPause={() => onPause(t.id)}
              onResume={() => onResume(t.id)}
              pausable={canPause(t)}
              onReorder={dir => onReorder(t.id, dir)}
              queuePos={queueIds.indexOf(t.id)}
              queueLen={queueIds.length}
              onRetry={() => onRetry(t)}
              onOpenDownloads={onOpenDownloads}
              onReveal={onReveal}
            />
          ))
        })()}
      </div>
    </div>
  )
}
