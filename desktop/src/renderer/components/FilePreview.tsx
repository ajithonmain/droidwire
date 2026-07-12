import { useState, useEffect } from 'react'
import type { FileNode } from '@droidwire/shared'
import type { Theme } from '../lib/theme'
import { useTheme } from '../lib/ThemeContext'
import { formatSize, formatDate } from '../lib/format'

interface Props {
  files: FileNode[]
  onDownload: (file: FileNode) => void
  onDownloadAll: (files: FileNode[]) => void
  onZipDownload?: (file: FileNode) => void
  onClose: () => void
}

function isImage(mime: string | null): boolean {
  return !!mime && mime.startsWith('image/')
}

function isVideo(mime: string | null): boolean {
  return !!mime && mime.startsWith('video/')
}

function isAudio(mime: string | null): boolean {
  return !!mime && mime.startsWith('audio/')
}

function isPdf(mime: string | null): boolean {
  return mime === 'application/pdf'
}

function isText(mime: string | null): boolean {
  if (!mime) return false
  return (
    mime.startsWith('text/') ||
    mime === 'application/json' ||
    mime === 'application/xml' ||
    mime === 'application/javascript' ||
    mime === 'application/x-sh'
  )
}

function TypeBadge({ mimeType, theme, isDir }: { mimeType: string | null; theme: Theme; isDir?: boolean }) {
  const label = isDir ? 'FOLDER' : mimeType ? (mimeType.split('/')[1]?.toUpperCase() ?? 'FILE') : 'FILE'
  const color = isDir ? '#5E9CF5'
    : isImage(mimeType) ? theme.accent
    : isVideo(mimeType) ? theme.warning
    : isAudio(mimeType) ? '#5E9CF5'
    : isPdf(mimeType) ? theme.error
    : isText(mimeType) ? theme.textSecondary
    : theme.textMuted
  return (
    <span style={{
      fontSize: '11px', fontWeight: 700,
      color, background: color + '18',
      border: `1px solid ${color}28`,
      borderRadius: '4px', padding: '2px 6px',
      letterSpacing: '0.4px',
    }}>
      {label}
    </span>
  )
}

function CloseButton({ onClose, theme }: { onClose: () => void; theme: Theme }) {
  return (
    <button
      onClick={onClose}
      style={{ background: 'none', border: 'none', color: theme.textMuted, cursor: 'pointer', padding: '2px', display: 'flex', lineHeight: 1, borderRadius: '4px' }}
      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = theme.textPrimary }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = theme.textMuted }}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    </button>
  )
}

