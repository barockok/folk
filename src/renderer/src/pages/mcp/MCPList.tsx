// MCPList.tsx — MCP Servers list view
import { useEffect } from 'react'
import { useMCPStore } from '../../stores/useMCPStore'
import { Icon } from '../../components/icons'

interface MCPListProps {
  onOpen: (id: string) => void
  onNew: () => void
}

function relativeTime(ms: number): string {
  const diff = Date.now() - ms
  const mins = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days = Math.floor(diff / 86_400_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}

function StatusPill({ status }: { status: 'running' | 'stopped' | 'error' }) {
  if (status === 'running')
    return (
      <span className="badge badge-ok">
        <span className="dot dot-ok" />
        Running
      </span>
    )
  if (status === 'error')
    return (
      <span className="badge badge-err">
        <span className="dot dot-err" />
        Error
      </span>
    )
  return (
    <span className="badge">
      <span className="dot dot-idle" />
      Stopped
    </span>
  )
}

export function MCPList({ onOpen, onNew }: MCPListProps) {
  const { servers, hydrated, load } = useMCPStore()

  useEffect(() => {
    if (!hydrated) load()
  }, [hydrated, load])

  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            Tools
          </div>
          <h1 className="h1">MCP Servers</h1>
          <div className="sub">
            Plug Claude into your tools. Pick from a catalog, paste a command, or build your own —
            no JSON required.
          </div>
        </div>
        <button className="btn btn-primary" onClick={onNew}>
          <Icon name="plus" size={14} /> Add server
        </button>
      </div>

      <div className="list" style={{ ['--cols' as string]: '1fr' }}>
        <div
          className="list-head"
          style={{ gridTemplateColumns: '1fr 100px 120px 120px' }}
        >
          <div>Server</div>
          <div>Tools</div>
          <div>Added</div>
          <div>Status</div>
        </div>

        {hydrated && servers.length === 0 && (
          <div className="empty">
            <h3>No MCP servers configured</h3>
            <p>Click + Add to connect one.</p>
            <button className="btn btn-primary" onClick={onNew}>
              <Icon name="plus" size={14} /> Add server
            </button>
          </div>
        )}

        {servers.map((s) => (
          <div
            key={s.id}
            className="list-row"
            style={{ gridTemplateColumns: '1fr 100px 120px 120px' }}
            role="button"
            tabIndex={0}
            onClick={() => onOpen(s.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onOpen(s.id)
              }
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
              <div className="row-ico mk-ic-mcp">
                <Icon name="server" size={14} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="row-title">
                  <span className="trunc">{s.name}</span>
                  {!s.isEnabled && <span className="badge">Off</span>}
                </div>
                <div className="row-desc trunc">
                  {s.template ?? (s.transport === 'http' ? 'Remote (HTTP)' : 'Local command')}
                </div>
              </div>
            </div>
            <div className="tnum" style={{ fontSize: 13, color: 'var(--body)' }}>
              {s.toolCount != null ? s.toolCount : '—'}
            </div>
            <div style={{ fontSize: 13, color: 'var(--body)' }}>
              {relativeTime(s.createdAt)}
            </div>
            <div>
              <StatusPill status={s.status} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
