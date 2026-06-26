import React, { useState, useEffect } from 'react'
import type { ConnectionStatus, FileNode } from '@droidwire/shared'
import { TETHERING_SUBNETS, SERVER_PORT, API_ENDPOINTS } from '@droidwire/shared'

export default function App() {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected')
  const [deviceName, setDeviceName] = useState<string>('')
  const [files, setFiles] = useState<FileNode[]>([])
  const [currentPath, setCurrentPath] = useState('/')

  useEffect(() => {
    detectDevice()
  }, [])

  async function detectDevice() {
    setStatus('connecting')
    for (const subnet of TETHERING_SUBNETS) {
      for (let i = 1; i <= 254; i++) {
        const ip = `${subnet}.${i}`
        try {
          const res = await fetch(
            `http://${ip}:${SERVER_PORT}${API_ENDPOINTS.PING}`,
            { signal: AbortSignal.timeout(300) }
          )
          if (res.ok) {
            const data = await res.json()
            setDeviceName(data.device)
            setStatus('connected')
            loadFiles('/', ip)
            return
          }
        } catch {
          // continue scanning
        }
      }
    }
    setStatus('disconnected')
  }

  async function loadFiles(_path: string, _ip?: string) {
    // TODO: implement file listing
    setFiles([])
    setCurrentPath(_path)
  }

  return (
    <div className="flex flex-col h-screen bg-background text-text-primary">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border" style={{ paddingTop: '28px' }}>
        <span className="font-semibold tracking-tight">Droidwire</span>
        <span className="flex items-center gap-2 text-sm text-text-muted">
          {deviceName && <span>{deviceName}</span>}
          <span className={`w-2 h-2 rounded-full ${status === 'connected' ? 'bg-accent' : status === 'connecting' ? 'bg-warning' : 'bg-error'}`} />
          <span className="capitalize">{status}</span>
        </span>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-48 border-r border-border p-3 text-sm text-text-muted flex flex-col gap-1">
          {status !== 'connected' && (
            <span className="text-xs text-text-muted">No device</span>
          )}
        </aside>

        <main className="flex-1 overflow-auto p-4">
          {files.length === 0 && status === 'connected' && (
            <span className="text-text-muted text-sm">Empty folder</span>
          )}
          {status === 'disconnected' && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-text-muted">
              <p className="text-sm">No device detected</p>
              <button
                onClick={detectDevice}
                className="px-3 py-1.5 text-xs border border-border rounded-component hover:border-accent transition-colors"
              >
                Scan again
              </button>
            </div>
          )}
        </main>
      </div>

      <footer className="border-t border-border px-4 py-2 text-xs text-text-muted flex items-center justify-between">
        <span>Drop files here to upload to {currentPath}</span>
        <span>Ready</span>
      </footer>
    </div>
  )
}
