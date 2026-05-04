import { useEffect } from 'react'
import { useUIStore } from '../stores/useUIStore'
import {
  initRendererTelemetry,
  captureRenderer,
  setRendererEnabled,
} from '../lib/telemetry'

export function useTelemetry(): void {
  const page = useUIStore((s) => s.page)

  // Bootstrap once.
  useEffect(() => {
    let cancelled = false
    void window.folk.telemetry.getConfig().then((cfg) => {
      if (cancelled) return
      initRendererTelemetry({
        distinctId: cfg.distinctId,
        enabled: cfg.enabled,
        key: import.meta.env.VITE_POSTHOG_KEY ?? '',
        host: import.meta.env.VITE_POSTHOG_HOST ?? 'https://us.i.posthog.com',
      })
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Fire page_viewed on every page change (including initial — this effect runs on mount).
  useEffect(() => {
    captureRenderer('page_viewed', { page_name: page })
  }, [page])
}

export { setRendererEnabled, captureRenderer }
