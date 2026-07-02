import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { MenubarApp } from './components/MenubarApp'
import { ThemeProvider } from './lib/ThemeContext'
import './index.css'

// The tray window loads the same bundle with #menubar — render the mini UI
const isMenubar = window.location.hash.includes('menubar')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      {isMenubar ? <MenubarApp /> : <App />}
    </ThemeProvider>
  </React.StrictMode>
)
