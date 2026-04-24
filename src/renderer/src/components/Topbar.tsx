import { Fragment } from 'react'
import { Icon } from './icons'
import { useUIStore } from '../stores/useUIStore'
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

  const crumbs = ['folk', PAGE_LABELS[page]]

  return (
    <header className="topbar">
      <div className="crumbs">
        {crumbs.map((c, i) => (
          <Fragment key={i}>
            {i > 0 && <Icon name="chevronRight" size={12} className="sep" />}
            <span className={i === crumbs.length - 1 ? 'cur' : ''}>{c}</span>
          </Fragment>
        ))}
      </div>

      <div className="cmdk-trigger" onClick={openCmdk}>
        <Icon name="search" size={14} />
        <span>Search or run a command…</span>
        <span className="kbd">⌘K</span>
      </div>

      <div className="tb-actions">
        <button
          className="btn btn-plain"
          onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
          title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        >
          {theme === 'light' ? '☾' : '☀'}
        </button>
        <button
          className="btn btn-plain"
          onClick={() => setDensity(density === 'compact' ? 'regular' : 'compact')}
          title={`Density: ${density}`}
        >
          {density === 'compact' ? '⊞' : '⊟'}
        </button>
      </div>
    </header>
  )
}
