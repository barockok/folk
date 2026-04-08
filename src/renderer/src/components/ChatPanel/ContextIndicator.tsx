import { useConversationStore } from '../../stores/conversation'

export function ContextIndicator() {
  const messages = useConversationStore((s) => s.messages)
  const streamingText = useConversationStore((s) => s.streamingText)

  // Rough token estimate: ~4 chars per token
  const estimateTokens = (text: string) => Math.ceil(text.length / 4)

  const totalTokens =
    messages.reduce((sum, msg) => {
      if (msg.tokenCount) return sum + msg.tokenCount
      const text = msg.content
        .filter((b) => b.type === 'text')
        .map((b) => (b as { type: 'text'; text: string }).text)
        .join('')
      return sum + estimateTokens(text)
    }, 0) + estimateTokens(streamingText)

  const maxTokens = 8192 // Default context size
  const usagePercent = Math.min((totalTokens / maxTokens) * 100, 100)
  const isWarning = usagePercent > 70
  const isCritical = usagePercent > 90

  // Don't show if no messages
  if (messages.length === 0) return null

  return (
    <div className="flex items-center gap-2 px-4 py-1 text-xs font-mono">
      <div className="flex-1 h-1 bg-border-mist-08 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            isCritical ? 'bg-error' : isWarning ? 'bg-warning' : 'bg-electric-cyan/40'
          }`}
          style={{ width: `${usagePercent}%` }}
        />
      </div>
      <span
        className={`${isCritical ? 'text-error' : isWarning ? 'text-warning' : 'text-text-muted'}`}
      >
        ~{totalTokens.toLocaleString()} / {maxTokens.toLocaleString()} tokens
      </span>
    </div>
  )
}
