import { useState, useRef, useEffect } from 'react'
import { Trash2 } from 'lucide-react'
import type { Conversation } from '../../../../shared/types'
import { useConversationStore } from '../../stores/conversation'

interface ConversationItemProps {
  conversation: Conversation
  isActive: boolean
  onClick: () => void
  onDelete: () => void
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  const weeks = Math.floor(days / 7)
  if (weeks < 4) return `${weeks}w ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

export default function ConversationItem({
  conversation,
  isActive,
  onClick,
  onDelete
}: ConversationItemProps): React.JSX.Element {
  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const renameConversation = useConversationStore((s) => s.renameConversation)

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const handleDoubleClick = (e: React.MouseEvent): void => {
    e.stopPropagation()
    setEditTitle(conversation.title || 'New conversation')
    setIsEditing(true)
  }

  const handleSave = (): void => {
    const trimmed = editTitle.trim()
    if (trimmed && trimmed !== conversation.title) {
      renameConversation(conversation.id, trimmed)
    }
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSave()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setIsEditing(false)
    }
  }

  return (
    <button
      onClick={onClick}
      className={`group w-full text-left px-3 py-2.5 border-l-2 transition-colors cursor-pointer ${
        isActive
          ? 'border-l-electric-cyan bg-surface-elevated'
          : 'border-l-transparent hover:bg-surface-hover'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {isEditing ? (
            <input
              ref={inputRef}
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleSave}
              onClick={(e) => e.stopPropagation()}
              className="w-full bg-transparent border-b border-electric-cyan text-sm text-text-primary outline-none"
            />
          ) : (
            <div
              className="text-sm text-text-primary truncate"
              onDoubleClick={handleDoubleClick}
            >
              {conversation.title || 'New conversation'}
            </div>
          )}
          <div className="text-xs text-text-muted mt-0.5">
            {formatTimeAgo(conversation.updatedAt)}
          </div>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          className="opacity-0 group-hover:opacity-100 p-1 text-text-muted hover:text-error transition-all cursor-pointer"
          aria-label="Delete conversation"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </button>
  )
}
