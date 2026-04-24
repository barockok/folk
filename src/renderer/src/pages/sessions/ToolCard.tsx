// src/renderer/src/pages/sessions/ToolCard.tsx
import { useState } from 'react'

export interface ToolCardProps {
  call: {
    callId: string
    tool: string
    input: unknown
    output?: unknown
    isError?: boolean
  }
}

export function ToolCard({ call }: ToolCardProps) {
  const [open, setOpen] = useState(false)
  const status: 'running' | 'success' | 'error' =
    call.output === undefined ? 'running' : call.isError ? 'error' : 'success'
  return (
    <div className={`tool-card tool-${status}`}>
      <button type="button" className="tool-head" onClick={() => setOpen((v) => !v)}>
        <span className="tool-name">{call.tool}</span>
        <span className="tool-status">{status}</span>
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
