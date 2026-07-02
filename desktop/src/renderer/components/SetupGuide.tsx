import { useTheme } from '../lib/ThemeContext'

interface Props {
  scanning: boolean
  onRescan: () => void
  onBack: () => void
}

export function SetupGuide({ scanning, onRescan, onBack }: Props) {
  const { theme } = useTheme()

  const steps = [
    {
      num: 1,
      title: 'Enable Developer Options',
      body: 'On your Android device, go to Settings > About phone. Tap Build number 7 times until you see "You are now a developer".',
      icon: (
        <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
          <rect x="2" y="2" width="32" height="32" rx="6" stroke={theme.border} strokeWidth="1.5" />
          <circle cx="18" cy="14" r="5" stroke={theme.textMuted} strokeWidth="1.5" />
          <path d="M8 28c0-5.523 4.477-10 10-10s10 4.477 10 10" stroke={theme.textMuted} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      num: 2,
      title: 'Enable USB Debugging',
      body: 'Go to Settings > Developer Options and toggle on USB Debugging.',
      icon: (
        <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
          <rect x="8" y="3" width="20" height="30" rx="3" stroke={theme.textMuted} strokeWidth="1.5" />
          <rect x="14" y="28" width="8" height="2" rx="1" fill={theme.textMuted} />
          <path d="M13 12h10M13 16h7M13 20h8" stroke={theme.textMuted} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      num: 3,
      title: 'Connect via USB & Authorize',
      body: 'Plug your Android into this Mac. When prompted on your phone, tap Allow and check "Always allow from this computer".',
      icon: (
        <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
          <path d="M18 4v20M12 18l6 6 6-6" stroke={theme.textMuted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M6 28h24" stroke={theme.textMuted} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      ),
    },
  ]

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
          Connect via ADB
        </p>
        <p style={{ fontSize: '13px', color: theme.textMuted }}>
          Follow these steps to access your device files over USB
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', width: '100%', maxWidth: '460px' }}>
        {steps.map((step, i) => (
          <div key={step.num}>
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
              <div style={{ flexShrink: 0, marginTop: '2px' }}>{step.icon}</div>
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
                    STEP {step.num}
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
