import { useConversationStore } from '../../stores/conversation'
import MessageList from './MessageList'
import ChatInput from './ChatInput'
import EmptyState from '../EmptyState'

export default function ChatPanel(): React.JSX.Element {
  const { activeConversationId, messages } = useConversationStore()
  const showEmpty = !activeConversationId || messages.length === 0

  return (
    <div className="flex-1 bg-void-black relative flex flex-col">
      {/* Geometric background */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Radial gradients */}
        <div
          className="absolute inset-0"
          style={{
            background: [
              'radial-gradient(ellipse at 30% 20%, rgba(0, 255, 255, 0.03), transparent 50%)',
              'radial-gradient(ellipse at 70% 80%, rgba(0, 7, 205, 0.05), transparent 50%)'
            ].join(', ')
          }}
        />
        {/* Grid lines */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: [
              'linear-gradient(rgba(255, 255, 255, 0.04) 1px, transparent 1px)',
              'linear-gradient(90deg, rgba(255, 255, 255, 0.04) 1px, transparent 1px)'
            ].join(', '),
            backgroundSize: '80px 80px',
            mask: 'radial-gradient(ellipse at center, black 30%, transparent 70%)'
          }}
        />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col flex-1 min-h-0">
        {showEmpty ? <EmptyState /> : <MessageList />}
        <ChatInput />
      </div>
    </div>
  )
}
