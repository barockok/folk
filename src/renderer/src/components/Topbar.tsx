import { Icon } from './icons'
import { useUIStore } from '../stores/useUIStore'
import { useSessionStore } from '../stores/useSessionStore'
import type { PageKey } from '../stores/useUIStore'

const PAGE_LABELS: Record<PageKey, string> = {
  sessions: 'Sessions',
  mcp: 'MCP',
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
  const collapsed = useUIStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useUIStore((s) => s.toggleSidebar)
  const rightCollapsed = useUIStore((s) => s.rightSidebarCollapsed)
  const toggleRightSidebar = useUIStore((s) => s.toggleRightSidebar)
  const activeSessionTitle = useSessionStore((s) => {
    if (!s.activeId) return null
    const found = s.sessions.find((x) => x.id === s.activeId)
    return found?.title ?? null
  })
  const activeId = useSessionStore((s) => s.activeId)
  const setActive = useSessionStore((s) => s.setActive)
  const popoutIds = useUIStore((s) => s.popoutIds)

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

      <div className="tb-actions">
        <button
          type="button"
          className="btn btn-plain btn-icon cmdk-chip"
          onClick={openCmdk}
          title="Search or run a command"
          aria-label="Open command palette"
        >
          <Icon name="search" size={14} />
          <span className="kbd">⌘K</span>
        </button>
        {page === 'sessions' && activeId && !popoutIds.has(activeId) && (
          <button
            type="button"
            className="btn btn-plain btn-icon"
            onClick={() => { void window.folk.window.popout(activeId); setActive(null) }}
            title="Pop out session"
            aria-label="Pop out session into its own window"
          >
            <Icon name="external" size={14} />
          </button>
        )}
        {page === 'sessions' && (
          <button
            type="button"
            className="btn btn-plain btn-icon"
            onClick={toggleRightSidebar}
            title={rightCollapsed ? 'Show context panel' : 'Hide context panel'}
            aria-label={rightCollapsed ? 'Show context panel' : 'Hide context panel'}
            aria-pressed={!rightCollapsed}
          >
            <Icon name="sidebar" size={14} style={{ transform: 'scaleX(-1)' }} />
          </button>
        )}
      </div>
    </header>
  )
}
