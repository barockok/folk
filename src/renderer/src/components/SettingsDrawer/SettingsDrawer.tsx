import { useState } from 'react'
import { Cpu, Plug, Folder, Palette, Info, X } from 'lucide-react'
import { useUIStore } from '../../stores/ui'
import ModelSettings from './ModelSettings'
import MCPSettings from './MCPSettings'
import WorkspaceSettings from './WorkspaceSettings'
import AppearanceSettings from './AppearanceSettings'
import AboutSection from './AboutSection'

type Tab = 'model' | 'mcp' | 'workspace' | 'appearance' | 'about'

const tabs: { id: Tab; icon: typeof Cpu; label: string }[] = [
  { id: 'model', icon: Cpu, label: 'Model' },
  { id: 'mcp', icon: Plug, label: 'MCP' },
  { id: 'workspace', icon: Folder, label: 'Workspace' },
  { id: 'appearance', icon: Palette, label: 'Appearance' },
  { id: 'about', icon: Info, label: 'About' }
]

const tabContent: Record<Tab, React.ComponentType> = {
  model: ModelSettings,
  mcp: MCPSettings,
  workspace: WorkspaceSettings,
  appearance: AppearanceSettings,
  about: AboutSection
}

const tabTitles: Record<Tab, string> = {
  model: 'Model',
  mcp: 'MCP Servers',
  workspace: 'Workspace',
  appearance: 'Appearance',
  about: 'About'
}

export default function SettingsDrawer(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<Tab>('model')
  const setShowSettings = useUIStore((s) => s.setShowSettings)

  const ActiveContent = tabContent[activeTab]

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={() => setShowSettings(false)}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-[480px] bg-pure-black border-l border-border-mist-08 flex">
        {/* Left tab nav */}
        <div className="w-14 flex flex-col items-center py-4 gap-1 border-r border-border-mist-06">
          {tabs.map(({ id, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`w-10 h-10 flex items-center justify-center rounded-default transition-colors cursor-pointer ${
                activeTab === id
                  ? 'bg-surface-elevated text-electric-cyan'
                  : 'text-text-muted hover:text-text-secondary'
              }`}
              title={tabTitles[id]}
            >
              <Icon size={18} />
            </button>
          ))}
        </div>

        {/* Right content area */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border-mist-06">
            <h2 className="text-lg font-medium text-text-primary">{tabTitles[activeTab]}</h2>
            <button
              onClick={() => setShowSettings(false)}
              className="text-text-muted hover:text-text-primary transition-colors cursor-pointer p-1"
            >
              <X size={18} />
            </button>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto px-6 py-6">
            <ActiveContent />
          </div>
        </div>
      </div>
    </>
  )
}
