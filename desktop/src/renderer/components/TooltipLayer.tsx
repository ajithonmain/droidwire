import { useState, useEffect } from 'react'
import { useTheme } from '../lib/ThemeContext'

// Delegated tooltip layer: any element with a data-tip attribute gets a themed
// tooltip. Native title= tooltips are slow and OS-styled, so we don't use them.
export function TooltipLayer() {
  const { theme } = useTheme()
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    let currentEl: HTMLElement | null = null

    const clear = () => {
      if (timer) { clearTimeout(timer); timer = null }
      setTip(null)
    }

    const over = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest?.('[data-tip]') as HTMLElement | null
      if (el === currentEl) return
      currentEl = el
      clear()
      if (!el) return
      timer = setTimeout(() => {
        const text = el.getAttribute('data-tip')
        if (!text) return
        const r = el.getBoundingClientRect()
        const x = Math.max(8, Math.min(r.left + r.width / 2, window.innerWidth - 8))
        setTip({ text, x, y: r.bottom + 7 })
      }, 450)
    }

    document.addEventListener('mouseover', over)
    document.addEventListener('mousedown', clear, true)
    window.addEventListener('blur', clear)
    return () => {
      document.removeEventListener('mouseover', over)
      document.removeEventListener('mousedown', clear, true)
      window.removeEventListener('blur', clear)
      if (timer) clearTimeout(timer)
    }
  }, [])

  if (!tip) return null
  return (
    <div style={{
      position: 'fixed',
      left: tip.x,
      top: tip.y,
      transform: 'translateX(-50%)',
      zIndex: 3000,
      pointerEvents: 'none',
      background: theme.surfaceActive,
      color: theme.textPrimary,
      border: `1px solid ${theme.border}`,
      borderRadius: '6px',
      padding: '4px 9px',
      fontSize: '12px',
      fontWeight: 500,
      whiteSpace: 'nowrap',
      boxShadow: `0 4px 16px ${theme.shadow}`,
      maxWidth: '340px',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    }}>
      {tip.text}
    </div>
  )
}
