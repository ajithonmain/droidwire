/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/renderer/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#0A0A0A',
        surface: '#141414',
        border: '#1E1E1E',
        accent: '#00D84A',
        'accent-dim': '#00D84A20',
        'text-primary': '#F5F5F5',
        'text-muted': '#6B6B6B',
        success: '#00D84A',
        error: '#FF4444',
        warning: '#FF9500',
      },
      fontFamily: {
        sans: ['Inter', 'SF Pro Display', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        component: '8px',
        card: '12px',
        input: '4px',
      },
      spacing: {
        'grid': '4px',
      },
    },
  },
  plugins: [],
}
