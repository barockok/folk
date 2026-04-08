import { useState } from 'react'
import { Folder } from 'lucide-react'

interface WorkspaceStepProps {
  onComplete: () => void
}

export default function WorkspaceStep({ onComplete }: WorkspaceStepProps): React.JSX.Element {
  const [selectedPath, setSelectedPath] = useState<string | null>(null)

  const handleSelectFolder = async (): Promise<void> => {
    const path = await window.folk.selectWorkspace()
    if (path) {
      setSelectedPath(path)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center flex-1 px-6 max-w-md mx-auto w-full">
      <h2 className="text-2xl font-semibold text-text-primary mb-2">Choose a workspace folder</h2>
      <p className="text-sm text-text-secondary mb-8 text-center">
        Folk will only access files within this folder. You can change it later in settings.
      </p>

      <button
        onClick={handleSelectFolder}
        className="flex items-center gap-3 bg-pure-black border border-border-mist-10 rounded-default px-6 py-4 hover:border-border-mist-12 transition-colors cursor-pointer mb-4"
      >
        <Folder size={20} className="text-text-muted" />
        <span className="text-text-secondary">
          {selectedPath ? 'Change folder' : 'Select folder'}
        </span>
      </button>

      {selectedPath && (
        <p className="font-mono text-xs text-text-muted mb-6 text-center break-all">
          {selectedPath}
        </p>
      )}

      <button
        onClick={onComplete}
        disabled={!selectedPath}
        className={`px-8 py-3 rounded-default font-medium transition-colors cursor-pointer ${
          selectedPath
            ? 'bg-white text-black hover:bg-white/90'
            : 'bg-border-mist-08 text-text-muted cursor-not-allowed'
        }`}
      >
        Start using Folk
      </button>
    </div>
  )
}
