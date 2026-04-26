import { Icon } from './icons'
import { useUIStore } from '../stores/useUIStore'
import { useProfileStore } from '../stores/useProfileStore'
import type { PageKey } from '../stores/useUIStore'

interface NavItem {
  id: PageKey
  label: string
  icon: string
}

interface NavGroup {
  group: string
  items: NavItem[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    group: 'Workspace',
    items: [
      { id: 'sessions', label: 'Sessions', icon: 'terminal' },
      { id: 'mcp', label: 'MCP Servers', icon: 'server' },
      { id: 'skills', label: 'Skills', icon: 'sparkles' },
      { id: 'plugins', label: 'Plugins', icon: 'puzzle' },
    ],
  },
  {
    group: 'Configure',
    items: [
      { id: 'model', label: 'Models', icon: 'cpu' },
      { id: 'keybindings', label: 'Keybindings', icon: 'keyboard' },
    ],
  },
]

export function Sidebar() {
  const page = useUIStore((s) => s.page)
  const setPage = useUIStore((s) => s.setPage)
  const collapsed = useUIStore((s) => s.sidebarCollapsed)
  const nickname = useProfileStore((s) => s.profile?.nickname)

  const initial = (nickname || 'Y').slice(0, 1).toUpperCase()
  const displayName = nickname || 'You'

  return (
    <aside className={`sb${collapsed ? ' sb-collapsed' : ''}`}>
      <div className="sb-brand">
        <div className="sb-logo" title={collapsed ? 'folk' : undefined}>
          <span>f</span>
        </div>
        {!collapsed && (
          <div className="sb-brand-name" style={{ flex: 1 }}>
            folk
          </div>
        )}
      </div>

      <nav className="sb-nav scroll" aria-label="Main navigation">
        {NAV_GROUPS.map((g) => (
          <div key={g.group}>
            {!collapsed && <div className="sb-group">{g.group}</div>}
            {g.items.map((it) => (
              <div
                key={it.id}
                className={`sb-item${page === it.id ? ' active' : ''}`}
                role="button"
                tabIndex={0}
                aria-current={page === it.id ? 'page' : undefined}
                onClick={() => setPage(it.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    if (e.key === ' ') e.preventDefault()
                    setPage(it.id)
                  }
                }}
                title={collapsed ? it.label : undefined}
              >
                <Icon name={it.icon} size={16} className="sb-ico" />
                {!collapsed && <span>{it.label}</span>}
              </div>
            ))}
          </div>
        ))}
      </nav>

      <div
        className={`sb-profile${page === 'profile' ? ' on' : ''}`}
        role="button"
        tabIndex={0}
        aria-current={page === 'profile' ? 'page' : undefined}
        onClick={() => setPage('profile')}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            if (e.key === ' ') e.preventDefault()
            setPage('profile')
          }
        }}
        title={collapsed ? `${displayName} — profile` : undefined}
      >
        <div className="sb-profile-av">{initial}</div>
        {!collapsed && (
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="sb-profile-name trunc">{displayName}</div>
            <div className="sb-profile-sub trunc">How folk refers to you</div>
          </div>
        )}
        {!collapsed && <Icon name="chevronRight" size={13} className="sb-profile-caret" />}
      </div>
    </aside>
  )
}
