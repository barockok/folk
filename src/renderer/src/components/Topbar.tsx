import { Icon } from './icons'
import { useUIStore } from '../stores/useUIStore'
import { useSessionStore } from '../stores/useSessionStore'
import type { PageKey } from '../stores/useUIStore'

const PAGE_LABELS: Record<PageKey, string> = {
  sessions: 'Sessions',
  mcp: 'MCP Servers',
  skills: 'Skills',
  plugins: 'Plugins',
  marketplace: 'Marketplace',
  model: 'Models',
  keybindings: 'Keybindings',
  profile: 'Profile',
}

export function Topbar() {
  const page = useUIStore((s) => s.page)
  const openCmdk = useUIStore((s) => s.openCmdk)
  const theme = useUIStore((s) => s.theme)
  const setTheme = useUIStore((s) => s.setTheme)
  const density = useUIStore((s) => s.density)
  const setDensity = useUIStore((s) => s.setDensity)
  const collapsed = useUIStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useUIStore((s) => s.toggleSidebar)
  const activeSessionTitle = useSessionStore((s) => {
    if (!s.activeId) return null
    const found = s.sessions.find((x) => x.id === s.activeId)
    return found?.title ?? null
  })

  const crumbs: string[] = ['folk', PAGE_LABELS[page]]
  if (page === 'sessions' && activeSessionTitle) {
    crumbs.push(activeSessionTitle)
  }

  return (
    <header className="topbar">
      <button
        className="sb-toggle"
        onClick={toggleSidebar}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        type="button"
      >
        <Icon name="sidebar" size={14} />
      </button>
      <div className="crumbs">
        {crumbs.map((c, i) => (
          <span key={i} className={i === crumbs.length - 1 ? 'cur' : ''}>
            {i > 0 && <Icon name="chevronRight" size={12} className="sep" />}
            {c}
          </span>
        ))}
      </div>

      <div
        className="cmdk-trigger"
        role="button"
        tabIndex={0}
        aria-label="Search or run a command"
        onClick={openCmdk}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            if (e.key === ' ') e.preventDefault()
            openCmdk()
          }
        }}
      >
        <Icon name="search" size={14} />
        <span>Search or run a command…</span>
        <span className="kbd">⌘K</span>
      </div>

      <div className="tb-actions">
        <button
          className="btn btn-plain btn-icon"
          onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
          title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        >
          <Icon name={theme === 'light' ? 'moon' : 'sun'} size={14} />
        </button>
        <button
          className="btn btn-plain btn-icon"
          onClick={() => setDensity(density === 'compact' ? 'regular' : 'compact')}
          title={`Density: ${density}`}
          aria-label={`Toggle density (currently ${density})`}
        >
          <Icon name="density" size={14} />
        </button>
      </div>
    </header>
  )
}
