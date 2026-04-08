import { Folder } from 'lucide-react'
import { useSettingsStore } from '../../stores/settings'

export default function WorkspaceSettings(): React.JSX.Element {
  const workspacePath = useSettingsStore((s) => s.workspacePath)
  const setWorkspacePath = useSettingsStore((s) => s.setWorkspacePath)

  const handleChangeWorkspace = async (): Promise<void> => {
    const path = await window.folk.selectWorkspace()
    if (path) {
      setWorkspacePath(path)
    }
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-text-primary">Workspace</h3>

      {workspacePath ? (
        <p className="font-mono text-xs text-text-muted break-all">{workspacePath}</p>
      ) : (
        <p className="text-sm text-text-muted">No workspace selected</p>
      )}

      <button
        onClick={handleChangeWorkspace}
        className="flex items-center gap-2 px-4 py-2 bg-pure-black border border-border-mist-10 rounded-default text-sm text-text-secondary hover:border-border-mist-12 transition-colors cursor-pointer"
      >
        <Folder size={14} />
        Change Workspace
      </button>
    </div>
  )
}
