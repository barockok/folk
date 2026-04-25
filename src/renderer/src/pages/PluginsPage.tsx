import { useEffect, useState } from 'react'
import { Icon } from '../components/icons'
import { useUIStore } from '../stores/useUIStore'
import type { DiscoveredPlugin } from '@shared/types'

export function PluginsPage() {
  const toast = useUIStore((s) => s.toast)
  const [plugins, setPlugins] = useState<DiscoveredPlugin[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void window.folk.discover.plugins().then((list) => {
      if (!cancelled) {
        setPlugins(list)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <div className="eyebrow" style={{ marginBottom: 8 }}>Extensions</div>
          <h1 className="h1">Plugins</h1>
          <div className="sub">
            Loaded from <code>~/.claude/plugins/installed_plugins.json</code>.
          </div>
        </div>
        <button
          className="btn"
          onClick={() => toast({ kind: 'info', text: 'Install from file — coming soon' })}
        >
          <Icon name="download" size={13} /> Install from file
        </button>
        <button className="btn btn-primary">
          <Icon name="store" size={13} /> Browse marketplace
        </button>
      </div>

      {loading && <div className="sub">Scanning…</div>}
      {!loading && plugins.length === 0 && (
        <div className="sub">No plugins installed.</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {plugins.map((p) => (
          <div key={p.id} className="plugin-row">
            <div className="plugin-ic">{p.name.slice(0, 2).toUpperCase()}</div>
            <div>
              <div className="plugin-name">
                {p.name}
                {p.scope === 'project' ? (
                  <span className="badge badge-ac">Project</span>
                ) : (
                  <span className="badge">User</span>
                )}
              </div>
              <div className="plugin-desc">{p.description || <em>No description in manifest</em>}</div>
              <div style={{ marginTop: 4 }}>
                <span className="plugin-meta">
                  v{p.version}
                  {p.marketplace ? ` · ${p.marketplace}` : ''}
                  {p.lastUpdated ? ` · updated ${new Date(p.lastUpdated).toLocaleDateString()}` : ''}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
