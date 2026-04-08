import { useState, useEffect } from 'react'
import { Upload, Download } from 'lucide-react'
import type { ModelInfo } from '../../../../shared/types'

const MODEL_URL = 'https://huggingface.co/google/gemma-4-e4b-it-GGUF/resolve/main/gemma-4-e4b-it.gguf'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export default function ModelSettings(): React.JSX.Element {
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null)

  useEffect(() => {
    window.folk.getModelInfo().then(setModelInfo)
  }, [])

  const handleChangeModel = async (): Promise<void> => {
    const paths = await window.folk.openFileDialog({
      filters: [{ name: 'GGUF Models', extensions: ['gguf'] }]
    })
    if (paths.length > 0) {
      await window.folk.changeModel(paths[0])
      const info = await window.folk.getModelInfo()
      setModelInfo(info)
    }
  }

  const handleDownloadModel = async (): Promise<void> => {
    await window.folk.downloadModel(MODEL_URL)
    const info = await window.folk.getModelInfo()
    setModelInfo(info)
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-medium text-text-primary mb-3">Current Model</h3>
        {modelInfo ? (
          <div className="bg-pure-black border border-border-mist-08 rounded-default p-4 font-mono text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-text-muted">Name</span>
              <span className="text-text-primary">{modelInfo.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Size</span>
              <span className="text-text-primary">{formatBytes(modelInfo.sizeBytes)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Quantization</span>
              <span className="text-text-primary">{modelInfo.quantization}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Context</span>
              <span className="text-text-primary">{modelInfo.contextSize.toLocaleString()}</span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-text-muted">No model loaded</p>
        )}
      </div>

      <div className="flex gap-3">
        <button
          onClick={handleChangeModel}
          className="flex items-center gap-2 px-4 py-2 bg-pure-black border border-border-mist-10 rounded-default text-sm text-text-secondary hover:border-border-mist-12 transition-colors cursor-pointer"
        >
          <Upload size={14} />
          Change Model
        </button>
        <button
          onClick={handleDownloadModel}
          className="flex items-center gap-2 px-4 py-2 bg-pure-black border border-border-mist-10 rounded-default text-sm text-text-secondary hover:border-border-mist-12 transition-colors cursor-pointer"
        >
          <Download size={14} />
          Download Models
        </button>
      </div>
    </div>
  )
}
