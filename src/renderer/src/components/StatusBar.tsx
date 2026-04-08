import { useAgentStore } from '../stores/agent'
import { Loader2, CheckCircle, XCircle, MinusCircle } from 'lucide-react'

export function StatusBar() {
  const llamaStatus = useAgentStore(s => s.llamaStatus)

  const statusConfig = {
    starting: { icon: Loader2, label: 'AI engine starting...', color: 'text-warning', animate: true },
    ready: { icon: CheckCircle, label: 'Ready', color: 'text-success', animate: false },
    error: { icon: XCircle, label: 'AI engine error', color: 'text-error', animate: false },
    stopped: { icon: MinusCircle, label: 'AI engine stopped', color: 'text-text-muted', animate: false },
  }

  const config = statusConfig[llamaStatus]
  const Icon = config.icon

  return (
    <div className="flex items-center gap-2 h-6 px-4 bg-pure-black border-t border-border-mist-04 text-xs select-none">
      <Icon size={12} className={`${config.color} ${config.animate ? 'animate-spin' : ''}`} />
      <span className={config.color}>{config.label}</span>
      <div className="flex-1" />
      <span className="text-text-muted font-mono">Folk</span>
    </div>
  )
}
