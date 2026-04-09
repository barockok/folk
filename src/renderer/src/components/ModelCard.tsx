import { Download, CheckCircle, XCircle, Cpu } from 'lucide-react'
import type { WebGPUModel } from '../../../shared/models'

export type ModelDownloadStatus = 'not_downloaded' | 'downloading' | 'downloaded' | 'error'

interface ModelCardProps {
  model: WebGPUModel
  status: ModelDownloadStatus
  progress: number
  currentFile: string
  error: string | null
  isActive: boolean
  downloadDisabled: boolean
  onDownload: () => void
  onCancel: () => void
  onSetActive: () => void
}

export default function ModelCard({
  model,
  status,
  progress,
  currentFile,
  error,
  isActive,
  downloadDisabled,
  onDownload,
  onCancel,
  onSetActive
}: ModelCardProps): React.JSX.Element {
  const borderClass = isActive
    ? 'border-electric-cyan'
    : 'border-border-mist-08 hover:border-border-mist-12'

  return (
    <div
      className={`bg-pure-black border ${borderClass} rounded-default p-5 transition-colors`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <Cpu size={16} className="text-text-muted" />
          <h3 className="text-sm font-semibold text-text-primary">{model.name}</h3>
        </div>
        <span className="text-xs font-mono text-text-muted bg-border-mist-08 px-2 py-0.5 rounded">
          {model.params}
        </span>
      </div>

      {/* Description */}
      <p className="text-xs text-text-secondary mb-3">{model.description}</p>

      {/* Meta */}
      <div className="flex items-center gap-3 text-xs text-text-muted font-mono mb-4">
        <span>{model.sizeEstimate}</span>
        <span className="text-border-mist-10">·</span>
        <span>{model.dtype}</span>
      </div>

      {/* Action area */}
      {status === 'not_downloaded' && (
        <button
          onClick={onDownload}
          disabled={downloadDisabled}
          className={`flex items-center gap-2 w-full justify-center px-4 py-2.5 rounded-default text-sm font-medium transition-colors ${
            downloadDisabled
              ? 'bg-border-mist-08 text-text-muted cursor-not-allowed'
              : 'bg-white text-black hover:bg-white/90 cursor-pointer'
          }`}
        >
          <Download size={14} />
          Download
        </button>
      )}

      {status === 'downloading' && (
        <div>
          <div className="w-full h-2 bg-border-mist-08 rounded-full overflow-hidden mb-2">
            <div
              className="h-full bg-electric-cyan transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-xs text-text-muted">{progress}%</span>
            <span className="font-mono text-xs text-text-muted truncate ml-2 max-w-[60%]">
              {currentFile}
            </span>
          </div>
          <button
            onClick={onCancel}
            className="flex items-center gap-2 w-full justify-center px-4 py-2 rounded-default text-sm text-text-secondary border border-border-mist-10 hover:border-border-mist-12 transition-colors cursor-pointer"
          >
            Cancel
          </button>
        </div>
      )}

      {status === 'downloaded' && !isActive && (
        <button
          onClick={onSetActive}
          className="flex items-center gap-2 w-full justify-center px-4 py-2.5 rounded-default text-sm font-medium bg-white text-black hover:bg-white/90 transition-colors cursor-pointer"
        >
          <CheckCircle size={14} />
          Use This Model
        </button>
      )}

      {status === 'downloaded' && isActive && (
        <div className="flex items-center gap-2 justify-center px-4 py-2.5 rounded-default text-sm font-medium text-electric-cyan border border-electric-cyan/30 bg-electric-cyan/5">
          <CheckCircle size={14} />
          Active
        </div>
      )}

      {status === 'error' && (
        <div>
          <div className="flex items-center gap-2 text-error text-xs mb-2">
            <XCircle size={12} />
            <span className="truncate">{error || 'Download failed'}</span>
          </div>
          <button
            onClick={onDownload}
            disabled={downloadDisabled}
            className="flex items-center gap-2 w-full justify-center px-4 py-2.5 rounded-default text-sm font-medium bg-white text-black hover:bg-white/90 transition-colors cursor-pointer"
          >
            <Download size={14} />
            Retry
          </button>
        </div>
      )}
    </div>
  )
}
