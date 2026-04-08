import { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import type { Message } from '../../../../shared/types'
import MarkdownRenderer from './MarkdownRenderer'

interface AssistantMessageProps {
  message: Message
}

function extractText(message: Message): string {
  return message.content
    .filter((block) => block.type === 'text')
    .map((block) => (block as { type: 'text'; text: string }).text)
    .join('\n')
}

export default function AssistantMessage({ message }: AssistantMessageProps): React.JSX.Element {
  const text = extractText(message)
  const [copied, setCopied] = useState(false)
  const timestamp = new Date(message.createdAt).toLocaleString()

  const handleCopy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex justify-start mb-4" title={timestamp}>
      <div className="group max-w-[85%] relative">
        <div className="text-[15px] text-text-secondary">
          <MarkdownRenderer content={text} />
        </div>
        <button
          onClick={handleCopy}
          className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 p-1.5 text-text-muted hover:text-text-primary bg-pure-black/80 rounded-default transition-all"
          title="Copy message"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>
    </div>
  )
}
