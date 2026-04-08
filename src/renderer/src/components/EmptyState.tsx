import { FileText, Mail, Search, Code } from 'lucide-react'
import { useConversationStore } from '../stores/conversation'

const suggestions = [
  { label: 'Organize my files', icon: FileText },
  { label: 'Draft an email', icon: Mail },
  { label: 'Analyze this document', icon: Search },
  { label: 'Help me write code', icon: Code }
]

export default function EmptyState(): React.JSX.Element {
  const sendMessage = useConversationStore((s) => s.sendMessage)

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6">
      <h1 className="text-3xl font-semibold text-text-primary" style={{ lineHeight: 0.87 }}>
        Folk
      </h1>
      <p className="text-lg text-text-secondary mt-4 mb-8">What can I help you with?</p>
      <div className="grid grid-cols-2 gap-3 max-w-md w-full">
        {suggestions.map(({ label, icon: Icon }) => (
          <button
            key={label}
            onClick={() => sendMessage(label)}
            className="group bg-pure-black border border-border-mist-10 rounded-default px-4 py-3 text-left hover:border-border-mist-12 hover:shadow-[0_0_12px_rgba(0,255,255,0.06)] transition-all cursor-pointer"
          >
            <Icon size={16} className="text-text-muted mb-2 group-hover:text-electric-cyan transition-colors" />
            <div className="text-sm text-text-secondary group-hover:text-text-primary transition-colors">
              {label}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
