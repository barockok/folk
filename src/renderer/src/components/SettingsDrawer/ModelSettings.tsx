import ModelCard from '../ModelCard'
import { AVAILABLE_MODELS } from '../../../../shared/models'
import { useModelDownload } from '../../hooks/useModelDownload'

export default function ModelSettings(): React.JSX.Element {
  const { states, activeModelId, downloadingModelId, download, cancel, setActive } =
    useModelDownload()

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-medium text-text-primary mb-1">Available Models</h3>
        <p className="text-xs text-text-muted mb-4">
          Download and manage local AI models. Only one model can be active at a time.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {AVAILABLE_MODELS.map((model) => {
          const state = states[model.id]
          return (
            <ModelCard
              key={model.id}
              model={model}
              status={state.status}
              progress={state.progress}
              currentFile={state.currentFile}
              error={state.error}
              isActive={activeModelId === model.id}
              downloadDisabled={downloadingModelId !== null && downloadingModelId !== model.id}
              onDownload={() => download(model.id)}
              onCancel={cancel}
              onSetActive={() => setActive(model.id)}
            />
          )
        })}
      </div>
    </div>
  )
}
import { Upload, Download } from 'lucide-react'
import type { ModelInfo } from '../../../../shared/types'

const MODEL_URL = 'https://huggingface.co/ggml-org/gemma-4-E4B-it-GGUF/resolve/main/gemma-4-e4b-it-Q4_K_M.gguf'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export default function ModelSettings(): React.JSX.Element {
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [model, setModel] = useState('')

  useEffect(() => {
    window.folk.getModelInfo().then(setModelInfo)
    window.folk.getSetting('anthropicApiKey').then((key) => {
      if (key) setApiKey(key as string)
    })
    window.folk.getSetting('anthropicBaseUrl').then((url) => {
      if (url) setBaseUrl(url as string)
    })
    window.folk.getSetting('model').then((m) => {
      if (m) setModel(m as string)
    })
  }, [])

  const saveApiConfig = (): void => {
    window.folk.setSetting('anthropicApiKey', apiKey)
    window.folk.setSetting('anthropicBaseUrl', baseUrl)
    if (model) window.folk.setSetting('model', model)
  }

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
      <div className="mb-6 space-y-4">
        <h4 className="text-sm font-medium text-text-primary mb-2">API Configuration</h4>

        <div>
          <label className="text-xs text-text-muted mb-1 block">API Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-ant-... (optional, uses local llama-server by default)"
            className="w-full bg-transparent border border-border-mist-10 rounded-default px-3 py-2 text-sm font-mono text-text-primary placeholder:text-text-muted focus:border-signal-blue focus:outline-none"
          />
        </div>

        <div>
          <label className="text-xs text-text-muted mb-1 block">Base URL (optional)</label>
          <input
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="http://127.0.0.1:8847 (default: local llama-server)"
            className="w-full bg-transparent border border-border-mist-10 rounded-default px-3 py-2 text-sm font-mono text-text-primary placeholder:text-text-muted focus:border-signal-blue focus:outline-none"
          />
          <p className="text-xs text-text-muted mt-1">
            Point to llama-server, Ollama, LiteLLM, or any Anthropic-compatible API
          </p>
        </div>

        <div>
          <label className="text-xs text-text-muted mb-1 block">Model</label>
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="gemma-4-e4b (default: local model)"
            className="w-full bg-transparent border border-border-mist-10 rounded-default px-3 py-2 text-sm font-mono text-text-primary placeholder:text-text-muted focus:border-signal-blue focus:outline-none"
          />
        </div>

        <div>
          <button
            onClick={saveApiConfig}
            className="px-4 py-2 text-sm bg-white text-black font-medium rounded-default hover:bg-white/90 transition-colors"
          >
            Save
          </button>
        </div>
      </div>

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
