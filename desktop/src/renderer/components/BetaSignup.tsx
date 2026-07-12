import React, { useState, useRef, useEffect } from 'react'
import logo from '../assets/logo.png'
import { useTheme } from '../lib/ThemeContext'

interface Props {
  onDone: () => void
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function BetaSignup({ onDone }: Props) {
  const { theme } = useTheme()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  async function submit() {
    const trimmed = email.trim()
    if (!EMAIL_RE.test(trimmed)) {
      setError('Please enter a valid email address')
      return
    }
    setError(null)
    setBusy(true)
    try {
      // Registration is fail-open: if the network is down the main process
      // stores the email locally and re-sends it on a later launch - the
      // returned signup lets us through either way.
      await window.droidwire.registerBeta(trimmed)
      onDone()
    } catch {
      setError('Something went wrong - please try again')
      setBusy(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2000,
      background: theme.bg,
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Frameless window: keep the top strip draggable like the normal titlebar */}
      <div style={{
        height: '44px', flexShrink: 0,
        WebkitAppRegion: 'drag' as React.CSSProperties['WebkitAppRegion'],
      }} />
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: '14px', padding: '24px',
      }}>
        <img src={logo} width="52" height="52" alt="" style={{ display: 'block' }} />
        <span style={{ fontSize: '18px', fontWeight: 600, color: theme.textPrimary, letterSpacing: '0.02em' }}>
          Welcome to the Droidwire beta
        </span>
        <p style={{
          fontSize: '13px', color: theme.textMuted, textAlign: 'center',
          maxWidth: '380px', lineHeight: 1.6, margin: 0,
        }}>
          Leave your email to continue. It identifies you as a beta tester - you'll
          hear about updates and get the early-supporter offer when the paid version
          launches. No spam, never shared, removed on request.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '300px', marginTop: '8px' }}>
          <input
            ref={inputRef}
            type="email"
            value={email}
            placeholder="you@example.com"
            autoComplete="email"
            disabled={busy}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submit() }}
            style={{
              width: '100%', boxSizing: 'border-box',
              background: theme.inputBg, border: `1px solid ${error ? theme.error : theme.border}`,
              borderRadius: '4px', padding: '10px 12px', fontSize: '14px',
              color: theme.textPrimary, outline: 'none',
            }}
          />
          {error && (
            <span style={{ fontSize: '12px', color: theme.error }}>{error}</span>
          )}
          <button
            onClick={submit}
            disabled={busy}
            style={{
              padding: '10px 14px', background: theme.accent, border: 'none',
              borderRadius: '6px', color: theme.accentText, fontSize: '13px',
              fontWeight: 600, cursor: busy ? 'default' : 'pointer',
              opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? 'One moment…' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  )
}
