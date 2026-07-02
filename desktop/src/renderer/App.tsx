import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import type { FileNode, StorageInfo } from '@droidwire/shared'
import { useDevice } from './hooks/useDevice'
import { useTransfers } from './hooks/useTransfers'
import { useBookmarks } from './hooks/useBookmarks'
import { listFiles } from './lib/api'
import { formatSize } from './lib/format'
import { ConnectionBadge } from './components/ConnectionBadge'
import { Sidebar } from './components/Sidebar'
import { Breadcrumb } from './components/Breadcrumb'
import { FileGrid, clearFileGridCaches } from './components/FileGrid'
import { TransferPanel } from './components/TransferPanel'
import { SetupGuide } from './components/SetupGuide'
import { ConnectionTypePicker } from './components/ConnectionTypePicker'
import { FilePreview } from './components/FilePreview'
import { Toolbar } from './components/Toolbar'
import { ContextMenu } from './components/ContextMenu'
import { RenameModal } from './components/RenameModal'
import { NewFolderModal } from './components/NewFolderModal'
import { DeleteConfirmModal } from './components/DeleteConfirmModal'
import { UploadModeModal } from './components/UploadModeModal'
import { FileConflictModal } from './components/FileConflictModal'
import type { ConflictChoice, ConflictResolution } from './components/FileConflictModal'
import { TabBar } from './components/TabBar'
import type { Tab } from './components/TabBar'
import { useTheme } from './lib/ThemeContext'
import { TooltipLayer } from './components/TooltipLayer'

type SortField = 'name' | 'size' | 'date' | 'type'
type SortDir = 'asc' | 'desc'
type FilterType = 'all' | 'image' | 'video' | 'audio' | 'doc' | 'other'
type ViewMode = 'list' | 'grid'
type SearchMode = 'local' | 'deep'

