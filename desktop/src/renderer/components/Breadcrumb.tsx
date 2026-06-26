import React from 'react'

interface Props {
  path: string
  onNavigate: (path: string) => void
}

export function Breadcrumb({ path, onNavigate }: Props) {
  const parts = path.split('/').filter(Boolean)
  const crumbs = [
    { label: 'Storage', path: '/' },
    ...parts.map((part, i) => ({
      label: part,
      path: '/' + parts.slice(0, i + 1).join('/'),
    })),
  ]

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '2px', padding: '8px 16px', borderBottom: '1px solid #1E1E1E', flexShrink: 0 }}>
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1
        return (
          <React.Fragment key={crumb.path}>
            {i > 0 && (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ color: '#3a3a3a', flexShrink: 0 }}>
                <path d="M4.5 2.5L7.5 6L4.5 9.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
            <button
              onClick={() => !isLast && onNavigate(crumb.path)}
              style={{
                fontSize: '12px',
                color: isLast ? '#F5F5F5' : '#6B6B6B',
                background: 'none',
                border: 'none',
                padding: '2px 4px',
                cursor: isLast ? 'default' : 'pointer',
                borderRadius: '3px',
                maxWidth: '160px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => { if (!isLast) (e.currentTarget as HTMLButtonElement).style.color = '#F5F5F5' }}
              onMouseLeave={e => { if (!isLast) (e.currentTarget as HTMLButtonElement).style.color = '#6B6B6B' }}
            >
              {crumb.label}
            </button>
          </React.Fragment>
        )
      })}
    </div>
  )
}
