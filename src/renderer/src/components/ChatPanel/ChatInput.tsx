import { useState, useRef, useCallback } from 'react'
import { Paperclip, Send, Square } from 'lucide-react'
import { useConversationStore } from '../../stores/conversation'
import { useAgentStore } from '../../stores/agent'

export default function ChatInput(): React.JSX.Element {
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const sendMessage = useConversationStore((s) => s.sendMessage)
  const activeConversationId = useConversationStore((s) => s.activeConversationId)
  const isProcessing = useAgentStore((s) => s.isProcessing)
  const setProcessing = useAgentStore((s) => s.setProcessing)

  const canSend = input.trim().length > 0 && !isProcessing

  const handleSend = useCallback(() => {
    if (!canSend) return
    sendMessage(input.trim())
    setInput('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [canSend, input, sendMessage])

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