export default function App() {
  const { theme, mode, toggle } = useTheme()
  const { status, device, devices, storage, safeToUnplug, disconnect, rescan, selectDevice } = useDevice()
  const [connectionPicked, setConnectionPicked] = useState(false)
  // Branded splash on launch — covers the first device probe so the
  // connection picker doesn't pop in abruptly
  const [booting, setBooting] = useState(true)
  useEffect(() => {
    const t = setTimeout(() => setBooting(false), 1400)
    return () => clearTimeout(t)
  }, [])
  // Setup tutorial only appears if the device hasn't connected within the grace period
  const [guideGraceOver, setGuideGraceOver] = useState(false)
  useEffect(() => {
    if (!connectionPicked || status === 'connected') {
      setGuideGraceOver(false)
      return
    }
    const t = setTimeout(() => setGuideGraceOver(true), 6000)
    return () => clearTimeout(t)
  }, [connectionPicked, status])
  const { transfers, download: rawDownload, upload, cancel, retry, dismiss, activeCount } = useTransfers()
  const { bookmarks, addBookmark, removeBookmark } = useBookmarks()

  const [currentPath, setCurrentPath] = useState('/')
  const currentPathRef = useRef('/')
  const [files, setFiles] = useState<FileNode[]>([])
  const [rootDirs, setRootDirs] = useState<FileNode[]>([])
  const [loading, setLoading] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<FileNode[]>([])
  const loadingPath = useRef<string | null>(null)

  const navHistoryRef = useRef<string[]>([])
  const navIndexRef = useRef(-1)
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)

  const [clipboard, setClipboard] = useState<{ nodes: FileNode[]; mode: 'copy' | 'cut' } | null>(null)

  const [sortField, setSortField] = useState<SortField>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [filterType, setFilterType] = useState<FilterType>('all')
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchMode, setSearchMode] = useState<SearchMode>('local')
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<FileNode[] | null>(null)
  const [contextMenu, setContextMenu] = useState<{ file: FileNode | null; x: number; y: number } | null>(null)
  const [renameTarget, setRenameTarget] = useState<FileNode | null>(null)
  const [deleteTargets, setDeleteTargets] = useState<FileNode[]>([])
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [recentPaths, setRecentPaths] = useState<string[]>([])
  const [downloadDir, setDownloadDirState] = useState('~/Downloads/Droidwire')

  // Drag state
  const draggedNodeRef = useRef<FileNode | null>(null)
  const isDraggingRef = useRef(false)
  const pendingNavAfterDragRef = useRef<string | null>(null)

  // Pending Finder drop — held until user picks Copy or Move
  const [uploadModeFiles, setUploadModeFiles] = useState<{ name: string; localPath: string }[] | null>(null)

  // Pending conflict — held until user picks Replace / Keep Both / Cancel
  const [conflictState, setConflictState] = useState<{
    names: string[]
    showApplyAll?: boolean
    resolve: (r: ConflictResolution) => void
  } | null>(null)

  // Tabs
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeTabId, setActiveTabId] = useState('')
  const activeTabIdRef = useRef('')
  useEffect(() => { activeTabIdRef.current = activeTabId }, [activeTabId])

  const navigateRaw = useCallback(async (navPath: string) => {
    // Always update path refs so handleDrop targets the correct folder
    currentPathRef.current = navPath
    setCurrentPath(navPath)
    setSelectedFiles([])
    setSearchQuery('')
    setSearchResults(null)
    setRecentPaths(prev => {
      const filtered = prev.filter(p => p !== navPath)
      return [navPath, ...filtered].slice(0, 10)
    })

    // During a drag, keep current files mounted (prevents Chromium cancelling the drag)
    // dragend listener will re-navigate once drag ends
    if (isDraggingRef.current) {
      pendingNavAfterDragRef.current = navPath
      return
    }

    if (loadingPath.current === navPath) return
    loadingPath.current = navPath
    setLoading(true)
    try {
      const items = await listFiles(navPath)
      if (loadingPath.current === navPath) {
        setFiles(items)
        if (navPath === '/storage/emulated/0') {
          setRootDirs(items.filter(f => f.type === 'dir'))
        }
      }
    } catch {
      // stay on current path on error
    } finally {
      if (loadingPath.current === navPath) {
        setLoading(false)
        loadingPath.current = null
      }
    }
  }, [])

  const navigate = useCallback(async (navPath: string) => {
    const hist = navHistoryRef.current
    const idx = navIndexRef.current
    navHistoryRef.current = [...hist.slice(0, idx + 1), navPath]
    navIndexRef.current = navHistoryRef.current.length - 1
    setCanGoBack(navIndexRef.current > 0)
    setCanGoForward(false)
    // Update active tab's stored path
    setTabs(prev => prev.map(t => t.id === activeTabIdRef.current ? { ...t, path: navPath } : t))
    await navigateRaw(navPath)
  }, [navigateRaw])

  const goBack = useCallback(async () => {
    if (navIndexRef.current <= 0) return
    navIndexRef.current -= 1
    const path = navHistoryRef.current[navIndexRef.current]
    setCanGoBack(navIndexRef.current > 0)
    setCanGoForward(true)
    await navigateRaw(path)
  }, [navigateRaw])

  const goForward = useCallback(async () => {
    if (navIndexRef.current >= navHistoryRef.current.length - 1) return
    navIndexRef.current += 1
    const path = navHistoryRef.current[navIndexRef.current]
    setCanGoBack(true)
    setCanGoForward(navIndexRef.current < navHistoryRef.current.length - 1)
    await navigateRaw(path)
  }, [navigateRaw])

  // On connect: init first tab
  const prevStatus = useRef(status)
  useEffect(() => {
    if (status === 'connected' && prevStatus.current !== 'connected') {
      setConnectionPicked(true)
      const id = crypto.randomUUID()
      setTabs([{ id, path: '/storage/emulated/0' }])
      setActiveTabId(id)
      activeTabIdRef.current = id
      navHistoryRef.current = []
      navIndexRef.current = -1
      navigate('/storage/emulated/0')
    }
    if (status !== 'connected' && prevStatus.current === 'connected') {
      setTabs([])
      setActiveTabId('')
    }
    prevStatus.current = status
  }, [status, navigate])

  useEffect(() => {
    window.droidwire.getDownloadDir().then(d => setDownloadDirState(d)).catch(() => {})
  }, [])

  useEffect(() => {
    const title = activeCount > 0 ? `Droidwire — ${activeCount} transfer${activeCount !== 1 ? 's' : ''}` : 'Droidwire'
    window.droidwire.setTitle(title).catch(() => {})
  }, [activeCount])

  const refresh = useCallback(() => {
    loadingPath.current = null
    listFiles(currentPath)
      .then(items => {
        setFiles(items)
        if (currentPath === '/storage/emulated/0') setRootDirs(items.filter(f => f.type === 'dir'))
      })
      .catch(() => {})
  }, [currentPath])

  const handleDeepSearch = useCallback(async (query: string) => {
    if (!query) { setSearchResults(null); return }
    setSearching(true)
    try {
      const results = await window.droidwire.findFiles(currentPath, query)
      setSearchResults(results as FileNode[])
    } catch {
      setSearchResults([])
    } finally {
      setSearching(false)
    }
  }, [currentPath])

  useEffect(() => {
    if (searchMode === 'deep' && searchQuery) {
      handleDeepSearch(searchQuery)
    } else if (searchMode === 'local') {
      setSearchResults(null)
    }
  }, [searchMode, searchQuery, handleDeepSearch])

  const displayFiles = useMemo(() => {
    let result = searchResults !== null ? searchResults : files

    if (filterType !== 'all') {
      result = result.filter(f => {
        if (f.type === 'dir') return filterType === 'other'
        const m = f.mimeType ?? ''
        if (filterType === 'image') return m.startsWith('image/')
        if (filterType === 'video') return m.startsWith('video/')
        if (filterType === 'audio') return m.startsWith('audio/')
        if (filterType === 'doc') return m === 'application/pdf' || m.startsWith('text/') || m.includes('word') || m.includes('sheet') || m.includes('presentation')
        return true
      })
    }

    if (searchQuery && searchMode === 'local') {
      result = result.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()))
    }

    result = [...result].sort((a, b) => {
      let cmp = 0
      if (a.type !== b.type) cmp = a.type === 'dir' ? -1 : 1
      else if (sortField === 'name') cmp = a.name.localeCompare(b.name)
      else if (sortField === 'size') cmp = a.size - b.size
      else if (sortField === 'date') cmp = a.modified - b.modified
      else if (sortField === 'type') cmp = (a.mimeType ?? '').localeCompare(b.mimeType ?? '')
      return sortDir === 'asc' ? cmp : -cmp
    })

    return result
  }, [files, searchResults, filterType, searchQuery, searchMode, sortField, sortDir])

  function handleSort(field: SortField) {
    if (field === sortField) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  function handleSearch(q: string) {
    setSearchQuery(q)
    if (!q) {
      setSearchResults(null)
      setSearchMode('local')
    } else if (searchMode === 'deep') {
      handleDeepSearch(q)
    }
  }

  async function handleDelete(filesToDelete: FileNode[]) {
    for (const file of filesToDelete) {
      try {
        await window.droidwire.deleteFile(file.path)
      } catch (e) {
        console.error('Delete failed', e)
      }
    }
    setSelectedFiles([])
    setDeleteTargets([])
    refresh()
  }

  async function handleRename(file: FileNode, newName: string) {
    try {
      const newPath = file.path.replace(/[^/]+$/, newName)
      await window.droidwire.renameFile(file.path, newPath)
      refresh()
    } catch (e) {
      console.error('Rename failed', e)
    } finally {
      setRenameTarget(null)
    }
  }

  async function handleNewFolder(name: string) {
    try {
      const newPath = currentPath.replace(/\/$/, '') + '/' + name
      await window.droidwire.mkdir(newPath)
      refresh()
    } catch (e) {
      console.error('Create folder failed', e)
    } finally {
      setShowNewFolder(false)
    }
  }

  async function handleZipDownload(file: FileNode) {
    try {
      const id = crypto.randomUUID()
      await window.droidwire.zipAndPull(file.path, file.name, id)
    } catch (e) {
      console.error('Zip download failed', e)
    }
  }

  async function handleInstallApk(file: FileNode) {
    try {
      const localPath = await window.droidwire.pullFile(file.path, file.name, crypto.randomUUID())
      await window.droidwire.installApk(localPath)
    } catch (e) {
      console.error('Install APK failed', e)
    }
  }

  async function handlePickDownloadDir() {
    try {
      const dir = await window.droidwire.pickDownloadDir()
      if (dir) {
        await window.droidwire.setDownloadDir(dir)
        setDownloadDirState(dir)
      }
    } catch (e) {
      console.error('Pick download dir failed', e)
    }
  }

  function handleCopyPath(file: FileNode) {
    navigator.clipboard.writeText(file.path).catch(() => {})
  }

  async function handleDeviceScreenshot() {
    try {
      const dest = await window.droidwire.screenshot()
      window.droidwire.showInFinder(dest).catch(() => {})
    } catch (e) {
      console.error('Screenshot failed', e)
    }
  }

  // Context-menu actions apply to the whole selection when the clicked file
  // is part of it, otherwise just to the clicked file (Finder behavior).
  function contextTargets(file: FileNode): FileNode[] {
    return selectedFiles.length > 1 && selectedFiles.some(f => f.path === file.path)
      ? selectedFiles
      : [file]
  }

  function askConflict(names: string[], showApplyAll = false): Promise<ConflictResolution> {
    return new Promise(resolve => {
      setConflictState({ names, showApplyAll, resolve })
    })
  }

  // Serialize downloads through a chain so bulk downloads show one conflict
  // dialog at a time instead of clobbering conflictState. "Do this for all"
  // remembers the choice until the queue drains.
  const downloadChainRef = useRef(Promise.resolve())
  const downloadBatchRef = useRef<{ pending: number; remembered: ConflictChoice | null }>({
    pending: 0, remembered: null,
  })
  function download(remotePath: string, fileName: string) {
    const batch = downloadBatchRef.current
    batch.pending++
    downloadChainRef.current = downloadChainRef.current.then(async () => {
      let destName = fileName
      const check = await window.droidwire.localConflictCheck(fileName)
      if (check.exists) {
        let choice = batch.remembered
        if (!choice) {
          const res = await askConflict([fileName], batch.pending > 1)
          setConflictState(null)
          choice = res.choice
          if (res.applyToAll) batch.remembered = choice
        }
        if (choice === 'cancel') return
        if (choice === 'keep-both') destName = check.uniqueName
      }
      void rawDownload(remotePath, destName)
    }).catch(() => {}).finally(() => {
      batch.pending--
      if (batch.pending <= 0) {
        batch.pending = 0
        batch.remembered = null
      }
    })
  }

  function uniqueDestName(baseName: string, existingNames: Set<string>): string {
    if (!existingNames.has(baseName)) return baseName
    const dot = baseName.lastIndexOf('.')
    const namePart = dot > 0 ? baseName.slice(0, dot) : baseName
    const extPart = dot > 0 ? baseName.slice(dot) : ''
    let n = 2
    while (existingNames.has(`${namePart} (${n})${extPart}`)) n++
    return `${namePart} (${n})${extPart}`
  }

  async function handlePaste() {
    if (!clipboard || clipboard.nodes.length === 0) return
    const dest = currentPathRef.current.replace(/\/$/, '')
    const existingNames = new Set(files.map(f => f.name))

    const conflicting = clipboard.nodes.filter(n => existingNames.has(n.name))
    let choice: ConflictChoice = 'keep-both'
    if (conflicting.length > 0) {
      ;({ choice } = await askConflict(conflicting.map(n => n.name)))
      setConflictState(null)
      if (choice === 'cancel') return
    }

    const usedNames = new Set(existingNames)
    for (const node of clipboard.nodes) {
      const destName = choice === 'replace' ? node.name : uniqueDestName(node.name, usedNames)
      usedNames.add(destName)
      const destPath = dest + '/' + destName
      try {
        if (clipboard.mode === 'copy') {
          await window.droidwire.copyFile(node.path, destPath)
        } else {
          await window.droidwire.renameFile(node.path, destPath)
        }
      } catch (e) {
        console.error('Paste failed', e)
      }
    }
    if (clipboard.mode === 'cut') setClipboard(null)
    refresh()
  }

  // Tab management
  function openInNewTab(path: string) {
    const id = crypto.randomUUID()
    setTabs(prev => [...prev, { id, path }])
    setActiveTabId(id)
    activeTabIdRef.current = id
    navHistoryRef.current = []
    navIndexRef.current = -1
    navigate(path)
  }

  function closeTab(tabId: string) {
    setTabs(prev => {
      const newTabs = prev.filter(t => t.id !== tabId)
      if (activeTabId === tabId && newTabs.length > 0) {
        const newActive = newTabs[newTabs.length - 1]
        setActiveTabId(newActive.id)
        activeTabIdRef.current = newActive.id
        navHistoryRef.current = []
        navIndexRef.current = -1
        navigate(newActive.path)
      }
      return newTabs
    })
  }

  function switchTab(tabId: string) {
    if (tabId === activeTabId) return
    const tab = tabs.find(t => t.id === tabId)
    if (!tab) return
    setActiveTabId(tabId)
    activeTabIdRef.current = tabId
    navHistoryRef.current = []
    navIndexRef.current = -1
    navigate(tab.path)
  }

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
      if (!e.metaKey && !e.ctrlKey) return
      const key = e.key.toLowerCase()
      if (key === 'c' && selectedFiles.length > 0) {
        e.preventDefault()
        setClipboard({ nodes: selectedFiles, mode: 'copy' })
      } else if (key === 'x' && selectedFiles.length > 0) {
        e.preventDefault()
        setClipboard({ nodes: selectedFiles, mode: 'cut' })
      } else if (key === 'v') {
        e.preventDefault()
        handlePaste()
      } else if (key === '[' || e.key === 'ArrowLeft') {
        e.preventDefault()
        goBack()
      } else if (key === ']' || e.key === 'ArrowRight') {
        e.preventDefault()
        goForward()
      } else if (key === 't') {
        e.preventDefault()
        if (status === 'connected') openInNewTab(currentPath)
      } else if (key === 'w') {
        if (tabs.length > 1) {
          e.preventDefault()
          closeTab(activeTabId)
        }
      } else if (key === 'n') {
        e.preventDefault()
        window.droidwire.newWindow().catch(() => {})
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [selectedFiles, clipboard, currentPath, goBack, goForward, status, tabs.length, activeTabId])

  function goUp() {
    const parts = currentPath.split('/').filter(Boolean)
    if (parts.length <= 3) { navigate('/storage/emulated/0'); return }
    parts.pop()
    navigate('/' + parts.join('/'))
  }

  function bookmarkCurrent() {
    const name = currentPath.split('/').filter(Boolean).pop() ?? currentPath
    addBookmark(name, currentPath)
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragOver(false)
    if (status !== 'connected') return

    // Capture native files synchronously before any await
    const nativeFiles = Array.from(e.dataTransfer.files).map(f => ({
      name: f.name,
      localPath: window.droidwire.getPathForFile(f),
    })).filter(f => !!f.localPath)

    // Internal drags are native OS drags now (they carry pulled temp files),
    // so the IPC payload must be checked before assuming a Finder drop.
    if (await consumeInternalDrop(currentPathRef.current)) return

    if (nativeFiles.length > 0) setUploadModeFiles(nativeFiles)
  }

  // Handles a drop of an in-app drag onto any destination folder (file area,
  // tab, sidebar). Returns true if an internal payload was consumed.
  // IPC storage survives source element unmounting (tab switch mid-drag);
  // draggedNodeRef is not reliable because dragend can fire early.
  async function consumeInternalDrop(destPath: string): Promise<boolean> {
    const dest = destPath.replace(/\/$/, '')
    setIsDragOver(false)
    try {
      const raw = await window.droidwire.retrieveDragNode() as { nodes: FileNode[]; ts: number } | null
      // Reject stale IPC nodes older than 10s (leftover from cancelled/errored drags)
      if (!raw || Date.now() - raw.ts > 10_000) return false
      await window.droidwire.storeDragNode(null) // clear after read
      draggedNodeRef.current = null

      // Same-folder drop — sources already there, nothing to do
      const nodes = raw.nodes.filter(n => n.path.substring(0, n.path.lastIndexOf('/')) !== dest)
      if (nodes.length === 0) return true

      const destLabel = dest === '/storage/emulated/0' ? 'Internal Storage' : (dest.split('/').pop() ?? dest)
      const mode = await askInternalMode(nodes.map(n => n.name), destLabel)
      setInternalMoveState(null)
      if (mode === 'cancel') return true

      const destList = dest === currentPathRef.current.replace(/\/$/, '') ? files : await listFiles(dest)
      const existingNames = new Set(destList.map(f => f.name))

      const conflicting = nodes.filter(n => existingNames.has(n.name))
      let choice: ConflictChoice = 'keep-both'
      if (conflicting.length > 0) {
        ;({ choice } = await askConflict(conflicting.map(n => n.name)))
        setConflictState(null)
        if (choice === 'cancel') return true
      }

      pendingNavAfterDragRef.current = null // dragend listener will see no pending nav
      const usedNames = new Set(existingNames)
      for (const node of nodes) {
        const destName = choice === 'replace' ? node.name : uniqueDestName(node.name, usedNames)
        usedNames.add(destName)
        if (mode === 'copy') await window.droidwire.copyFile(node.path, dest + '/' + destName)
        else await window.droidwire.renameFile(node.path, dest + '/' + destName)
      }
      refresh()
      return true
    } catch { return true }
  }

  const [internalMoveState, setInternalMoveState] = useState<{
    names: string[]
    destName: string
    resolve: (m: 'copy' | 'move' | 'cancel') => void
  } | null>(null)
  function askInternalMode(names: string[], destName: string): Promise<'copy' | 'move' | 'cancel'> {
    return new Promise(resolve => setInternalMoveState({ names, destName, resolve }))
  }

  async function executeFinderUpload(localFiles: { name: string; localPath: string }[], moveAfter: boolean) {
    setUploadModeFiles(null)

    const existingNames = new Set(files.map(f => f.name))
    const conflicting = localFiles.filter(f => existingNames.has(f.name))
    let choice: ConflictChoice = 'keep-both'
    if (conflicting.length > 0) {
      ;({ choice } = await askConflict(conflicting.map(f => f.name)))
      setConflictState(null)
      if (choice === 'cancel') return
    }

    const usedNames = new Set(existingNames)
    await Promise.all(localFiles.map(async f => {
      let destName = f.name
      if (choice !== 'replace') {
        destName = uniqueDestName(f.name, usedNames)
        usedNames.add(destName)
      }
      const ok = await upload(f.localPath, currentPathRef.current, destName)
      // Move = delete local only after the push actually succeeded
      if (ok && moveAfter) {
        window.droidwire.deleteLocalFile(f.localPath).catch(() => {})
      }
    }))
    refresh()
  }

  function handleStorageBar(s: StorageInfo) {
    const pct = Math.round((s.used / s.total) * 100)
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{ width: '72px', height: '3px', background: theme.surfaceHover, borderRadius: '2px', overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: pct > 85 ? theme.error : theme.accent, borderRadius: '2px' }} />
        </div>
        <span style={{ fontSize: '11px', color: theme.textMuted, whiteSpace: 'nowrap' }}>
          {formatSize(s.free)} free of {formatSize(s.total)}
        </span>
      </div>
    )
  }

  const isConnected = status === 'connected'
  const isBookmarked = bookmarks.some(b => b.path === currentPath)

  const currentFolderName = (() => {
    const seg = currentPath.split('/').filter(Boolean).pop()
    if (!seg) return 'Device'
    if (seg === '0') return 'Internal Storage'
    return seg
  })()

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: theme.bg, color: theme.textPrimary }}
      onDragOver={e => { e.preventDefault(); if (isConnected) setIsDragOver(true) }}
      onDragLeave={e => {
        if (!e.relatedTarget || !(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
          setIsDragOver(false)
        }
      }}
      onDrop={handleDrop}
    >
      {/* Combined title + nav bar (single row) */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        padding: '0 14px 0 80px',
        height: '44px',
        borderBottom: `1px solid ${theme.border}`,
        flexShrink: 0,
        background: theme.surface,
        WebkitAppRegion: 'drag' as React.CSSProperties['WebkitAppRegion'],
      }}>
        {isConnected ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '2px', WebkitAppRegion: 'no-drag' as React.CSSProperties['WebkitAppRegion'] }}>
              <button
                onClick={goBack}
                disabled={!canGoBack}
                data-tip="Back (⌘[)"
                style={{
                  background: 'none', border: 'none', cursor: canGoBack ? 'pointer' : 'default',
                  color: canGoBack ? theme.textSecondary : theme.textMuted,
                  width: '28px', height: '28px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px',
                  transition: 'color 80ms, background 80ms',
                }}
                onMouseEnter={e => { if (canGoBack) (e.currentTarget as HTMLButtonElement).style.background = theme.surfaceHover }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M10 3L6 8l4 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <button
                onClick={goForward}
                disabled={!canGoForward}
                data-tip="Forward (⌘])"
                style={{
                  background: 'none', border: 'none', cursor: canGoForward ? 'pointer' : 'default',
                  color: canGoForward ? theme.textSecondary : theme.textMuted,
                  width: '28px', height: '28px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px',
                  transition: 'color 80ms, background 80ms',
                }}
                onMouseEnter={e => { if (canGoForward) (e.currentTarget as HTMLButtonElement).style.background = theme.surfaceHover }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M6 3l4 5-4 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>

            <div style={{ width: '1px', height: '16px', background: theme.border, margin: '0 4px', flexShrink: 0 }} />

            <span style={{
              fontSize: '13px', fontWeight: 600, color: theme.textPrimary,
              flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {currentFolderName}
            </span>

            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0, WebkitAppRegion: 'no-drag' as React.CSSProperties['WebkitAppRegion'] }}>
              <button
                onClick={() => window.droidwire.newWindow().catch(() => {})}
                data-tip="New Window (⌘N)"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  width: '28px', height: '28px', padding: 0, color: theme.textMuted,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px',
                  transition: 'color 80ms, background 80ms',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = theme.surfaceHover; (e.currentTarget as HTMLButtonElement).style.color = theme.textSecondary }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; (e.currentTarget as HTMLButtonElement).style.color = theme.textMuted }}
              >
                <svg width="15" height="15" viewBox="0 0 14 14" fill="none">
                  <rect x="1" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2" fill="none"/>
                  <path d="M1 6h12" stroke="currentColor" strokeWidth="1.1" strokeOpacity="0.5"/>
                  <path d="M4 1.5h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
              </button>
              <button
                onClick={handleDeviceScreenshot}
                data-tip="Capture device screenshot"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  width: '28px', height: '28px', padding: 0, color: theme.textMuted,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px',
                  transition: 'color 80ms, background 80ms',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = theme.surfaceHover; (e.currentTarget as HTMLButtonElement).style.color = theme.textSecondary }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; (e.currentTarget as HTMLButtonElement).style.color = theme.textMuted }}
              >
                <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                  <rect x="1.5" y="4" width="12" height="9" rx="2" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M5 4l1-1.5h3L10 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="7.5" cy="8.5" r="2.2" stroke="currentColor" strokeWidth="1.2" />
                </svg>
              </button>
              <button
                onClick={bookmarkCurrent}
                data-tip={isBookmarked ? 'Remove bookmark' : 'Bookmark this folder'}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  width: '28px', height: '28px', padding: 0, color: isBookmarked ? theme.accent : theme.textMuted,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px',
                  transition: 'color 80ms, background 80ms',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = theme.surfaceHover }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
              >
                <svg width="15" height="15" viewBox="0 0 14 14" fill={isBookmarked ? 'currentColor' : 'none'}>
                  <path d="M3.5 2h7v10l-3.5-2.5L3.5 12V2Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </>
        ) : (
          <span style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary, flex: 1 }}>
            Droidwire
          </span>
        )}

        {/* Right side controls — always visible */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, WebkitAppRegion: 'no-drag' as React.CSSProperties['WebkitAppRegion'] }}>
          <button
            onClick={toggle}
            style={{ background: 'none', border: 'none', color: theme.textMuted, cursor: 'pointer', width: '28px', height: '28px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', transition: 'color 80ms, background 80ms' }}
            data-tip={mode === 'dark' ? 'Switch to light' : 'Switch to dark'}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = theme.surfaceHover }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
          >
            {mode === 'dark' ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
                <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.93 4.93l2.12 2.12M16.95 16.95l2.12 2.12M4.93 19.07l2.12-2.12M16.95 7.05l2.12-2.12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <path d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
          <ConnectionBadge
            status={status}
            device={device}
            devices={devices}
            safeToUnplug={safeToUnplug}
            onRescan={rescan}
            onDisconnect={() => {
              disconnect()
              // Back to the connection-type start screen after eject
              setConnectionPicked(false)
            }}
            onSelectDevice={async serial => {
              await selectDevice(serial)
              // Same paths, different phone — drop path-keyed caches and restart at root
              clearFileGridCaches()
              const id = crypto.randomUUID()
              setTabs([{ id, path: '/storage/emulated/0' }])
              setActiveTabId(id)
              activeTabIdRef.current = id
              navHistoryRef.current = []
              navIndexRef.current = -1
              navigate('/storage/emulated/0')
            }}
          />
        </div>
      </header>

      {/* Tab bar — only when 2+ tabs open */}
      {isConnected && tabs.length >= 2 && (
        <TabBar
          tabs={tabs}
          activeTabId={activeTabId}
          onSwitch={switchTab}
          onClose={closeTab}
          onNew={() => openInNewTab(currentPath)}
          onDropOnTab={path => { void consumeInternalDrop(path) }}
        />
      )}

      {/* Body */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Sidebar */}
        {isConnected && (
          <Sidebar
            currentPath={currentPath}
            rootDirs={rootDirs}
            onNavigate={navigate}
            onOpenInNewTab={path => openInNewTab(path)}
            bookmarks={bookmarks}
            onRemoveBookmark={removeBookmark}
            recentPaths={recentPaths}
            onDropOnFolder={path => { void consumeInternalDrop(path) }}
          />
        )}

        {/* Main content */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
          {isConnected && (
            <Toolbar
              filterType={filterType}
              onFilter={setFilterType}
              viewMode={viewMode}
              onViewMode={setViewMode}
              searchQuery={searchQuery}
              onSearch={handleSearch}
              searchMode={searchMode}
              onSearchMode={setSearchMode}
              searching={searching}
              onNewFolder={() => setShowNewFolder(true)}
              downloadDir={downloadDir}
              onPickDownloadDir={handlePickDownloadDir}
              sortField={sortField}
              sortDir={sortDir}
              onSort={handleSort}
            />
          )}

          {!isConnected ? (
            booting ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '14px' }}>
                <svg width="52" height="52" viewBox="0 0 52 52" fill="none">
                  <rect x="14" y="4" width="24" height="44" rx="5" stroke={theme.accent} strokeWidth="2.5" />
                  <path d="M22 42h8" stroke={theme.accent} strokeWidth="2.5" strokeLinecap="round" />
                  <path d="M4 20v12M48 20v12" stroke={theme.textMuted} strokeWidth="2.5" strokeLinecap="round" />
                </svg>
                <span style={{ fontSize: '17px', fontWeight: 600, color: theme.textPrimary, letterSpacing: '0.02em' }}>Droidwire</span>
                <span style={{ fontSize: '12px', color: theme.textMuted }}>Looking for your device…</span>
              </div>
            ) : !connectionPicked ? (
              <ConnectionTypePicker onSelect={() => { setConnectionPicked(true); rescan() }} />
            ) : !guideGraceOver ? (
              // Grace period: a device with USB debugging already on connects in
              // seconds — don't flash the full setup tutorial at it
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                <span style={{ fontSize: '14px', fontWeight: 500, color: theme.textSecondary }}>Connecting to device…</span>
                <span style={{ fontSize: '12px', color: theme.textMuted }}>Plug in your phone if it isn't already</span>
              </div>
            ) : (
              <SetupGuide
                scanning={status === 'connecting' || status === 'reconnecting'}
                onRescan={rescan}
                onBack={() => setConnectionPicked(false)}
              />
            )
          ) : (
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
              <FileGrid
                files={displayFiles}
                loading={loading}
                currentPath={currentPath}
                selectedPaths={new Set(selectedFiles.map(f => f.path))}
                cutPaths={clipboard?.mode === 'cut' ? new Set(clipboard.nodes.map(n => n.path)) : undefined}
                viewMode={viewMode}
                sortField={sortField}
                sortDir={sortDir}
                onSort={handleSort}
                onNavigate={navigate}
                onSelect={(file, multi) => {
                  if (multi) {
                    setSelectedFiles(prev => {
                      const exists = prev.some(f => f.path === file.path)
                      return exists ? prev.filter(f => f.path !== file.path) : [...prev, file]
                    })
                  } else {
                    setSelectedFiles(prev =>
                      prev.length === 1 && prev[0].path === file.path ? [] : [file]
                    )
                  }
                }}
                onRangeSelect={rangeFiles => setSelectedFiles(rangeFiles)}
                onDownload={file => download(file.path, file.name)}
                onContextMenu={(file, x, y) => {
                  // Finder behavior: right-click outside the selection retargets it
                  if (!selectedFiles.some(f => f.path === file.path)) setSelectedFiles([file])
                  setContextMenu({ file, x, y })
                }}
                onEmptyContextMenu={(x, y) => setContextMenu({ file: null, x, y })}
                onDeselectAll={() => setSelectedFiles([])}
                onGoUp={goUp}
                onSelectAll={() => setSelectedFiles(displayFiles)}
                onDeleteSelected={() => setDeleteTargets(selectedFiles)}
                onRefresh={refresh}
                onRenameInline={(file, newName) => handleRename(file, newName)}
                onPreview={file => setSelectedFiles([file])}
                onInternalDragStart={file => {
                  draggedNodeRef.current = file
                  isDraggingRef.current = true
                }}
                onInternalDragEnd={() => {
                  // Fired when the native drag session ends (startDrag resolves) —
                  // HTML5 dragend never fires for OS-level drags.
                  draggedNodeRef.current = null
                  isDraggingRef.current = false
                  setIsDragOver(false)
                  const pending = pendingNavAfterDragRef.current
                  pendingNavAfterDragRef.current = null
                  if (pending) navigateRaw(pending)
                }}
                keyboardDisabled={!!(renameTarget || deleteTargets.length > 0 || showNewFolder || uploadModeFiles || conflictState || contextMenu || internalMoveState)}
              />
              <FilePreview
                files={selectedFiles}
                onDownload={file => download(file.path, file.name)}
                onDownloadAll={previewFiles => previewFiles.forEach(f => download(f.path, f.name))}
                onZipDownload={handleZipDownload}
                onClose={() => setSelectedFiles([])}
              />
            </div>
          )}

          {/* Drag overlay */}
          {isDragOver && (
            <div style={{
              position: 'absolute', inset: 0,
              background: theme.accentDim,
              border: `2px dashed ${theme.borderFocus}`,
              borderRadius: '4px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              pointerEvents: 'none',
            }}>
              <span style={{ fontSize: '14px', color: theme.accent }}>
                Drop to upload to {currentPath}
              </span>
            </div>
          )}
        </main>
      </div>

      {/* Path bar — Finder style, bottom of content */}
      {isConnected && (
        <div style={{
          borderTop: `1px solid ${theme.border}`,
          padding: '4px 14px',
          flexShrink: 0,
          background: theme.surface,
        }}>
          <Breadcrumb path={currentPath} onNavigate={navigate} compact />
        </div>
      )}

      {/* Transfer panel */}
      <TransferPanel
        transfers={transfers}
        onDismiss={dismiss}
        onCancel={cancel}
        onRetry={retry}
        onOpenDownloads={() => window.droidwire.openDownloads()}
        onReveal={(filePath) => window.droidwire.showInFinder(filePath)}
      />

      {/* Footer */}
      <footer style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '4px 16px',
        borderTop: `1px solid ${theme.border}`,
        flexShrink: 0,
        background: theme.surface,
      }}>
        <span style={{ fontSize: '12px', color: theme.textMuted }}>
          {isConnected
            ? selectedFiles.length > 0
              ? (() => {
                  const totalBytes = selectedFiles.reduce((s, f) => s + f.size, 0)
                  return `${selectedFiles.length} selected${totalBytes > 0 ? ` — ${formatSize(totalBytes)}` : ''}`
                })()
              : `${displayFiles.length} item${displayFiles.length !== 1 ? 's' : ''}`
            : ''}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {activeCount > 0 && (
            <span style={{ fontSize: '11px', color: theme.accent }}>{activeCount} transferring</span>
          )}
          {storage && handleStorageBar(storage)}
        </div>
      </footer>

      {/* Overlays */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          file={contextMenu.file}
          onClose={() => setContextMenu(null)}
          onDownload={file => {
            contextTargets(file).filter(f => f.type === 'file').forEach(f => download(f.path, f.name))
          }}
          downloadCount={contextMenu.file ? contextTargets(contextMenu.file).filter(f => f.type === 'file').length : 0}
          onDelete={file => setDeleteTargets(contextTargets(file))}
          onRename={file => setRenameTarget(file)}
          onCopyPath={handleCopyPath}
          onNewFolder={() => setShowNewFolder(true)}
          onZipDownload={handleZipDownload}
          onInstallApk={handleInstallApk}
          onOpenInNewTab={contextMenu.file?.type === 'dir' ? file => openInNewTab(file.path) : undefined}
          onSelectAll={() => setSelectedFiles(displayFiles)}
          onRefresh={refresh}
          onCopy={file => setClipboard({ nodes: contextTargets(file), mode: 'copy' })}
          onCut={file => setClipboard({ nodes: contextTargets(file), mode: 'cut' })}
          onPaste={handlePaste}
          hasClipboard={!!clipboard && clipboard.nodes.length > 0}
        />
      )}

      {renameTarget && (
        <RenameModal
          file={renameTarget}
          onConfirm={newName => { if (renameTarget) handleRename(renameTarget, newName) }}
          onClose={() => setRenameTarget(null)}
        />
      )}

      {showNewFolder && (
        <NewFolderModal
          currentPath={currentPath}
          onConfirm={handleNewFolder}
          onClose={() => setShowNewFolder(false)}
        />
      )}

      {deleteTargets.length > 0 && (
        <DeleteConfirmModal
          files={deleteTargets}
          onConfirm={() => handleDelete(deleteTargets)}
          onClose={() => setDeleteTargets([])}
        />
      )}

      {uploadModeFiles && (
        <UploadModeModal
          fileNames={uploadModeFiles.map(f => f.name)}
          onCopy={() => executeFinderUpload(uploadModeFiles, false)}
          onMove={() => executeFinderUpload(uploadModeFiles, true)}
          onCancel={() => setUploadModeFiles(null)}
        />
      )}

      {internalMoveState && (
        <UploadModeModal
          variant="onDevice"
          fileNames={internalMoveState.names}
          destName={internalMoveState.destName}
          onCopy={() => internalMoveState.resolve('copy')}
          onMove={() => internalMoveState.resolve('move')}
          onCancel={() => internalMoveState.resolve('cancel')}
        />
      )}

      {conflictState && (
        <FileConflictModal
          conflictNames={conflictState.names}
          showApplyAll={conflictState.showApplyAll}
          onResolve={conflictState.resolve}
        />
      )}

      <TooltipLayer />
    </div>
  )
}
