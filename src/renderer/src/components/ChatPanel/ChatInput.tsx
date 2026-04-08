import { useState, useRef, useCallback } from 'react'
import { FileText, Paperclip, Send, Square, X } from 'lucide-react'
import { useConversationStore } from '../../stores/conversation'
import { useAgentStore } from '../../stores/agent'
import { useAttachmentStore } from '../../stores/attachments'

export default function ChatInput(): React.JSX.Element {
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const sendMessage = useConversationStore((s) => s.sendMessage)
  const activeConversationId = useConversationStore((s) => s.activeConversationId)
  const isProcessing = useAgentStore((s) => s.isProcessing)
  const setProcessing = useAgentStore((s) => s.setProcessing)
  const files = useAttachmentStore((s) => s.files)
  const removeFile = useAttachmentStore((s) => s.removeFile)
  const clearFiles = useAttachmentStore((s) => s.clearFiles)

  const canSend = (input.trim().length > 0 || files.length > 0) && !isProcessing

  const handleSend = useCallback(() => {
    if (!canSend) return

    let messageText = ''
    for (const file of files) {
      messageText += `Content of ${file.name}:\n\`\`\`\n${file.content}\n\`\`\`\n\n`
    }
    messageText += input.trim()

    sendMessage(messageText)
    setInput('')
    clearFiles()
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [canSend, input, files, sendMessage, clearFiles])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>): void => {
    setInput(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }

  return (
    <div className="border-t border-border-mist-10 p-4">
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {files.map((file) => (
            <div
              key={file.name}
              className="flex items-center gap-1.5 px-2 py-1 bg-surface-elevated rounded-default text-xs text-text-secondary"
            >
              <FileText size={12} />
              <span className="max-w-[120px] truncate">{file.name}</span>
              <button
                onClick={() => removeFile(file.name)}
                className="text-text-muted hover:text-text-primary transition-colors cursor-pointer"
                aria-label={`Remove ${file.name}`}
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-end gap-3">
        <button
          className="flex-shrink-0 p-2 text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
          aria-label="Attach file"
        >
          <Paperclip size={18} />
        </button>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Ask Folk anything..."
          rows={1}
          className="flex-1 bg-transparent text-[15px] text-text-primary placeholder:text-text-tertiary resize-none outline-none leading-relaxed"
        />
        {isProcessing ? (
          <button
            onClick={() => {
              window.folk.stopAgent(activeConversationId)
              setProcessing(false)
            }}
            className="flex-shrink-0 w-9 h-9 rounded-full bg-error/20 flex items-center justify-center text-error hover:bg-error/30 transition-colors cursor-pointer"
            aria-label="Stop generation"
          >
            <Square size={14} />
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!canSend}
            className="flex-shrink-0 w-9 h-9 rounded-full bg-cyan-glow-12 flex items-center justify-center text-electric-cyan disabled:opacity-30 disabled:cursor-not-allowed hover:bg-cyan-glow-03 transition-colors cursor-pointer"
            aria-label="Send message"
          >
            <Send size={16} />
          </button>
        )}
      </div>
    </div>
  )
}
