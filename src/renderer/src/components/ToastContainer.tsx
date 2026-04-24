import { useEffect } from 'react'
import { useUIStore } from '../stores/useUIStore'

export function ToastContainer() {
  const toasts = useUIStore((s) => s.toasts)
  const dismissToast = useUIStore((s) => s.dismissToast)

  useEffect(() => {
    const timers = toasts.map((t) =>
      window.setTimeout(() => dismissToast(t.id), 5000)
    )
    return () => timers.forEach(clearTimeout)
  }, [toasts, dismissToast])

  return (
    <div className="toast-stack">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`}>
          {t.text}
        </div>
      ))}
    </div>
  )
}
