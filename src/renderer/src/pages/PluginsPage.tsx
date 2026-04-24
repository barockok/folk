import { useState } from 'react'
import { Icon } from '../components/icons'
import { useUIStore } from '../stores/useUIStore'
import { INITIAL_PLUGINS, UIPlugin } from '../data'

export function PluginsPage() {
  const toast = useUIStore((s) => s.toast)
  const [plugins, setPlugins] = useState<UIPlugin[]>(INITIAL_PLUGINS)

  const toggle = (id: string) =>
    setPlugins((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, status: p.status === 'enabled' ? 'disabled' : 'enabled' } : p
      )
    )

  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <div className="eyebrow" style={{ marginBottom: 8 }}>Extensions</div>
          <h1 className="h1">Plugins</h1>
          <div className="sub">
            Longer-running integrations that run alongside Claude. Manage versions, toggle on/off,
            and grant permissions.
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

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {plugins.map((p) => (
          <div key={p.id} className="plugin-row">
            <div className="plugin-ic">{p.name.slice(0, 2).toUpperCase()}</div>
            <div>
              <div className="plugin-name">
                {p.name}
                {p.status === 'update' && (
                  <span className="badge badge-warn">Update available</span>
                )}
              </div>
              <div className="plugin-desc">{p.desc}</div>
              <div style={{ marginTop: 4 }}>
                <span className="plugin-meta">
                  v{p.ver} · by {p.author}
                </span>
              </div>
            </div>
            <div
              className={'switch' + (p.status === 'enabled' ? ' on' : '')}
              onClick={() => toggle(p.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  toggle(p.id)
                }
              }}
            />
            <button className="btn btn-icon btn-sm btn-plain">
              <Icon name="more" size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
