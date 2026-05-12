// MCPList.tsx — MCP Servers list view
import { useEffect } from 'react'
import { useMCPStore } from '../../stores/useMCPStore'
import { Icon } from '../../components/icons'

interface MCPListProps {
  onOpen: (id: string) => void
  onNew: () => void
}

import type { MCPServer } from '@shared/types'

function scopeLabel(s: MCPServer): { label: string; tone: 'user' | 'project' | 'plugin' } {
  if (s.scope === 'plugin') {
    const name = s.projectPath?.split('/').pop() ?? 'Plugin'
    return { label: name, tone: 'plugin' }
  }
  if (s.scope === 'project') return { label: 'Project', tone: 'project' }
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
      aria-label={enabled ? 'Disable MCP' : 'Enable MCP'}
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
          <h1 className="h1">MCP</h1>
          <div className="sub">
            Plug Claude into your tools. Pick from a catalog, paste a command, or build your own —
            no JSON required.
          </div>
        </div>
        <button className="btn btn-primary" onClick={onNew}>
          <Icon name="plus" size={14} /> Add MCP
        </button>
      </div>

      <div className="list" style={{ ['--cols' as string]: '1fr' }}>
        <div
          className="list-head"
          style={{ gridTemplateColumns: '1fr 120px' }}
        >
          <div>MCP</div>
          <div>Enabled</div>
        </div>

        {hydrated && servers.length === 0 && (
          <div className="empty">
            <h3>No MCPs configured</h3>
            <p>Click + Add to connect one.</p>
            <button className="btn btn-primary" onClick={onNew}>
              <Icon name="plus" size={14} /> Add MCP
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
                  {(() => {
                    const sc = scopeLabel(s)
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
                  {s.scope === 'plugin'
                    ? `Plugin · ${s.transport === 'http' ? 'remote' : 'stdio'}`
                    : (s.template ?? (s.transport === 'http' ? 'Remote (HTTP)' : 'Local command'))}
                </div>
              </div>
            </div>
            <div>
              <EnableToggle
                enabled={s.isEnabled}
                disabled={s.scope === 'plugin'}
                title={
                  s.scope === 'plugin'
                    ? `Bundled by plugin · edit ${s.sourcePath ?? '.mcp.json'} to change`
                    : s.isEnabled
                      ? 'Disable this MCP'
                      : 'Enable this MCP'
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
