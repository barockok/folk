// src/renderer/src/pages/sessions/ToolCard.tsx
import { useState } from 'react'
import { Icon } from '../../components/icons'

export interface ToolCardProps {
  call: {
    callId: string
    tool: string
    input: unknown
    output?: unknown
    isError?: boolean
  }
}

// Map class is keyed to existing CSS in components.css (.tool-card.running /
// .done / .failed). The component-side status name differs from the visual
// state name on purpose — keep the runtime status semantic, the class visual.
function statusClass(s: 'running' | 'success' | 'error'): string {
  if (s === 'running') return 'running'
  if (s === 'error') return 'failed'
  return 'done'
}

function summarizeInput(input: unknown): string | null {
  if (input == null) return null
  if (typeof input === 'string') return input
  if (typeof input !== 'object') return String(input)
  const obj = input as Record<string, unknown>
  // Common single-key cases — show the value directly so the head row reads
  // like a CLI invocation rather than a JSON dump.
  for (const key of ['command', 'file_path', 'path', 'pattern', 'url', 'query']) {
    const v = obj[key]
    if (typeof v === 'string') return v
  }
  return null
}

export function ToolCard({ call }: ToolCardProps) {
  const [open, setOpen] = useState(false)
  const status: 'running' | 'success' | 'error' =
    call.output === undefined ? 'running' : call.isError ? 'error' : 'success'
  const summary = summarizeInput(call.input)
  return (
    <div className={`tool-card ${statusClass(status)}`} data-open={open ? 'true' : 'false'}>
      <button type="button" className="tool-hd" onClick={() => setOpen((v) => !v)}>
        <span className="tool-ic">
          <Icon name="terminal" size={12} />
        </span>
        <span className="tool-name">{call.tool}</span>
        {summary && <span className="tool-srv" title={summary}>{summary}</span>}
        <span className="tool-status">
          {status === 'running' && <span className="spinner" />}
          {status === 'success' && <span className="dot" style={{ background: 'var(--ok)', borderRadius: '50%', display: 'inline-block' }} />}
          {status === 'error' && <span className="dot" style={{ background: 'var(--err, #ea2261)', borderRadius: '50%', display: 'inline-block' }} />}
          {status}
        </span>
        <span className="tool-caret">
          <Icon name="chevronRight" size={12} />
        </span>
      </button>
      {open && (
        <div className="tool-body">
          <div className="tool-section">
            <div className="tool-label">input</div>
            <pre>{JSON.stringify(call.input, null, 2)}</pre>
          </div>
          {call.output !== undefined && (
            <div className="tool-section">
              <div className="tool-label">{call.isError ? 'error' : 'output'}</div>
              <pre>{typeof call.output === 'string' ? call.output : JSON.stringify(call.output, null, 2)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
