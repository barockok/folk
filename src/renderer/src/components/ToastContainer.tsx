import { useEffect, useState } from 'react'
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react'
import { useToastStore } from '../stores/toast'

const iconMap = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info
}

const colorMap = {
  success: 'bg-success/20 border border-success/30 text-success',
  error: 'bg-error/20 border border-error/30 text-error',
  warning: 'bg-warning/20 border border-warning/30 text-warning',
  info: 'bg-signal-blue/20 border border-signal-blue/30 text-signal-blue'
}

function ToastItem({
  id,
  type,
  message
}: {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  message: string
}): React.JSX.Element {
  const removeToast = useToastStore((s) => s.removeToast)
  const [visible, setVisible] = useState(false)
  const Icon = iconMap[type]

  useEffect(() => {
    // Trigger enter animation
    requestAnimationFrame(() => setVisible(true))
  }, [])

  return (
    <div
      className={`rounded-default px-4 py-3 flex items-center gap-3 transition-all duration-300 ${
        visible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
      } ${colorMap[type]}`}
    >
      <Icon size={18} className="shrink-0" />
      <span className="text-sm flex-1">{message}</span>
      <button
        onClick={() => removeToast(id)}
        className="shrink-0 p-0.5 hover:opacity-70 transition-opacity cursor-pointer"
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  )
}

export default function ToastContainer(): React.JSX.Element | null {
  const toasts = useToastStore((s) => s.toasts)

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} id={toast.id} type={toast.type} message={toast.message} />
      ))}
    </div>
  )
}
