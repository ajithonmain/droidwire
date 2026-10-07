import type { Diagnostics } from '@droidwire/shared'
import { useTheme } from '../lib/ThemeContext'
import { guideNotices, guideSteps, guideSubtitle, guideTitle, type ConnectionMode, type DeviceIssue } from '../lib/setupGuidance'

interface Props {
  mode: ConnectionMode
  issues: DeviceIssue[]
  diagnostics: Diagnostics | null
  scanning: boolean
  onRescan: () => void
  onBack: () => void
  /** Wireless mode: reopen the pairing dialog */
  onPair?: () => void
}

export function SetupGuide({ mode, issues, diagnostics, scanning, onRescan, onBack, onPair }: Props) {
  const { theme } = useTheme()
  const steps = guideSteps(mode)
  const notices = guideNotices(mode, issues, diagnostics)

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 48px',
        gap: '32px',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <button
          onClick={onBack}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '13px',
            fontWeight: 500,
            color: theme.textMuted,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            marginBottom: '16px',
            padding: 0,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 3L5 7l4 4" stroke={theme.textMuted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back
        </button>
        <p style={{ fontSize: '16px', fontWeight: 600, color: theme.textPrimary, marginBottom: '6px' }}>
          {guideTitle(mode)}
        </p>
        <p style={{ fontSize: '13px', color: theme.textMuted }}>
          {guideSubtitle(mode)}
        </p>
      </div>

      {notices.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', maxWidth: '460px' }}>
          {notices.map(n => (
            <div
              key={n.title}
              role="alert"
              style={{
                padding: '12px 14px',
                background: theme.surface,
                border: `1px solid ${n.tone === 'error' ? theme.error : theme.warning}`,
                borderLeft: `3px solid ${n.tone === 'error' ? theme.error : theme.warning}`,
                borderRadius: '8px',
              }}
            >
              <p style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary, margin: '0 0 4px' }}>{n.title}</p>
              <p style={{ fontSize: '13px', color: theme.textSecondary, lineHeight: '1.5', margin: 0 }}>{n.body}</p>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', width: '100%', maxWidth: '460px' }}>
        {steps.map((step, i) => (
          <div key={step.title}>
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '16px',
                padding: '16px',
                background: theme.surface,
                border: `1px solid ${theme.border}`,
                borderRadius: '8px',
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span
                    style={{
                      fontSize: '12px',
                      fontWeight: 700,
                      color: theme.accent,
                      background: theme.accentDim,
                      border: `1px solid ${theme.borderFocus}`,
                      borderRadius: '4px',
                      padding: '1px 6px',
                      letterSpacing: '0.5px',
                    }}
                  >
                    STEP {i + 1}
                  </span>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: theme.textPrimary }}>
                    {step.title}
                  </span>
                </div>
                <p style={{ fontSize: '13px', color: theme.textSecondary, lineHeight: '1.6', margin: 0 }}>
                  {step.body}
                </p>
              </div>
            </div>
            {i < steps.length - 1 && (
              <div style={{ display: 'flex', justifyContent: 'flex-start', paddingLeft: '34px' }}>
                <div style={{ width: '1px', height: '8px', background: theme.border }} />
              </div>
            )}
          </div>
        ))}
      </div>

      {mode === 'wireless' && onPair && (
        <button
          onClick={onPair}
          style={{
            fontSize: '13px', fontWeight: 600, color: theme.accentText, background: theme.accent,
            border: 'none', borderRadius: '6px', padding: '8px 22px', cursor: 'pointer',
          }}
        >
          Pair a phone
        </button>
      )}

      <button
        onClick={onRescan}
        disabled={scanning}
        style={{
          fontSize: '13px',
          fontWeight: 600,
          color: scanning ? theme.textMuted : theme.textSecondary,
          background: 'none',
          border: `1px solid ${theme.border}`,
          borderRadius: '6px',
          padding: '7px 20px',
          cursor: scanning ? 'default' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}
      >
        {scanning ? (
          <>
            <span style={{
              display: 'inline-block',
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: theme.warning,
              animation: 'pulse 1.2s ease-in-out infinite',
            }} />
            Scanning...
          </>
        ) : (
          'Scan for device'
        )}
      </button>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  )
}
