export interface Theme {
  bg: string
  sidebar: string
  surface: string
  surfaceHover: string
  surfaceActive: string
  border: string
  borderFocus: string
  accent: string
  accentDim: string
  accentText: string
  textPrimary: string
  textSecondary: string
  textMuted: string
  error: string
  errorDim: string
  warning: string
  success: string
  inputBg: string
  overlay: string
  shadow: string
}

export const darkTheme: Theme = {
  bg: '#111114',           // main content background
  sidebar: '#0C0C0E',      // noticeably darker sidebar
  surface: '#1C1C20',      // cards, panels - clear step up from bg
  surfaceHover: '#242428', // hover state - visible jump
  surfaceActive: '#2A2A2F',
  border: 'rgba(255,255,255,0.14)',   // visible separation on dark surfaces
  borderFocus: 'rgba(0,216,74,0.40)',
  accent: '#00D84A',
  accentDim: 'rgba(0,216,74,0.12)',
  accentText: '#000000',
  textPrimary: '#F2F2F5',   // near-white, not pure white
  textSecondary: '#B4B4BD', // readable secondary text
  textMuted: '#82828C',     // labels/captions still clearly legible
  error: '#FF3B30',
  errorDim: 'rgba(255,59,48,0.14)',
  warning: '#FF9F0A',
  success: '#00D84A',
  inputBg: 'rgba(255,255,255,0.06)',
  overlay: 'rgba(0,0,0,0.80)',
  shadow: 'rgba(0,0,0,0.70)',
}

export const lightTheme: Theme = {
  bg: '#F0F0F2',
  sidebar: '#E8E8EA',
  surface: '#FFFFFF',
  surfaceHover: '#F5F5F8',
  surfaceActive: '#EBEBEF',
  border: 'rgba(0,0,0,0.10)',
  borderFocus: 'rgba(0,168,50,0.40)',
  accent: '#00A832',
  accentDim: 'rgba(0,168,50,0.10)',
  accentText: '#FFFFFF',
  textPrimary: '#111113',
  textSecondary: '#55555C',
  textMuted: '#9898A0',
  error: '#CC2020',
  errorDim: 'rgba(204,32,32,0.10)',
  warning: '#CC6600',
  success: '#00A832',
  inputBg: 'rgba(0,0,0,0.04)',
  overlay: 'rgba(0,0,0,0.42)',
  shadow: 'rgba(0,0,0,0.14)',
}
