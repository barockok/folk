import { useEffect, useRef } from 'react'
import { useConversationStore } from '../../stores/conversation'
import UserMessage from './UserMessage'
import AssistantMessage from './AssistantMessage'
import MarkdownRenderer from './MarkdownRenderer'

export default function MessageList(): React.JSX.Element {
  const { messages, streamingText } = useConversationStore()
  const bottomRef = useRef<HTMLDivElement>(null)

  const visibleMessages = messages.filter(
    (m) =>
      m.role !== 'system' &&
      m.content.some((block) => block.type === 'text')
  )

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [visibleMessages.length, streamingText])

  return (
    <div className="flex-1 overflow-y-auto px-6 py-4">
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
  )
}
