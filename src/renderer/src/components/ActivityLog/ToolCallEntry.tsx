import { useState } from 'react'
import { ChevronRight, ChevronDown, Loader2, Check, AlertCircle, Wrench } from 'lucide-react'
import type { ToolCallStart, ToolCallResult } from '../../../../shared/types'

interface ToolCallEntryProps {
  toolCall: ToolCallStart & { result?: ToolCallResult }
}

export default function ToolCallEntry({ toolCall }: ToolCallEntryProps): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)

  const status = toolCall.result?.status
  const isRunning = !toolCall.result
  const isError = status === 'error'

  const statusColor = isRunning
    ? 'text-electric-cyan'
    : isError
      ? 'text-error'
      : 'text-text-primary'

  return (
    <div className="border-b border-border-mist-04 last:border-b-0">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-4 py-2 text-left hover:bg-surface-hover transition-colors cursor-pointer"
      >
        {expanded ? (
          <ChevronDown size={12} className="text-text-muted shrink-0" />
        ) : (
          <ChevronRight size={12} className="text-text-muted shrink-0" />
        )}

        {isRunning ? (
          <Loader2 size={12} className="text-electric-cyan animate-spin shrink-0" />
        ) : isError ? (
          <AlertCircle size={12} className="text-error shrink-0" />
        ) : (
          <Check size={12} className="text-text-primary shrink-0" />
        )}

        <Wrench size={12} className={`${statusColor} shrink-0`} />

        <span className={`text-xs font-mono truncate ${statusColor}`}>
          {toolCall.toolName}
        </span>

        {toolCall.result?.durationMs != null && (
          <span className="text-xs text-text-muted ml-auto shrink-0">
            {toolCall.result.durationMs}ms
          </span>
        )}
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-3 space-y-2">
          {toolCall.input && (
            <div>
              <span className="text-xs text-text-muted">Input</span>
              <pre className="mt-1 p-2 bg-pure-black rounded-sharp text-xs font-mono text-text-secondary overflow-x-auto">
                {JSON.stringify(toolCall.input, null, 2)}
              </pre>
            </div>
          )}
          {toolCall.result?.output && (
            <div>
              <span className="text-xs text-text-muted">Output</span>
              <pre className="mt-1 p-2 bg-pure-black rounded-sharp text-xs font-mono text-text-secondary overflow-x-auto">
                {JSON.stringify(toolCall.result.output, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
