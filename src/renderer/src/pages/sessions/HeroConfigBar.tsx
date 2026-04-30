import { useEffect, useRef, useState } from 'react'
import { Icon } from '../../components/icons'
import { useMCPStore } from '../../stores/useMCPStore'
import type { Session } from '@shared/types'



interface Props {
  session: Session
  onPatch: (patch: Partial<Session>) => void
}

// Hero-stage configuration chips. The session is a renderer-side draft —
// every change routes through `onPatch` which mutates the staged config so
// it survives the eventual `sessions:create` IPC on first send.
export function HeroConfigBar({ session, onPatch }: Props) {
  const [advOpen, setAdvOpen] = useState(false)
  const [mcpOpen, setMcpOpen] = useState(false)
  const mcpServers = useMCPStore((s) => s.servers)
  const eligibleMcps = mcpServers.filter((s) => s.isEnabled)
  const mcpRef = useRef<HTMLDivElement>(null)
  const advRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!mcpOpen) return
    const handler = (e: MouseEvent) => {
      if (mcpRef.current && !mcpRef.current.contains(e.target as Node)) {
        setMcpOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [mcpOpen])

  useEffect(() => {
    if (!advOpen) return
    const handler = (e: MouseEvent) => {
      if (advRef.current && !advRef.current.contains(e.target as Node)) {
        setAdvOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [advOpen])

  async function pickFolder() {
    const picked = await window.folk.dialog.openFolder(session.workingDir || undefined)
    if (picked) onPatch({ workingDir: picked })
  }

  function toggleMcp(id: string) {
    const current = session.enabledMcpIds
    // null sentinel = inherit (all globally-enabled MCPs). Switching to an
    // explicit allowlist initializes from current selection.
    const base = current ?? eligibleMcps.map((s) => s.id)
    const next = base.includes(id) ? base.filter((x) => x !== id) : [...base, id]
    onPatch({ enabledMcpIds: next })
  }

  function setMcpAll() {
    onPatch({ enabledMcpIds: null })
  }
  function setMcpNone() {
    onPatch({ enabledMcpIds: [] })
  }

  const folderName = session.workingDir
    ? session.workingDir.split('/').filter(Boolean).pop() ?? session.workingDir
    : 'Pick folder'
  const mcpLabel =
    session.enabledMcpIds === null
      ? `MCP · all (${eligibleMcps.length})`
      : session.enabledMcpIds.length === 0
        ? 'MCP · none'
        : `MCP · ${session.enabledMcpIds.length}`

  return (
    <div className="hero-cfg">
      <div className="hero-cfg-row">
        <button
          type="button"
          className="hero-chip"
          onClick={pickFolder}
          title={session.workingDir || 'Pick a working folder'}
        >
          <Icon name="folder" size={13} />
          <span className="hero-chip-label">{folderName}</span>
        </button>

        <button
          type="button"
          className={`hero-chip${session.incognito ? ' on' : ''}`}
          onClick={() => onPatch({ incognito: !session.incognito })}
          title="Incognito skips loading user/project/plugin skills"
        >
          <Icon name="eyeOff" size={13} />
          <span className="hero-chip-label">{session.incognito ? 'Incognito on' : 'Incognito'}</span>
        </button>

        {eligibleMcps.length > 0 && (
          <div ref={mcpRef} style={{ position: 'relative' }}>
            <button
              type="button"
              className="hero-chip"
              onClick={() => setMcpOpen((o) => !o)}
            >
              <Icon name="server" size={13} />
              <span className="hero-chip-label">{mcpLabel}</span>
            </button>
            {mcpOpen && (
              <div className="hero-mcp-pop">
                <div className="hero-mcp-head">
                  <button type="button" className="btn btn-plain" onClick={setMcpAll}>
                    All (default)
                  </button>
                  <button type="button" className="btn btn-plain" onClick={setMcpNone}>
                    None
                  </button>
                </div>
                <div className="hero-mcp-list">
                  {eligibleMcps.map((s) => {
                    const checked =
                      session.enabledMcpIds === null ||
                      session.enabledMcpIds.includes(s.id)
                    return (
                      <label key={s.id} className="hero-mcp-row">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleMcp(s.id)}
                        />
                        <span>{s.name}</span>
                      </label>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        <div ref={advRef} style={{ position: 'relative' }}>
          <button
            type="button"
            className={`hero-chip${advOpen ? ' on' : ''}`}
            onClick={() => setAdvOpen((o) => !o)}
          >
            <Icon name="settings" size={13} />
            <span className="hero-chip-label">Advanced</span>
          </button>
          {advOpen && (
            <div className="hero-cfg-adv">
              <label className="hero-adv-field">
                <span className="hero-adv-label">Goal (optional)</span>
                <textarea
                  className="input"
                  rows={2}
                  value={session.goal ?? ''}
                  placeholder="Brief context for what you're working on"
                  onChange={(e) => onPatch({ goal: e.target.value || null })}
                />
              </label>
              <label className="hero-adv-field">
                <span className="hero-adv-label">Extra flags</span>
                <input
                  className="input mono"
                  value={session.flags ?? ''}
                  placeholder="--debug --verbose"
                  onChange={(e) => onPatch({ flags: e.target.value || null })}
                />
              </label>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
