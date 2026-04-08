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

  return (
    <div className="flex justify-start mb-4">
      <div className="max-w-[85%] text-[15px] text-text-secondary">
        <MarkdownRenderer content={text} />
      </div>
    </div>
  )
}
