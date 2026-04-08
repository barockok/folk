import type { Message } from '../../../../shared/types'

interface UserMessageProps {
  message: Message
}

function extractText(message: Message): string {
  return message.content
    .filter((block) => block.type === 'text')
    .map((block) => (block as { type: 'text'; text: string }).text)
    .join('\n')
}

export default function UserMessage({ message }: UserMessageProps): React.JSX.Element {
  return (
    <div className="flex justify-end mb-4">
      <div className="max-w-[70%] bg-surface-bubble rounded-default px-4 py-3">
        <div className="text-[15px] text-text-primary whitespace-pre-wrap">
          {extractText(message)}
        </div>
      </div>
    </div>
  )
}
