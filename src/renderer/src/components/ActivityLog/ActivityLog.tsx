import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useAgentStore } from '../../stores/agent'
import ToolCallEntry from './ToolCallEntry'

export default function ActivityLog(): React.JSX.Element | null {
  const { toolCalls } = useAgentStore()
  const [expanded, setExpanded] = useState(false)

  if (toolCalls.length === 0) return null

  const hasRunning = toolCalls.some((tc) => !tc.result)

  return (
    <div className="border-t border-border-mist-06">
      {/* Collapsed summary */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-4 py-2 text-left hover:bg-surface-hover transition-colors cursor-pointer"
      >
        {expanded ? (
          <ChevronDown size={12} className="text-text-muted" />
        ) : (
          <ChevronRight size={12} className="text-text-muted" />
        )}

        {hasRunning && (
          <span className="w-1.5 h-1.5 rounded-full bg-electric-cyan shrink-0" />
        )}

        <span className="text-xs text-text-tertiary">
          {toolCalls.length} tool call{toolCalls.length !== 1 ? 's' : ''}
        </span>
      </button>

      {/* Expanded list */}
      {expanded && (
        <div className="max-h-60 overflow-y-auto">
          {toolCalls.map((tc) => (
            <ToolCallEntry key={tc.id} toolCall={tc} />
          ))}
        </div>
      )}
    </div>
  )
}
