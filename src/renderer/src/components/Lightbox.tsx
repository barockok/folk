import { useEffect } from 'react'
import { useUIStore } from '../stores/useUIStore'

export function Lightbox() {
  const src = useUIStore((s) => s.lightboxSrc)
  const close = useUIStore((s) => s.closeLightbox)

  useEffect(() => {
    if (!src) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [src, close])

  if (!src) return null
  return (
    <div
      className="lightbox-scrim"
      onClick={close}
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        className="lightbox-close"
        onClick={close}
        aria-label="Close"
      >
        ×
      </button>
      <img
        className="lightbox-img"
        src={src}
        alt=""
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  )
}
