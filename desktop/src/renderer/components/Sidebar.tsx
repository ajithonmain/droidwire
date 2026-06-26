import type { FileNode } from '@droidwire/shared'

const PINNED_DIRS = ['DCIM', 'Download', 'Documents', 'Music', 'Pictures', 'Movies', 'WhatsApp']

interface Props {
  currentPath: string
  rootDirs: FileNode[]
  onNavigate: (path: string) => void
}

function FolderIcon({ color = '#6B6B6B' }: { color?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
      <path d="M1.5 3.5C1.5 2.948 1.948 2.5 2.5 2.5H5.5L6.5 4H11.5C12.052 4 12.5 4.448 12.5 5V10.5C12.5 11.052 12.052 11.5 11.5 11.5H2.5C1.948 11.5 1.5 11.052 1.5 10.5V3.5Z" fill={color} fillOpacity="0.8" />
    </svg>
  )
}

export function Sidebar({ currentPath, rootDirs, onNavigate }: Props) {
  const pinned = PINNED_DIRS
    .map(name => rootDirs.find(d => d.name === name))
    .filter((d): d is FileNode => d !== undefined)

  const others = rootDirs.filter(d => !PINNED_DIRS.includes(d.name))

  function DirItem({ node }: { node: FileNode }) {
    const active = currentPath === node.path || currentPath.startsWith(node.path + '/')
    return (
      <button
        onClick={() => onNavigate(node.path)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '7px',
          width: '100%',
          padding: '5px 8px',
          fontSize: '12px',
          color: active ? '#F5F5F5' : '#6B6B6B',
          background: active ? '#1E1E1E' : 'none',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
          textAlign: 'left',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        <FolderIcon color={active ? '#00D84A' : '#6B6B6B'} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{node.name}</span>
      </button>
    )
  }

  return (
    <aside style={{
      width: '180px',
      flexShrink: 0,
      borderRight: '1px solid #1E1E1E',
      padding: '8px',
      overflowY: 'auto',
      display: 'flex',
      flexDirection: 'column',
      gap: '2px',
    }}>
      <button
        onClick={() => onNavigate('/')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '7px',
          width: '100%',
          padding: '5px 8px',
          fontSize: '12px',
          color: currentPath === '/' ? '#F5F5F5' : '#6B6B6B',
          background: currentPath === '/' ? '#1E1E1E' : 'none',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
          textAlign: 'left',
          marginBottom: '4px',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
          <rect x="1.5" y="1.5" width="11" height="11" rx="2" stroke={currentPath === '/' ? '#00D84A' : '#6B6B6B'} strokeWidth="1.2" fill="none" />
          <path d="M4 7h6M7 4v6" stroke={currentPath === '/' ? '#00D84A' : '#6B6B6B'} strokeWidth="1.2" strokeLinecap="round" />
        </svg>
        Internal Storage
      </button>

      {pinned.length > 0 && (
        <>
          <div style={{ fontSize: '10px', color: '#3a3a3a', padding: '4px 8px 2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Pinned
          </div>
          {pinned.map(node => <DirItem key={node.path} node={node} />)}
        </>
      )}

      {others.length > 0 && (
        <>
          <div style={{ fontSize: '10px', color: '#3a3a3a', padding: '8px 8px 2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            All
          </div>
          {others.map(node => <DirItem key={node.path} node={node} />)}
        </>
      )}
    </aside>
  )
}
