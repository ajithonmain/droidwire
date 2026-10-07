import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { getDeviceContext } from '../lib/deviceContext'
import type { BatteryDetail, DeviceDetail, MountInfo, InstalledApp, DuEntry } from '@droidwire/shared'
import { formatSize } from '../lib/format'
import { useTheme } from '../lib/ThemeContext'
import type { Theme } from '../lib/theme'

type ToolsTab = 'info' | 'apps' | 'storage'

interface Props {
  onClose: () => void
  onExportApk: (apkPath: string, fileName: string) => void
}

// ---------------------------------------------------------------------------
// Info tab
// ---------------------------------------------------------------------------

function InfoRow({ label, value, theme }: { label: string; value: string; theme: Theme }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: `1px solid ${theme.border}` }}>
      <span style={{ fontSize: '13px', color: theme.textMuted }}>{label}</span>
      <span style={{ fontSize: '13px', color: theme.textPrimary, fontWeight: 500, textAlign: 'right' }}>{value}</span>
    </div>
  )
}

function InfoTab() {
  const { theme } = useTheme()
  const [battery, setBattery] = useState<BatteryDetail | null>(null)
  const [detail, setDetail] = useState<DeviceDetail | null>(null)
  const [mounts, setMounts] = useState<MountInfo[]>([])
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    const ctx = getDeviceContext() ?? undefined
    Promise.all([
      window.droidwire.batteryDetail(ctx),
      window.droidwire.deviceDetail(ctx),
      window.droidwire.storageDetail(ctx),
    ]).then(([b, d, m]) => {
      if (!alive) return
      setBattery(b)
      setDetail(d)
      setMounts(m)
    }).catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [])

  if (failed) {
    return <div style={{ padding: '24px', fontSize: '13px', color: theme.textMuted }}>Could not read device details - is the phone connected?</div>
  }
  if (!battery || !detail) {
    return <div style={{ padding: '24px', fontSize: '13px', color: theme.textMuted }}>Reading device…</div>
  }

  return (
    <div style={{ padding: '16px 20px', overflowY: 'auto' }}>
      <p style={{ fontSize: '12px', fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '4px 0 4px' }}>Device</p>
      <InfoRow label="Model" value={`${detail.manufacturer} ${detail.model}`.trim() || '-'} theme={theme} />
      <InfoRow label="Android" value={detail.androidVersion ? `${detail.androidVersion} (API ${detail.sdk})` : '-'} theme={theme} />
      <InfoRow label="Build" value={detail.buildId || '-'} theme={theme} />
      <InfoRow label="Serial" value={detail.serial || '-'} theme={theme} />

      <p style={{ fontSize: '12px', fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '18px 0 4px' }}>Battery</p>
      <InfoRow label="Level" value={battery.level >= 0 ? `${battery.level}%` : '-'} theme={theme} />
      <InfoRow label="Status" value={`${battery.status} (${battery.powerSource})`} theme={theme} />
      <InfoRow label="Health" value={battery.health} theme={theme} />
      <InfoRow label="Temperature" value={battery.temperatureC !== null ? `${battery.temperatureC.toFixed(1)} °C` : '-'} theme={theme} />
      <InfoRow label="Voltage" value={battery.voltageMv !== null ? `${(battery.voltageMv / 1000).toFixed(2)} V` : '-'} theme={theme} />
      <InfoRow label="Technology" value={battery.technology ?? '-'} theme={theme} />

      <p style={{ fontSize: '12px', fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '18px 0 8px' }}>Storage</p>
      {mounts.map(m => {
        const pct = Math.round((m.used / m.total) * 100)
        return (
          <div key={m.mount} style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ fontSize: '13px', color: theme.textPrimary, fontWeight: 500 }}>{m.mount}</span>
              <span style={{ fontSize: '12px', color: theme.textMuted }}>
                {formatSize(m.used)} of {formatSize(m.total)} used · {formatSize(m.free)} free
              </span>
            </div>
            <div style={{ height: '5px', background: theme.surfaceHover, borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: pct > 85 ? theme.error : theme.accent, borderRadius: '3px' }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Apps tab
// ---------------------------------------------------------------------------

function AppsTab({ onExportApk }: { onExportApk: (apkPath: string, fileName: string) => void }) {
  const { theme } = useTheme()
  const [apps, setApps] = useState<InstalledApp[] | null>(null)
  const [includeSystem, setIncludeSystem] = useState(false)
  const [query, setQuery] = useState('')
  const [exported, setExported] = useState<Set<string>>(new Set())

  useEffect(() => {
    let alive = true
    setApps(null)
    window.droidwire.listApps(includeSystem, getDeviceContext() ?? undefined)
      .then(a => { if (alive) setApps(a) })
      .catch(() => { if (alive) setApps([]) })
    return () => { alive = false }
  }, [includeSystem])

  const filtered = useMemo(() => {
    if (!apps) return []
    const q = query.toLowerCase()
    return q ? apps.filter(a => a.pkg.toLowerCase().includes(q)) : apps
  }, [apps, query])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '12px 20px 10px' }}>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Filter packages"
          style={{
            flex: 1, height: '28px', boxSizing: 'border-box',
            background: theme.inputBg, border: `1px solid ${theme.border}`,
            borderRadius: '7px', padding: '0 10px', fontSize: '13px',
            color: theme.textPrimary, outline: 'none',
          }}
        />
        <button
          onClick={() => setIncludeSystem(s => !s)}
          style={{
            height: '28px', padding: '0 10px', fontSize: '12px', whiteSpace: 'nowrap',
            background: includeSystem ? theme.accentDim : 'transparent',
            border: `1px solid ${includeSystem ? theme.borderFocus : theme.border}`,
            borderRadius: '7px', color: includeSystem ? theme.accent : theme.textSecondary,
            cursor: 'pointer',
          }}
        >
          {includeSystem ? 'All apps' : 'User apps'}
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 16px' }}>
        {apps === null ? (
          <p style={{ fontSize: '13px', color: theme.textMuted, padding: '12px 0' }}>Loading app list…</p>
        ) : filtered.length === 0 ? (
          <p style={{ fontSize: '13px', color: theme.textMuted, padding: '12px 0' }}>No apps found.</p>
        ) : (
          filtered.map(a => (
            <div key={a.pkg} style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '7px 0', borderBottom: `1px solid ${theme.border}`,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', color: theme.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {a.pkg}
                </div>
                <div style={{ fontSize: '11px', color: theme.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {a.apkPath}
                </div>
              </div>
              <button
                onClick={() => {
                  onExportApk(a.apkPath, `${a.pkg}.apk`)
                  setExported(prev => new Set(prev).add(a.pkg))
                }}
                style={{
                  flexShrink: 0, height: '24px', padding: '0 10px', fontSize: '12px',
                  background: exported.has(a.pkg) ? 'transparent' : theme.accentDim,
                  border: `1px solid ${exported.has(a.pkg) ? theme.border : theme.borderFocus}`,
                  borderRadius: '6px', color: exported.has(a.pkg) ? theme.textMuted : theme.accent,
                  cursor: 'pointer', whiteSpace: 'nowrap',
                }}
              >
                {exported.has(a.pkg) ? 'Queued' : 'Export APK'}
              </button>
            </div>
          ))
        )}
      </div>
      {apps !== null && (
        <div style={{ padding: '8px 20px', borderTop: `1px solid ${theme.border}`, fontSize: '12px', color: theme.textMuted }}>
          {filtered.length} app{filtered.length !== 1 ? 's' : ''} - exports land in the transfers panel
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Storage tab - squarified treemap, drill-down per directory
// ---------------------------------------------------------------------------

interface TreemapRect extends DuEntry {
  x: number
  y: number
  w: number
  h: number
}

function layoutTreemap(items: DuEntry[], width: number, height: number): TreemapRect[] {
  const positive = items.filter(i => i.bytes > 0)
  const total = positive.reduce((s, i) => s + i.bytes, 0)
  if (total <= 0 || width <= 0 || height <= 0) return []
  const scaled = positive.map(i => ({ item: i, area: (i.bytes / total) * width * height }))

  const rects: TreemapRect[] = []
  let x = 0, y = 0, rw = width, rh = height
  let row: typeof scaled = []
  let i = 0

  const worst = (r: typeof scaled, length: number): number => {
    const sum = r.reduce((s, e) => s + e.area, 0)
    const max = Math.max(...r.map(e => e.area))
    const min = Math.min(...r.map(e => e.area))
    const s2 = sum * sum
    const l2 = length * length
    return Math.max((l2 * max) / s2, s2 / (l2 * min))
  }

  const layoutRow = (r: typeof scaled): void => {
    const sum = r.reduce((s, e) => s + e.area, 0)
    if (rw >= rh) {
      const stripW = sum / rh
      let cy = y
      for (const e of r) {
        const ih = e.area / stripW
        rects.push({ ...e.item, x, y: cy, w: stripW, h: ih })
        cy += ih
      }
      x += stripW
      rw -= stripW
    } else {
      const stripH = sum / rw
      let cx = x
      for (const e of r) {
        const iw = e.area / stripH
        rects.push({ ...e.item, x: cx, y, w: iw, h: stripH })
        cx += iw
      }
      y += stripH
      rh -= stripH
    }
  }

  while (i < scaled.length) {
    const length = Math.min(rw, rh)
    if (row.length === 0 || worst([...row, scaled[i]], length) <= worst(row, length)) {
      row.push(scaled[i])
      i++
    } else {
      layoutRow(row)
      row = []
    }
  }
  if (row.length > 0) layoutRow(row)
  return rects
}

const STORAGE_ROOT = '/storage/emulated/0'

function StorageTab() {
  const { theme } = useTheme()
  const [path, setPath] = useState(STORAGE_ROOT)
  const [entries, setEntries] = useState<DuEntry[] | null>(null)
  const [totalBytes, setTotalBytes] = useState(0)
  const [error, setError] = useState<string | null>(null)
  // Cache per path so going back up is instant
  const cacheRef = React.useRef(new Map<string, { entries: DuEntry[]; totalBytes: number }>())

  const load = useCallback((p: string) => {
    setPath(p)
    setError(null)
    const cached = cacheRef.current.get(p)
    if (cached) {
      setEntries(cached.entries)
      setTotalBytes(cached.totalBytes)
      return
    }
    setEntries(null)
    window.droidwire.duChildren(p, getDeviceContext() ?? undefined)
      .then(res => {
        cacheRef.current.set(p, res)
        setEntries(res.entries)
        setTotalBytes(res.totalBytes)
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Scan failed'))
  }, [])

  useEffect(() => { load(STORAGE_ROOT) }, [load])

  const MAP_W = 660
  const MAP_H = 300
  const rects = useMemo(() => entries ? layoutTreemap(entries.slice(0, 40), MAP_W, MAP_H) : [], [entries])

  // Deterministic shade per entry - accent for dirs, muted for the files block
  const fillFor = (r: TreemapRect, idx: number): string => {
    if (!r.isDir) return theme.surfaceHover
    const alphas = [0.55, 0.42, 0.32, 0.25, 0.19, 0.14, 0.10]
    const a = alphas[Math.min(idx, alphas.length - 1)]
    return `rgba(0, 216, 74, ${a})`
  }

  const crumbs = path.startsWith(STORAGE_ROOT)
    ? [STORAGE_ROOT, ...path.slice(STORAGE_ROOT.length).split('/').filter(Boolean)]
    : path.split('/').filter(Boolean)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '12px 20px 8px', flexWrap: 'wrap' }}>
        {crumbs.map((c, i) => {
          const target = i === 0 ? STORAGE_ROOT : STORAGE_ROOT + '/' + crumbs.slice(1, i + 1).join('/')
          const label = i === 0 ? 'Internal Storage' : c
          const isLast = i === crumbs.length - 1
          return (
            <React.Fragment key={target}>
              {i > 0 && <span style={{ fontSize: '12px', color: theme.textMuted }}>/</span>}
              <span
                onClick={() => { if (!isLast) load(target) }}
                style={{
                  fontSize: '13px', fontWeight: isLast ? 600 : 400,
                  color: isLast ? theme.textPrimary : theme.accent,
                  cursor: isLast ? 'default' : 'pointer',
                }}
              >
                {label}
              </span>
            </React.Fragment>
          )
        })}
        <span style={{ flex: 1 }} />
        {entries !== null && (
          <span style={{ fontSize: '12px', color: theme.textMuted }}>{formatSize(totalBytes)} total</span>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 16px' }}>
        {error ? (
          <p style={{ fontSize: '13px', color: theme.error, padding: '12px 0' }}>{error}</p>
        ) : entries === null ? (
          <p style={{ fontSize: '13px', color: theme.textMuted, padding: '12px 0' }}>
            Measuring folder sizes… this can take a while on large folders.
          </p>
        ) : entries.length === 0 ? (
          <p style={{ fontSize: '13px', color: theme.textMuted, padding: '12px 0' }}>Empty folder.</p>
        ) : (
          <>
            <div style={{ position: 'relative', width: `${MAP_W}px`, height: `${MAP_H}px`, maxWidth: '100%', borderRadius: '8px', overflow: 'hidden', border: `1px solid ${theme.border}` }}>
              {rects.map((r, idx) => (
                <div
                  key={r.path + r.name}
                  onClick={() => { if (r.isDir) load(r.path) }}
                  title={`${r.name} - ${formatSize(r.bytes)}`}
                  style={{
                    position: 'absolute',
                    left: `${r.x}px`, top: `${r.y}px`,
                    width: `${Math.max(0, r.w - 1)}px`, height: `${Math.max(0, r.h - 1)}px`,
                    background: fillFor(r, idx),
                    cursor: r.isDir ? 'pointer' : 'default',
                    overflow: 'hidden',
                    boxSizing: 'border-box',
                    padding: '4px 6px',
                  }}
                >
                  {r.w > 60 && r.h > 26 && (
                    <>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: theme.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.name}
                      </div>
                      {r.h > 40 && (
                        <div style={{ fontSize: '10px', color: theme.textSecondary }}>{formatSize(r.bytes)}</div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>

            <div style={{ marginTop: '12px' }}>
              {entries.slice(0, 12).map(e => {
                const pct = totalBytes > 0 ? (e.bytes / totalBytes) * 100 : 0
                return (
                  <div
                    key={e.path + e.name}
                    onClick={() => { if (e.isDir) load(e.path) }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '10px',
                      padding: '5px 0', borderBottom: `1px solid ${theme.border}`,
                      cursor: e.isDir ? 'pointer' : 'default',
                    }}
                  >
                    <span style={{ fontSize: '13px', color: e.isDir ? theme.textPrimary : theme.textMuted, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {e.name}
                    </span>
                    <div style={{ width: '120px', height: '4px', background: theme.surfaceHover, borderRadius: '2px', overflow: 'hidden', flexShrink: 0 }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: theme.accent, borderRadius: '2px' }} />
                    </div>
                    <span style={{ fontSize: '12px', color: theme.textMuted, width: '70px', textAlign: 'right', flexShrink: 0 }}>
                      {formatSize(e.bytes)}
                    </span>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

export function DeviceTools({ onClose, onExportApk }: Props) {
  const { theme } = useTheme()
  const [tab, setTab] = useState<ToolsTab>('info')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const TABS: { id: ToolsTab; label: string }[] = [
    { id: 'info', label: 'Device Info' },
    { id: 'apps', label: 'Apps' },
    { id: 'storage', label: 'Storage' },
  ]

  return (
    <div
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: theme.overlay,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div style={{
        width: '720px', height: '540px', maxWidth: 'calc(100vw - 48px)', maxHeight: 'calc(100vh - 48px)',
        background: theme.surface, border: `1px solid ${theme.border}`,
        borderRadius: '12px', boxShadow: `0 24px 64px ${theme.shadow}`,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 20px', borderBottom: `1px solid ${theme.border}`, gap: '4px' }}>
          <span style={{ fontSize: '14px', fontWeight: 600, color: theme.textPrimary, marginRight: '12px' }}>Device Tools</span>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                height: '26px', padding: '0 12px', fontSize: '13px',
                background: tab === t.id ? theme.accentDim : 'transparent',
                border: `1px solid ${tab === t.id ? theme.borderFocus : 'transparent'}`,
                borderRadius: '7px',
                color: tab === t.id ? theme.accent : theme.textSecondary,
                fontWeight: tab === t.id ? 600 : 400,
                cursor: 'pointer',
              }}
            >
              {t.label}
            </button>
          ))}
          <span style={{ flex: 1 }} />
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: theme.textMuted, cursor: 'pointer', padding: '4px', display: 'flex' }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflowY: tab === 'info' ? 'auto' : 'hidden' }}>
          {tab === 'info' && <InfoTab />}
          {tab === 'apps' && <AppsTab onExportApk={onExportApk} />}
          {tab === 'storage' && <StorageTab />}
        </div>
      </div>
    </div>
  )
}
