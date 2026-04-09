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
