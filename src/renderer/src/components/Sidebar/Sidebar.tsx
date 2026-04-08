import { useState } from 'react'
import { MessageSquarePlus, Settings } from 'lucide-react'
import { useConversationStore } from '../../stores/conversation'
import { useUIStore } from '../../stores/ui'
import SearchInput from './SearchInput'
import ConversationList from './ConversationList'

export default function Sidebar(): React.JSX.Element {
  const [searchQuery, setSearchQuery] = useState('')
  const createConversation = useConversationStore((s) => s.createConversation)
  const toggleSettings = useUIStore((s) => s.toggleSettings)

  return (
    <div className="w-[260px] bg-pure-black border-r border-border-mist-08 flex flex-col h-full">
      <SearchInput value={searchQuery} onChange={setSearchQuery} />
      <ConversationList searchQuery={searchQuery} />
      <div className="border-t border-border-mist-06 p-3 flex gap-2">
        <button
          onClick={() => createConversation()}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-surface-hover rounded-default transition-colors cursor-pointer"
          aria-label="New chat"
        >
          <MessageSquarePlus size={16} />
          <span>New Chat</span>
        </button>
        <button
          onClick={toggleSettings}
          className="flex items-center justify-center px-3 py-2 text-text-secondary hover:text-text-primary hover:bg-surface-hover rounded-default transition-colors cursor-pointer"
          aria-label="Settings"
        >
          <Settings size={16} />
        </button>
      </div>
    </div>
  )
}
