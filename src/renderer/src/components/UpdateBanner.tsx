import { useUpdateStore } from '../stores/useUpdateStore'
import { Icon } from './icons'

export function UpdateBanner() {
  const phase = useUpdateStore((s) => s.phase)
  const version = useUpdateStore((s) => s.version)
  const percent = useUpdateStore((s) => s.percent)
  const error = useUpdateStore((s) => s.error)
  const dismissed = useUpdateStore((s) => s.dismissed)
  const dismiss = useUpdateStore((s) => s.dismiss)

  if (dismissed) return null
  if (phase === 'idle' || phase === 'checking' || phase === 'error') return null

  const handleRestart = async () => {
    await window.folk.updater.quitAndInstall()
  }

  let content: React.ReactNode = null
  if (phase === 'available') {
    content = (
      <>
        <Icon name="info" size={14} />
        <span>
          Update <strong>{version}</strong> available — downloading…
        </span>
      </>
    )
  } else if (phase === 'downloading') {
    content = (
      <>
        <Icon name="info" size={14} />
        <span>
          Downloading update <strong>{version}</strong>
        </span>
        <div className="update-banner-bar" aria-hidden="true">
          <div className="update-banner-bar-fill" style={{ width: `${percent}%` }} />
        </div>
        <span className="update-banner-pct">{percent}%</span>
      </>
    )
  } else if (phase === 'ready') {
    content = (
      <>
        <Icon name="check" size={14} />
        <span>
          Update <strong>{version}</strong> ready — restart to apply
        </span>
        <button
          type="button"
          className="btn btn-primary"
          style={{ fontSize: 12, padding: '4px 10px', marginLeft: 'auto' }}
          onClick={handleRestart}
        >
          Restart now
        </button>
      </>
    )
  }

  return (
    <div className={`update-banner update-banner--${phase}`} role="status" aria-live="polite">
      <div className="update-banner-body">{content}</div>
      <button
        type="button"
        className="update-banner-close"
        onClick={dismiss}
        aria-label="Dismiss update banner"
        title="Dismiss"
      >
        <Icon name="x" size={12} />
      </button>
      {error && <div className="update-banner-err">{error}</div>}
    </div>
  )
}
