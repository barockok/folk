import { useEffect, useRef, useState } from 'react'
import { ArrowDown } from 'lucide-react'
import { useConversationStore } from '../../stores/conversation'
import UserMessage from './UserMessage'
import AssistantMessage from './AssistantMessage'
import MarkdownRenderer from './MarkdownRenderer'

export default function MessageList(): React.JSX.Element {
  const { messages, streamingText } = useConversationStore()
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [showScrollButton, setShowScrollButton] = useState(false)

  const visibleMessages = messages.filter(
    (m) =>
      m.role !== 'system' &&
      m.content.some((block) => block.type === 'text')
  )

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [visibleMessages.length, streamingText])

  const handleScroll = () => {
    const el = scrollContainerRef.current
    if (!el) return
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200
    setShowScrollButton(!isNearBottom)
  }

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="flex-1 relative min-h-0">
      <div ref={scrollContainerRef} onScroll={handleScroll} className="h-full overflow-y-auto px-6 py-4">
        {visibleMessages.map((message) =>
          message.role === 'user' ? (
            <UserMessage key={message.id} message={message} />
          ) : (
            <AssistantMessage key={message.id} message={message} />
          )
        )}
        {streamingText && (
          <div className="flex justify-start mb-4">
            <div className="max-w-[85%] text-[15px] text-text-secondary">
              <MarkdownRenderer content={streamingText} />
              <span className="inline-block w-0.5 h-5 bg-electric-cyan animate-pulse ml-0.5 align-text-bottom" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      {showScrollButton && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-20 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 px-3 py-1.5 bg-pure-black border border-border-mist-10 rounded-pill text-xs text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors shadow-floating"
        >
          <ArrowDown size={14} />
          Scroll to bottom
        </button>
      )}
    </div>
  )
}
