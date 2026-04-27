import { useEffect, useRef, useState } from 'react'
import { Icon } from './icons'
import { TweaksPanel } from './TweaksPanel'
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
  const collapsed = useUIStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useUIStore((s) => s.toggleSidebar)
  const activeSessionTitle = useSessionStore((s) => {
    if (!s.activeId) return null
    const found = s.sessions.find((x) => x.id === s.activeId)
    return found?.title ?? null
  })

  const [tweaksOpen, setTweaksOpen] = useState(false)
  const tweaksWrapRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!tweaksOpen) return
    const onDown = (e: MouseEvent) => {
      if (!tweaksWrapRef.current) return
      if (!tweaksWrapRef.current.contains(e.target as Node)) setTweaksOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setTweaksOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [tweaksOpen])

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
        <div className="tweaks-wrap" ref={tweaksWrapRef}>
          <button
            className="btn btn-plain btn-icon"
            onClick={() => setTweaksOpen((v) => !v)}
            title="Tweaks"
            aria-label="Open tweaks"
            aria-expanded={tweaksOpen}
            aria-haspopup="true"
          >
            <Icon name="settings" size={14} />
          </button>
          {tweaksOpen && (
            <div className="tweaks-popover" role="dialog" aria-label="Tweaks">
              <TweaksPanel />
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
