import ModelCard from '../ModelCard'
import { AVAILABLE_MODELS } from '../../../../shared/models'
import { useModelDownload } from '../../hooks/useModelDownload'

interface ModelDownloadStepProps {
  onNext: () => void
}

export default function ModelDownloadStep({ onNext }: ModelDownloadStepProps): React.JSX.Element {
  const { states, activeModelId, downloadingModelId, download, cancel, setActive } =
    useModelDownload()

  return (
    <div className="flex flex-col items-center justify-center flex-1 px-6 max-w-2xl mx-auto w-full">
      <h2 className="text-2xl font-semibold text-text-primary mb-2">Choose your AI model</h2>
      <p className="text-sm text-text-secondary mb-8 text-center">
        Download a model to run AI locally. You can always download more later in Settings.
      </p>

      <div className="grid grid-cols-1 gap-4 w-full mb-8">
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

      <button
        onClick={onNext}
        className="bg-white text-black px-8 py-3 rounded-default font-medium hover:bg-white/90 transition-colors cursor-pointer"
      >
        Continue
      </button>

      <p className="text-xs text-text-muted mt-3 text-center">
        You can skip this and download models later in Settings
      </p>
    </div>
  )
}