function PlaceholderIcon({ mimeType, theme }: { mimeType: string | null; theme: Theme }) {
  const color = isVideo(mimeType) ? theme.warning
    : isAudio(mimeType) ? '#5E9CF5'
    : theme.textMuted

  if (isVideo(mimeType)) {
    return (
      <svg width="38" height="38" viewBox="0 0 40 40" fill="none">
        <rect x="2" y="6" width="26" height="28" rx="3" stroke={color} strokeWidth="1.5" fill={color} fillOpacity="0.08" />
        <path d="M28 14l10-6v24l-10-6V14Z" stroke={color} strokeWidth="1.5" fill="none" strokeLinejoin="round" />
        <circle cx="11" cy="20" r="3" fill={color} fillOpacity="0.6" />
        <path d="M10 20l2.5 1.5-2.5 1.5V17z" fill={color} />
      </svg>
    )
  }
  if (isAudio(mimeType)) {
    return (
      <svg width="38" height="38" viewBox="0 0 40 40" fill="none">
        <rect x="2" y="2" width="36" height="36" rx="6" stroke={color} strokeWidth="1.5" fill={color} fillOpacity="0.08" />
        <path d="M12 12v16M17 8v24M22 14v12M27 10v20M32 16v8" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    )
  }
  return (
    <svg width="38" height="38" viewBox="0 0 40 40" fill="none">
      <path d="M8 4h16L32 12V36H8V4Z" stroke={theme.textMuted} strokeWidth="1.5" fill="none" strokeLinejoin="round" />
      <path d="M24 4v8h8" stroke={theme.textMuted} strokeWidth="1.5" fill="none" />
      <path d="M14 20h12M14 26h8" stroke={theme.textMuted} strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

function SinglePreview({ file, onDownload, onZipDownload, onClose, theme }: {
  file: FileNode; onDownload: (f: FileNode) => void; onZipDownload?: (f: FileNode) => void; onClose: () => void; theme: Theme
}) {
  const [previewSrc, setPreviewSrc] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [textContent, setTextContent] = useState<string | null>(null)
  const [statInfo, setStatInfo] = useState<{ permissions: string | null; octal: string | null } | null>(null)
  const [videoFrame, setVideoFrame] = useState<string | null>(null)
  const [dirSize, setDirSize] = useState<number | null | 'loading'>(null)

  const isDir = file.type === 'dir'

  useEffect(() => {
    if (!isDir) { setDirSize(null); return }
    let cancelled = false
    setDirSize('loading')
    window.droidwire.dirSize(file.path)
      .then(s => { if (!cancelled) setDirSize(s) })
      .catch(() => { if (!cancelled) setDirSize(null) })
    return () => { cancelled = true }
  }, [file.path, isDir])
  const canFetchPreview = !isDir && (isImage(file.mimeType) || isPdf(file.mimeType) || isAudio(file.mimeType) || isText(file.mimeType)) && file.size <= 25 * 1024 * 1024
  const tooBig = !isDir && !isVideo(file.mimeType) && file.size > 25 * 1024 * 1024

  useEffect(() => {
    setVideoFrame(null)
    if (!isVideo(file.mimeType)) return
    let cancelled = false
    window.droidwire.videoThumb(file.path, file.size)
      .then(r => { if (!cancelled && r) setVideoFrame(r) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [file.path, file.size, file.mimeType])

  useEffect(() => {
    setPreviewSrc(null)
    setTextContent(null)
    setStatInfo(null)
    if (!canFetchPreview) return
    setPreviewLoading(true)
    window.droidwire.previewFile(file.path, file.name)
      .then(async src => {
        setPreviewSrc(src)
        if (isText(file.mimeType) && src) {
          const content = await window.droidwire.readLocalFile(src.replace('file://', ''))
          setTextContent(content)
        }
        setPreviewLoading(false)
      })
      .catch(() => setPreviewLoading(false))
  }, [file.path])

  useEffect(() => {
    window.droidwire.statFile(file.path)
      .then(info => { if (info) setStatInfo(info) })
      .catch(() => {})
  }, [file.path])

  const renderPreviewArea = () => {
    if (tooBig) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
          <PlaceholderIcon mimeType={file.mimeType} theme={theme} />
          <span style={{ fontSize: '11px', color: theme.textMuted, textAlign: 'center', padding: '0 12px' }}>
            Too large to preview
          </span>
        </div>
      )
    }
    if (previewLoading) {
      return <span style={{ fontSize: '11px', color: theme.textMuted }}>Loading...</span>
    }
    if (isImage(file.mimeType)) {
      return previewSrc
        ? <img src={previewSrc} alt={file.name} onError={() => setPreviewSrc(null)} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: '4px' }} />
        : <PlaceholderIcon mimeType={file.mimeType} theme={theme} />
    }
    if (isPdf(file.mimeType)) {
      return previewSrc
        ? <img src={previewSrc} alt={file.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
        : <PlaceholderIcon mimeType={file.mimeType} theme={theme} />
    }
    if (isAudio(file.mimeType)) {
      return previewSrc ? (
        <div style={{ width: '100%', padding: '0 8px' }}>
          <audio
            controls
            src={previewSrc}
            style={{ width: '100%', height: '32px', outline: 'none' }}
          />
        </div>
      ) : <PlaceholderIcon mimeType={file.mimeType} theme={theme} />
    }
    if (isText(file.mimeType)) {
      return textContent !== null ? (
        <div style={{
          width: '100%', height: '100%', overflow: 'auto',
          padding: '8px',
          fontSize: '10px', fontFamily: 'monospace',
          color: theme.textSecondary, lineHeight: 1.5,
          whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          textAlign: 'left',
          userSelect: 'text',
        }}>
          {textContent.slice(0, 3000)}{textContent.length > 3000 ? '\n\n…' : ''}
        </div>
      ) : <PlaceholderIcon mimeType={file.mimeType} theme={theme} />
    }
    return <PlaceholderIcon mimeType={file.mimeType} theme={theme} />
  }

  const previewAreaHeight = isText(file.mimeType) ? '200px' : '160px'

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', borderBottom: `1px solid ${theme.border}` }}>
        <span style={{ fontSize: '11px', fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Preview</span>
        <CloseButton onClose={onClose} theme={theme} />
      </div>

      <div style={{
        height: previewAreaHeight, flexShrink: 0,
        background: theme.bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderBottom: `1px solid ${theme.border}`,
        overflow: 'hidden',
      }}>
        {isDir ? (
          <svg width="44" height="44" viewBox="0 0 40 36" fill="none">
            <path d="M2 6C2 4.343 3.343 3 5 3h9l4 4h17c1.657 0 3 1.343 3 3v20c0 1.657-1.343 3-3 3H5c-1.657 0-3-1.343-3-3V6Z"
              fill="#5E9CF5" fillOpacity="0.25" stroke="#5E9CF5" strokeWidth="1.5" />
          </svg>
        ) : isVideo(file.mimeType) ? (
          videoFrame ? (
            <div style={{ position: 'relative', maxWidth: '100%', maxHeight: '100%', display: 'flex' }}>
              <img src={videoFrame} alt={file.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: '4px' }} />
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <div style={{
                  width: 34, height: 34, borderRadius: '50%', background: 'rgba(0,0,0,0.55)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M4 2.5L11.5 7L4 11.5V2.5Z" fill="#FFFFFF" />
                  </svg>
                </div>
              </div>
            </div>
          ) : (
            <PlaceholderIcon mimeType={file.mimeType} theme={theme} />
          )
        ) : (
          renderPreviewArea()
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
        <p style={{ fontSize: '14px', fontWeight: 600, color: theme.textPrimary, wordBreak: 'break-word', lineHeight: '1.4', marginBottom: '10px' }}>
          {file.name}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <TypeBadge mimeType={file.mimeType} theme={theme} isDir={isDir} />
          {isDir && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
              <span style={{ fontSize: '12px', color: theme.textMuted }}>Kind</span>
              <span style={{ fontSize: '12px', color: theme.textSecondary }}>Folder</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: isDir ? 0 : '4px' }}>
            <span style={{ fontSize: '12px', color: theme.textMuted }}>Size</span>
            <span style={{ fontSize: '12px', color: theme.textSecondary }}>
              {isDir
                ? dirSize === 'loading' ? 'Calculating…' : dirSize !== null ? formatSize(dirSize) : '-'
                : formatSize(file.size)}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12px', color: theme.textMuted }}>Modified</span>
            <span style={{ fontSize: '12px', color: theme.textSecondary }}>{formatDate(file.modified)}</span>
          </div>
          {statInfo?.permissions && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '12px', color: theme.textMuted }}>Permissions</span>
              <span style={{ fontSize: '11px', color: theme.textSecondary, fontFamily: 'monospace' }}>
                {statInfo.octal} {statInfo.permissions}
              </span>
            </div>
          )}
          <div style={{ marginTop: '4px', paddingTop: '8px', borderTop: `1px solid ${theme.border}` }}>
            <span style={{ fontSize: '11px', color: theme.textMuted, display: 'block', marginBottom: '3px' }}>Path</span>
            <span
              data-tip={file.path}
              style={{
                fontSize: '11px', color: theme.textMuted, fontFamily: 'monospace',
                wordBreak: 'break-all', lineHeight: '1.4', display: 'block',
              }}
            >
              {file.path}
            </span>
          </div>
        </div>
      </div>

      <div style={{ padding: '10px 12px', borderTop: `1px solid ${theme.border}` }}>
        <button
          onClick={() => (isDir ? onZipDownload?.(file) : onDownload(file))}
          style={{
            width: '100%', padding: '7px',
            background: theme.accent, border: 'none', borderRadius: '7px',
            color: theme.accentText, fontSize: '14px', fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
          }}
        >
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <path d="M7 2v7M4 6.5L7 9.5l3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M2 11h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          {isDir ? 'Download as ZIP' : 'Download'}
        </button>
      </div>
    </>
  )
}

function BulkPanel({ files, onDownloadAll, onClose, theme }: { files: FileNode[]; onDownloadAll: (files: FileNode[]) => void; onClose: () => void; theme: Theme }) {
  const totalSize = files.reduce((sum, f) => sum + f.size, 0)
  const displayFiles = files.slice(0, 6)
  const overflow = files.length - displayFiles.length

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', borderBottom: `1px solid ${theme.border}` }}>
        <span style={{ fontSize: '11px', fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {files.length} selected
        </span>
        <CloseButton onClose={onClose} theme={theme} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          {displayFiles.map(f => (
            <div key={f.path} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                width: '5px', height: '5px', borderRadius: '50%',
                background: theme.accent, flexShrink: 0,
              }} />
              <span style={{
                fontSize: '12px', color: theme.textSecondary,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {f.name}
              </span>
            </div>
          ))}
          {overflow > 0 && (
            <span style={{ fontSize: '11px', color: theme.textMuted, paddingLeft: '13px' }}>
              +{overflow} more
            </span>
          )}
        </div>

        <div style={{ marginTop: '14px', paddingTop: '10px', borderTop: `1px solid ${theme.border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12px', color: theme.textMuted }}>Total size</span>
            <span style={{ fontSize: '12px', color: theme.textSecondary }}>{formatSize(totalSize)}</span>
          </div>
        </div>
      </div>

      <div style={{ padding: '10px 12px', borderTop: `1px solid ${theme.border}` }}>
        <button
          onClick={() => onDownloadAll(files)}
          style={{
            width: '100%', padding: '7px',
            background: theme.accent, border: 'none', borderRadius: '7px',
            color: theme.accentText, fontSize: '14px', fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
          }}
        >
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <path d="M7 2v7M4 6.5L7 9.5l3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M2 11h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          Download {files.length} files
        </button>
      </div>
    </>
  )
}

export function FilePreview({ files, onDownload, onDownloadAll, onZipDownload, onClose }: Props) {
  const { theme } = useTheme()
  if (files.length === 0) return null

  return (
    <div style={{
      width: '230px', flexShrink: 0,
      boxShadow: `-1px 0 0 ${theme.border}`,
      display: 'flex', flexDirection: 'column',
      background: theme.surface, overflow: 'hidden',
    }}>
      {files.length === 1
        ? <SinglePreview file={files[0]} onDownload={onDownload} onZipDownload={onZipDownload} onClose={onClose} theme={theme} />
        : <BulkPanel files={files} onDownloadAll={onDownloadAll} onClose={onClose} theme={theme} />
      }
    </div>
  )
}
