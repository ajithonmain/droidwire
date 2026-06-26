import React, { useState, useEffect, useCallback, useRef } from 'react'
import type { FileNode, StorageInfo } from '@droidwire/shared'
import { useDevice } from './hooks/useDevice'
import { useTransfers } from './hooks/useTransfers'
import { listFiles } from './lib/api'
import { formatSize } from './lib/format'
import { ConnectionBadge } from './components/ConnectionBadge'
import { Sidebar } from './components/Sidebar'
import { Breadcrumb } from './components/Breadcrumb'
import { FileGrid } from './components/FileGrid'
import { TransferPanel } from './components/TransferPanel'

export default function App() {
  const { status, device, storage, rescan, onDisconnect } = useDevice()
  const { transfers, download, upload, dismiss, activeCount } = useTransfers(onDisconnect)

  const [currentPath, setCurrentPath] = useState('/')
  const [files, setFiles] = useState<FileNode[]>([])
  const [rootDirs, setRootDirs] = useState<FileNode[]>([])
  const [loading, setLoading] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const loadingPath = useRef<string | null>(null)

  const navigate = useCallback(async (path: string) => {
    if (loadingPath.current === path) return
    loadingPath.current = path
    setLoading(true)
    setCurrentPath(path)
    try {
      const items = await listFiles(path)
      if (loadingPath.current === path) {
        setFiles(items)
        if (path === '/') {
          setRootDirs(items.filter(f => f.type === 'dir'))
        }
      }
    } catch {
      onDisconnect()
    } finally {
      if (loadingPath.current === path) {
        setLoading(false)
        loadingPath.current = null
      }
    }
  }, [onDisconnect])

  useEffect(() => {
    if (status === 'connected') navigate('/')
  }, [status, navigate])

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragOver(false)
    if (status !== 'connected') return
    const droppedFiles = Array.from(e.dataTransfer.files)
    for (const file of droppedFiles) {
      const localPath = (file as File & { path?: string }).path ?? ''
      if (localPath) upload(localPath, file.name, currentPath)
    }
  }

  function handleStorageBar(s: StorageInfo) {
    const pct = Math.round((s.used / s.total) * 100)
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{ width: '80px', height: '3px', background: '#1E1E1E', borderRadius: '2px', overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: pct > 85 ? '#FF4444' : '#00D84A', borderRadius: '2px' }} />
        </div>
        <span style={{ fontSize: '11px', color: '#6B6B6B', whiteSpace: 'nowrap' }}>
          {formatSize(s.free)} free of {formatSize(s.total)}
        </span>
      </div>
    )
  }

  const isConnected = status === 'connected'

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0A0A0A', color: '#F5F5F5' }}
      onDragOver={e => { e.preventDefault(); if (isConnected) setIsDragOver(true) }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
    >
      {/* Title bar */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px 10px 80px',
        borderBottom: '1px solid #1E1E1E',
        flexShrink: 0,
        WebkitAppRegion: 'drag' as React.CSSProperties['WebkitAppRegion'],
      }}>
        <span style={{ fontSize: '13px', fontWeight: 600, letterSpacing: '-0.3px', color: '#F5F5F5' }}>
          Droidwire
        </span>
        <div style={{ WebkitAppRegion: 'no-drag' as React.CSSProperties['WebkitAppRegion'] }}>
          <ConnectionBadge status={status} device={device} onRescan={rescan} />
        </div>
      </header>

      {/* Body */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Sidebar */}
        {isConnected ? (
          <Sidebar currentPath={currentPath} rootDirs={rootDirs} onNavigate={navigate} />
        ) : (
          <aside style={{ width: '180px', flexShrink: 0, borderRight: '1px solid #1E1E1E' }} />
        )}

        {/* Main content */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
          {isConnected && (
            <Breadcrumb path={currentPath} onNavigate={navigate} />
          )}

          {!isConnected ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', color: '#3a3a3a' }}>
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                <rect x="4" y="4" width="40" height="40" rx="8" stroke="#1E1E1E" strokeWidth="2" />
                <path d="M16 24h16M24 16v16" stroke="#2a2a2a" strokeWidth="2" strokeLinecap="round" />
                <circle cx="24" cy="24" r="6" stroke="#2a2a2a" strokeWidth="2" />
              </svg>
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: '14px', color: '#3a3a3a', marginBottom: '6px' }}>
                  {status === 'connecting' || status === 'reconnecting' ? 'Scanning for device...' : 'No device found'}
                </p>
                {status === 'disconnected' && (
                  <p style={{ fontSize: '12px', color: '#2a2a2a' }}>
                    Enable USB tethering on Android, then connect via USB
                  </p>
                )}
              </div>
              {status === 'disconnected' && (
                <button
                  onClick={rescan}
                  style={{
                    fontSize: '12px',
                    color: '#6B6B6B',
                    background: 'none',
                    border: '1px solid #1E1E1E',
                    borderRadius: '6px',
                    padding: '6px 16px',
                    cursor: 'pointer',
                  }}
                >
                  Scan again
                </button>
              )}
            </div>
          ) : (
            <FileGrid
              files={files}
              loading={loading}
              currentPath={currentPath}
              onNavigate={navigate}
              onDownload={file => download(file.path, file.name)}
            />
          )}

          {/* Drag overlay */}
          {isDragOver && (
            <div style={{
              position: 'absolute', inset: 0,
              background: '#00D84A08',
              border: '2px dashed #00D84A40',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
            }}>
              <span style={{ fontSize: '14px', color: '#00D84A80' }}>
                Drop to upload to {currentPath}
              </span>
            </div>
          )}
        </main>
      </div>

      {/* Transfer panel */}
      <TransferPanel
        transfers={transfers}
        onDismiss={dismiss}
        onOpenDownloads={() => window.droidwire.openDownloads()}
      />

      {/* Footer */}
      <footer style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '5px 16px',
        borderTop: '1px solid #1E1E1E',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: '11px', color: '#3a3a3a' }}>
          {isConnected ? `${files.length} item${files.length !== 1 ? 's' : ''}` : ''}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {activeCount > 0 && (
            <span style={{ fontSize: '11px', color: '#00D84A' }}>{activeCount} transferring</span>
          )}
          {storage && handleStorageBar(storage)}
        </div>
      </footer>
    </div>
  )
}
