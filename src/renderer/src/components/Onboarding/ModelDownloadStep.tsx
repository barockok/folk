import { useState, useEffect } from 'react'
import type { DownloadProgress } from '../../../../shared/types'

interface ModelDownloadStepProps {
  onNext: () => void
  onSkip: () => void
}

const MODEL_URL = 'https://huggingface.co/google/gemma-4-e4b-it-GGUF/resolve/main/gemma-4-e4b-it.gguf'

export default function ModelDownloadStep({ onNext, onSkip }: ModelDownloadStepProps): React.JSX.Element {
  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress] = useState<DownloadProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    const cleanup = window.folk.onDownloadProgress((data: DownloadProgress) => {
      setProgress(data)
      if (data.percent >= 100) {
        setDone(true)
        setDownloading(false)
      }
    })
    return cleanup
  }, [])

  const handleDownload = async (): Promise<void> => {
    setError(null)
    setDownloading(true)
    try {
      await window.folk.downloadModel(MODEL_URL)
      setDone(true)
      setDownloading(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed')
      setDownloading(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center flex-1 px-6 max-w-md mx-auto w-full">
      <h2 className="text-2xl font-semibold text-text-primary mb-2">Download your AI model</h2>
      <p className="text-sm text-text-secondary mb-8 text-center">
        Gemma 4 E4B — ~1.5 GB. This only happens once.
      </p>

      {!downloading && !done && (
        <button
          onClick={handleDownload}
          className="bg-white text-black px-8 py-3 rounded-default font-medium hover:bg-white/90 transition-colors cursor-pointer mb-4"
        >
          Download Model
        </button>
      )}

      {downloading && progress && (
        <div className="w-full mb-4">
          <div className="w-full h-2 bg-border-mist-08 rounded-full overflow-hidden mb-3">
            <div
              className="h-full bg-electric-cyan transition-all duration-300"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
          <div className="flex justify-between font-mono text-xs text-text-muted">
            <span>{progress.percent.toFixed(1)}%</span>
            <span>{progress.speed}</span>
            <span>ETA: {progress.eta}</span>
          </div>
        </div>
      )}

      {done && (
        <button
          onClick={onNext}
          className="bg-white text-black px-8 py-3 rounded-default font-medium hover:bg-white/90 transition-colors cursor-pointer mb-4"
        >
          Continue
        </button>
      )}

      {error && <p className="text-error text-sm mb-4">{error}</p>}

      {!done && (
        <button
          onClick={onSkip}
          className="text-text-muted text-sm hover:text-text-secondary transition-colors cursor-pointer"
        >
          Skip — I'll configure my own model later
        </button>
      )}
    </div>
  )
}
