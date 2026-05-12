import { useEffect, useRef, useState } from 'react'
import type { MCPServer } from '@shared/types'

interface Props {
  enabledMcpIds: string[] | null
  eligibleMcps: MCPServer[]
  onChange: (next: string[] | null) => void
  // Optional label override. Defaults to `MCP …`.
  labelPrefix?: string
}

// Shared MCP allowlist picker used by both the empty-chat hero and the
// active-chat composer. `null` means "all globally-enabled servers" (the
// default), `[]` means none, anything else is an explicit allowlist.
export function MCPPicker({ enabledMcpIds, eligibleMcps, onChange, labelPrefix = 'MCP' }: Props) {
  const [open, setOpen] = useState(false)
  const [placement, setPlacement] = useState<'top' | 'bottom'>('top')
  const ref = useRef<HTMLDivElement>(null)

  const measure = () => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const triggerMid = (r.top + r.bottom) / 2
    setPlacement(triggerMid < window.innerHeight / 2 ? 'bottom' : 'top')
  }

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const label =
    enabledMcpIds === null
      ? `· all (${eligibleMcps.length})`
      : enabledMcpIds.length === 0
        ? '· none'
        : `· ${enabledMcpIds.length}`

  if (eligibleMcps.length === 0) return null

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button
        className="btn btn-plain"
        style={{ fontSize: 12, fontFamily: 'var(--ff-mono)', gap: 4 }}
        type="button"
        onClick={() => {
          if (!open) measure()
          setOpen((o) => !o)
        }}
        title="Change MCP servers for this session"
      >
        {labelPrefix} {label} ⌄
      </button>
      {open && (
        <div className={`model-pop model-pop--${placement}`}>
          <div
            className="model-pop-hd"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
          >
            <span>MCP servers</span>
            <span style={{ display: 'flex', gap: 4 }}>
              <button
                className={`btn btn-plain${enabledMcpIds === null ? ' on' : ''}`}
                type="button"
                style={{ fontSize: 11, padding: '2px 6px' }}
                title="Use all globally-enabled MCP servers"
                onClick={() => {
                  if (enabledMcpIds !== null) onChange(null)
                }}
              >
                All
              </button>
              <button
                className={`btn btn-plain${enabledMcpIds !== null && enabledMcpIds.length === 0 ? ' on' : ''}`}
                type="button"
                style={{ fontSize: 11, padding: '2px 6px' }}
                title="Disable every MCP server for this session"
                onClick={() => onChange([])}
              >
                None
              </button>
            </span>
          </div>
          <div className="model-pop-list">
            {eligibleMcps.map((s) => {
              const checked = enabledMcpIds === null || enabledMcpIds.includes(s.id)
              return (
                <button
                  key={s.id}
                  className={`model-pop-item ${checked ? 'on' : ''}`}
                  type="button"
                  onClick={() => {
                    const base = enabledMcpIds ?? eligibleMcps.map((m) => m.id)
                    const next = base.includes(s.id)
                      ? base.filter((x) => x !== s.id)
                      : [...base, s.id]
                    onChange(next)
                  }}
                >
                  <div className="m-main">
                    <div className="m-disp">
                      {s.name}
                      {s.scope === 'plugin' ? ' ↗' : ''}
                    </div>
                    <div className="m-id">
                      {s.transport} · {s.scope === 'plugin' ? 'plugin' : s.scope}
                    </div>
                  </div>
                  {checked && <Check />}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function Check() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}
