// MCPList.tsx — MCP Servers list view
import { useEffect } from 'react'
import { useMCPStore } from '../../stores/useMCPStore'
import { Icon } from '../../components/icons'

interface MCPListProps {
  onOpen: (id: string) => void
  onNew: () => void
}

// The source-path encodes scope: `user`, `project:<path>`, or `plugin:<name>`.
// MCP IDs follow `local:<scope>:<name>` so we can pull a friendly label from
// the id without re-parsing the path.
function localScopeLabel(id: string): { label: string; tone: 'user' | 'project' | 'plugin' } {
  const parts = id.split(':')
  if (parts[1] === 'plugin' && parts[2]) return { label: parts[2], tone: 'plugin' }
  if (parts[1] === 'project') return { label: 'Project', tone: 'project' }
  return { label: 'User', tone: 'user' }
}

function EnableToggle({
  enabled,
  disabled,
  title,
  onChange
}: {
  enabled: boolean
  disabled?: boolean
  title?: string
  onChange: (next: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={enabled ? 'Disable server' : 'Enable server'}
      title={title}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation()
        if (!disabled) onChange(!enabled)
      }}
      className={'toggle' + (enabled ? ' on' : '')}
    >
      <span className="toggle-thumb" />
    </button>
  )
}

export function MCPList({ onOpen, onNew }: MCPListProps) {
  const { servers, hydrated, load, setEnabled } = useMCPStore()

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
          style={{ gridTemplateColumns: '1fr 120px' }}
        >
          <div>Server</div>
          <div>Enabled</div>
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
            style={{ gridTemplateColumns: '1fr 120px' }}
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
                  {s.source === 'local' && (() => {
                    const sc = localScopeLabel(s.id)
                    const cls =
                      sc.tone === 'plugin'
                        ? 'badge badge-magenta'
                        : sc.tone === 'project'
                          ? 'badge badge-ac'
                          : 'badge'
                    return (
                      <span className={cls} title={s.sourcePath ? `from ${s.sourcePath}` : 'Claude Code config'}>
                        {sc.label}
                      </span>
                    )
                  })()}
                </div>
                <div className="row-desc trunc">
                  {s.source === 'local'
                    ? `Claude Code · ${s.transport === 'http' ? 'remote' : 'stdio'}`
                    : (s.template ?? (s.transport === 'http' ? 'Remote (HTTP)' : 'Local command'))}
                </div>
              </div>
            </div>
            <div>
              <EnableToggle
                enabled={s.isEnabled}
                disabled={s.source === 'local'}
                title={
                  s.source === 'local'
                    ? `Managed by Claude Code · edit ${s.sourcePath ?? '~/.claude/.mcp.json'} to change`
                    : s.isEnabled
                      ? 'Disable this server'
                      : 'Enable this server'
                }
                onChange={(next) => void setEnabled(s.id, next)}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
