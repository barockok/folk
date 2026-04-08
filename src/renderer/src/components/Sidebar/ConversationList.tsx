import { useConversationStore } from '../../stores/conversation'
import ConversationItem from './ConversationItem'

interface ConversationListProps {
  searchQuery: string
}

export default function ConversationList({ searchQuery }: ConversationListProps): React.JSX.Element {
  const { conversations, activeConversationId, setActiveConversation, deleteConversation } =
    useConversationStore()

  const filtered = conversations.filter((c) =>
    (c.title || '').toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="flex-1 overflow-y-auto">
      {filtered.length === 0 ? (
        <div className="px-3 py-6 text-center text-sm text-text-muted">
          {searchQuery ? 'No conversations found' : 'No conversations yet'}
        </div>
      ) : (
        filtered.map((conversation) => (
          <ConversationItem
            key={conversation.id}
            conversation={conversation}
            isActive={conversation.id === activeConversationId}
            onClick={() => setActiveConversation(conversation.id)}
            onDelete={() => deleteConversation(conversation.id)}
          />
        ))
      )}
    </div>
  )
}
