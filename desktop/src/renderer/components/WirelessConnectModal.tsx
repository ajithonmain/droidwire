import React, { useState, useEffect } from 'react'
import QRCode from 'qrcode'
import { useTheme } from '../lib/ThemeContext'
import type { Theme } from '../lib/theme'

interface Props {
  onConnected: () => void
  onClose: () => void
}

type QrStatus = 'waiting' | 'pairing' | 'connecting' | 'connected' | 'error'

function Field({ label, value, onChange, placeholder, theme, width }: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder: string
  theme: Theme
  width?: string
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', width: width ?? '100%' }}>
      <span style={{ fontSize: '12px', color: theme.textMuted }}>{label}</span>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        style={{
          height: '30px', boxSizing: 'border-box',
          background: theme.inputBg, border: `1px solid ${theme.border}`,
          borderRadius: '7px', padding: '0 10px', fontSize: '13px',
          color: theme.textPrimary, outline: 'none', fontFamily: 'inherit',
        }}
        onFocus={e => { e.currentTarget.style.borderColor = theme.borderFocus }}
        onBlur={e => { e.currentTarget.style.borderColor = theme.border }}
      />
    </label>
  )
}

const STATUS_TEXT: Record<QrStatus, string> = {
  waiting: 'Waiting for the phone to scan…',
  pairing: 'Phone found — pairing…',
  connecting: 'Paired — connecting…',
  connected: 'Connected',
  error: '',
}

