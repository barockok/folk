import { useState, useCallback } from 'react'
import { Upload } from 'lucide-react'
import { useConversationStore } from '../../stores/conversation'
import { useAttachmentStore } from '../../stores/attachments'
import MessageList from './MessageList'
import ChatInput from './ChatInput'
import EmptyState from '../EmptyState'
import ActivityLog from '../ActivityLog/ActivityLog'
import { ContextIndicator } from './ContextIndicator'

export default function ChatPanel(): React.JSX.Element {
  const { activeConversationId, messages } = useConversationStore()
  const addFile = useAttachmentStore((s) => s.addFile)
  const showEmpty = !activeConversationId || messages.length === 0
  const [isDragging, setIsDragging] = useState(false)

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    const related = e.relatedTarget as Node | null
    if (!related || !e.currentTarget.contains(related)) {
      setIsDragging(false)
    }
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setIsDragging(false)

      const files = e.dataTransfer.files
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const reader = new FileReader()
        reader.onload = (): void => {
          const content = reader.result as string
          addFile({ name: file.name, content })
        }
        reader.readAsText(file)
      }
    },
    [addFile]
  )

  return (
    <div
      className="flex-1 bg-void-black relative flex flex-col"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
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

      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-electric-cyan/5 border-2 border-dashed border-electric-cyan/30 rounded-default">
          <Upload size={32} className="text-electric-cyan mb-2" />
          <span className="text-electric-cyan text-lg">Drop files here</span>
        </div>
      )}

      {/* Content */}
      <div className="relative z-10 flex flex-col flex-1 min-h-0">
        {showEmpty ? <EmptyState /> : <MessageList />}
        <ActivityLog />
        <ContextIndicator />
        <ChatInput />
      </div>
    </div>
  )
}
