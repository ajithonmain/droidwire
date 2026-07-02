import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { Theme, darkTheme, lightTheme } from './theme'

type ThemeMode = 'dark' | 'light'

interface ThemeContextValue {
  theme: Theme
  mode: ThemeMode
  toggle: () => void
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: darkTheme,
  mode: 'dark',
  toggle: () => {},
})

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(() => {
    try { return (localStorage.getItem('dw-theme') as ThemeMode) ?? 'dark' } catch { return 'dark' }
  })

  const theme = mode === 'dark' ? darkTheme : lightTheme

  function toggle() {
    setMode(m => {
      const next = m === 'dark' ? 'light' : 'dark'
      localStorage.setItem('dw-theme', next)
      return next
    })
  }

  useEffect(() => {
    document.body.style.background = theme.bg
  }, [theme.bg])

  return (
    <ThemeContext.Provider value={{ theme, mode, toggle }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
