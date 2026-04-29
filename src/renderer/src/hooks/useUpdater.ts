import { useEffect } from 'react'
import { useUpdateStore } from '../stores/useUpdateStore'

export function useUpdater(): void {
  const setChecking = useUpdateStore((s) => s.setChecking)
  const setAvailable = useUpdateStore((s) => s.setAvailable)
  const setNotAvailable = useUpdateStore((s) => s.setNotAvailable)
  const setProgress = useUpdateStore((s) => s.setProgress)
  const setDownloaded = useUpdateStore((s) => s.setDownloaded)
  const setError = useUpdateStore((s) => s.setError)

  useEffect(() => {
    const u = window.folk.updater
    const offs = [
      u.onChecking(setChecking),
      u.onAvailable((e) => setAvailable(e.version)),
      u.onNotAvailable(() => setNotAvailable()),
      u.onProgress((e) => setProgress(e.percent)),
      u.onDownloaded((e) => setDownloaded(e.version)),
      u.onError((e) => setError(e.message))
    ]
    return () => {
      for (const off of offs) off()
    }
  }, [setChecking, setAvailable, setNotAvailable, setProgress, setDownloaded, setError])
}
