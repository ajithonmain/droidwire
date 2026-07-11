import { useTheme } from '../lib/ThemeContext'
import logo from '../assets/logo.png'

interface Props {
  onSelect: (type: 'adb' | 'wireless' | 'mtp') => void
}

export function ConnectionTypePicker({ onSelect }: Props) {
  const { theme } = useTheme()

  const ADB_ICON = (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <rect x="9" y="2" width="14" height="22" rx="2" stroke={theme.accent} strokeWidth="1.5" />
      <rect x="12" y="26" width="8" height="2" rx="1" fill={theme.accent} />
      <path d="M6 14h2M24 14h2" stroke={theme.accent} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="12" cy="9" r="1.5" fill={theme.accent} />
      <circle cx="20" cy="9" r="1.5" fill={theme.accent} />
      <path d="M12 13h8" stroke={theme.accent} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )

  const WIFI_ICON = (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <path d="M4 12c6.627-6.627 17.373-6.627 24 0" stroke={theme.accent} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M8 16c4.418-4.418 11.582-4.418 16 0" stroke={theme.accent} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M12 20c2.209-2.209 5.791-2.209 8 0" stroke={theme.accent} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="16" cy="24" r="1.5" fill={theme.accent} />
    </svg>
  )

  const MTP_ICON = (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <path d="M16 6v14M10 14l6 6 6-6" stroke={theme.textMuted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 24h20" stroke={theme.textMuted} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px',
        gap: '28px',
      }}
    >
      <div
        style={{
          width: '64px',
          height: '64px',
          borderRadius: '16px',
          background: theme.accentDim,
          border: `1px solid ${theme.borderFocus}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <img src={logo} width="40" height="40" alt="" style={{ display: 'block' }} />
      </div>

      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: '16px', fontWeight: 600, color: theme.textPrimary, marginBottom: '6px' }}>
          Choose connection type
        </p>
        <p style={{ fontSize: '13px', color: theme.textMuted }}>
          How do you want to connect your Android device?
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', maxWidth: '380px' }}>
        {/* ADB — active */}
        <button
          onClick={() => onSelect('adb')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            padding: '14px 16px',
            background: theme.surface,
            border: `1px solid ${theme.borderFocus}`,
            borderRadius: '10px',
            cursor: 'pointer',
            textAlign: 'left',
            transition: 'border-color 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = theme.accent)}
          onMouseLeave={e => (e.currentTarget.style.borderColor = theme.borderFocus)}
        >
          <div style={{ flexShrink: 0 }}>{ADB_ICON}</div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
              <span style={{ fontSize: '14px', fontWeight: 600, color: theme.textPrimary }}>Connect via ADB</span>
              <span style={{
                fontSize: '11px',
                fontWeight: 700,
                color: theme.accent,
                background: theme.accentDim,
                border: `1px solid ${theme.borderFocus}`,
                borderRadius: '3px',
                padding: '1px 5px',
                letterSpacing: '0.4px',
              }}>
                RECOMMENDED
              </span>
            </div>
            <span style={{ fontSize: '13px', color: theme.textSecondary }}>Wired, fast — requires USB Debugging</span>
          </div>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
            <path d="M5 3l4 4-4 4" stroke={theme.accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {/* WiFi — wireless ADB pairing (Android 11+) */}
        <button
          onClick={() => onSelect('wireless')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            padding: '14px 16px',
            background: theme.surface,
            border: `1px solid ${theme.border}`,
            borderRadius: '10px',
            cursor: 'pointer',
            textAlign: 'left',
            transition: 'border-color 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = theme.accent)}
          onMouseLeave={e => (e.currentTarget.style.borderColor = theme.border)}
        >
          <div style={{ flexShrink: 0 }}>{WIFI_ICON}</div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
              <span style={{ fontSize: '14px', fontWeight: 600, color: theme.textPrimary }}>Connect via Wi-Fi</span>
              <span style={{
                fontSize: '11px',
                fontWeight: 700,
                color: theme.textMuted,
                background: theme.surfaceHover,
                border: `1px solid ${theme.border}`,
                borderRadius: '3px',
                padding: '1px 5px',
                letterSpacing: '0.4px',
              }}>
                ANDROID 11+
              </span>
            </div>
            <span style={{ fontSize: '13px', color: theme.textSecondary }}>Wireless debugging — same network required</span>
          </div>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
            <path d="M5 3l4 4-4 4" stroke={theme.accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {/* MTP — limited features */}
        <button
          onClick={() => onSelect('mtp')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            padding: '14px 16px',
            background: theme.surface,
            border: `1px solid ${theme.border}`,
            borderRadius: '10px',
            cursor: 'pointer',
            textAlign: 'left',
            transition: 'border-color 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = theme.accent)}
          onMouseLeave={e => (e.currentTarget.style.borderColor = theme.border)}
        >
          <div style={{ flexShrink: 0 }}>{MTP_ICON}</div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
              <span style={{ fontSize: '14px', fontWeight: 600, color: theme.textPrimary }}>Connect via MTP</span>
              <span style={{
                fontSize: '11px',
                fontWeight: 700,
                color: '#FF9500',
                background: '#FF950020',
                border: '1px solid #FF950040',
                borderRadius: '3px',
                padding: '1px 5px',
                letterSpacing: '0.4px',
              }}>
                LIMITED
              </span>
            </div>
            <span style={{ fontSize: '13px', color: theme.textSecondary }}>Fallback option — no APK install, no device tools</span>
          </div>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
            <path d="M5 3l4 4-4 4" stroke={theme.accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  )
}