export function WirelessConnectModal({ onConnected, onClose }: Props) {
  const { theme } = useTheme()
  const [mode, setMode] = useState<'qr' | 'manual'>('qr')

  // QR flow
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [qrStatus, setQrStatus] = useState<QrStatus>('waiting')
  const [qrError, setQrError] = useState('')
  const [qrNonce, setQrNonce] = useState(0)

  // Manual flow
  const [pairAddr, setPairAddr] = useState('')
  const [pairCode, setPairCode] = useState('')
  const [connectAddr, setConnectAddr] = useState('')
  const [busy, setBusy] = useState<'pair' | 'connect' | null>(null)
  const [msg, setMsg] = useState<{ text: string; kind: 'ok' | 'err' } | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Start/restart the QR pairing session
  useEffect(() => {
    if (mode !== 'qr') return
    let alive = true
    setQrStatus('waiting')
    setQrError('')
    setQrDataUrl(null)
    window.droidwire.qrPairStart().then(text =>
      QRCode.toDataURL(text, { width: 220, margin: 1, color: { dark: '#000000', light: '#FFFFFF' } })
    ).then(url => { if (alive) setQrDataUrl(url) }).catch(() => {
      if (alive) { setQrStatus('error'); setQrError('Could not start QR pairing — try manual entry.') }
    })
    return () => {
      alive = false
      window.droidwire.qrPairStop().catch(() => {})
    }
  }, [mode, qrNonce])

  useEffect(() => {
    return window.droidwire.onWirelessEvent(e => {
      if (mode !== 'qr') return
      if (e.type === 'connected') {
        setQrStatus('connected')
        setTimeout(onConnected, 700)
      } else if (e.type === 'error') {
        setQrStatus('error')
        setQrError(e.message ?? 'Pairing failed')
      } else {
        setQrStatus(e.type as QrStatus)
      }
    })
  }, [mode, onConnected])

  async function doPair() {
    if (!pairAddr.trim() || !pairCode.trim()) return
    setBusy('pair')
    setMsg(null)
    const res = await window.droidwire.adbPair(pairAddr, pairCode)
    setBusy(null)
    setMsg({ text: res.message, kind: res.ok ? 'ok' : 'err' })
    if (res.ok && !connectAddr) {
      // The connect port differs from the pairing port — prefill the IP only
      setConnectAddr(pairAddr.split(':')[0] + ':')
    }
  }

  async function doConnect() {
    if (!connectAddr.trim()) return
    setBusy('connect')
    setMsg(null)
    const res = await window.droidwire.adbConnect(connectAddr)
    setBusy(null)
    setMsg({
      text: res.ok ? res.message : `${res.message} — make sure the device is paired first and the port matches the Wireless debugging screen`,
      kind: res.ok ? 'ok' : 'err',
    })
    if (res.ok) setTimeout(onConnected, 600)
  }

  const btnStyle = (primary: boolean, disabled: boolean): React.CSSProperties => ({
    height: '30px', padding: '0 14px', fontSize: '13px', fontWeight: 600,
    background: primary ? theme.accent : 'transparent',
    border: `1px solid ${primary ? theme.accent : theme.border}`,
    borderRadius: '7px',
    color: primary ? theme.accentText : theme.textSecondary,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    whiteSpace: 'nowrap', alignSelf: 'flex-end',
  })

  const statusColor = qrStatus === 'connected' ? theme.accent : qrStatus === 'error' ? theme.error : theme.textMuted

  return (
    <div
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: theme.overlay,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div style={{
        width: '440px', maxWidth: 'calc(100vw - 48px)',
        background: theme.surface, border: `1px solid ${theme.border}`,
        borderRadius: '12px', boxShadow: `0 24px 64px ${theme.shadow}`,
        padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px',
      }}>
        <div>
          <p style={{ fontSize: '15px', fontWeight: 600, color: theme.textPrimary, marginBottom: '4px' }}>
            Connect over Wi-Fi
          </p>
          <p style={{ fontSize: '12px', color: theme.textMuted, lineHeight: 1.5 }}>
            {mode === 'qr'
              ? 'On the phone (Android 11+): Developer options → Wireless debugging → “Pair device with QR code”, then scan this. Phone and Mac must be on the same network.'
              : 'On the phone: Wireless debugging → “Pair device with pairing code”, then copy the values here.'}
          </p>
        </div>

        {mode === 'qr' ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '236px', height: '236px', borderRadius: '10px',
              background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: `1px solid ${theme.border}`,
            }}>
              {qrDataUrl
                ? <img src={qrDataUrl} width={220} height={220} alt="ADB pairing QR code" style={{ display: 'block' }} />
                : <span style={{ fontSize: '12px', color: '#666' }}>Generating…</span>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minHeight: '20px' }}>
              {(qrStatus === 'waiting' || qrStatus === 'pairing' || qrStatus === 'connecting') && (
                <span style={{
                  width: '7px', height: '7px', borderRadius: '50%', background: theme.accent,
                  animation: 'pulse 1.2s ease-in-out infinite',
                }} />
              )}
              <span style={{ fontSize: '13px', color: statusColor, fontWeight: qrStatus === 'connected' ? 600 : 400 }}>
                {qrStatus === 'error' ? qrError : STATUS_TEXT[qrStatus]}
              </span>
            </div>
            {qrStatus === 'error' && (
              <button onClick={() => setQrNonce(n => n + 1)} style={btnStyle(false, false)}>
                New code
              </button>
            )}
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Step 1 — Pair (first time only)
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Field label="Pairing address" value={pairAddr} onChange={setPairAddr} placeholder="192.168.1.42:37831" theme={theme} />
                <Field label="Code" value={pairCode} onChange={setPairCode} placeholder="123456" theme={theme} width="110px" />
                <button onClick={doPair} disabled={busy !== null} style={btnStyle(false, busy !== null)}>
                  {busy === 'pair' ? 'Pairing…' : 'Pair'}
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Step 2 — Connect
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Field label="IP address and port (shown on the Wireless debugging screen)" value={connectAddr} onChange={setConnectAddr} placeholder="192.168.1.42:40123" theme={theme} />
                <button onClick={doConnect} disabled={busy !== null} style={btnStyle(true, busy !== null)}>
                  {busy === 'connect' ? 'Connecting…' : 'Connect'}
                </button>
              </div>
            </div>

            {msg && (
              <p style={{
                fontSize: '12px', lineHeight: 1.5, margin: 0,
                color: msg.kind === 'ok' ? theme.accent : theme.error,
                wordBreak: 'break-word',
              }}>
                {msg.text}
              </p>
            )}
          </>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            onClick={() => setMode(m => m === 'qr' ? 'manual' : 'qr')}
            style={{
              background: 'none', border: 'none', padding: 0,
              fontSize: '12px', color: theme.accent, cursor: 'pointer', textDecoration: 'underline',
            }}
          >
            {mode === 'qr' ? 'Enter pairing code manually' : 'Pair with QR code instead'}
          </button>
          <button
            onClick={onClose}
            style={{
              height: '28px', padding: '0 12px', fontSize: '13px',
              background: 'transparent', border: `1px solid ${theme.border}`,
              borderRadius: '7px', color: theme.textSecondary, cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
