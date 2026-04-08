import { useEffect } from 'react'
import { useIPC } from './hooks/useIPC'
import { useConversationStore } from './stores/conversation'
import { useUIStore } from './stores/ui'
import TitleBar from './components/TitleBar'
import Sidebar from './components/Sidebar/Sidebar'
import ChatPanel from './components/ChatPanel/ChatPanel'
import ArtifactPanel from './components/ArtifactPanel/ArtifactPanel'
import SettingsDrawer from './components/SettingsDrawer/SettingsDrawer'

function App(): React.JSX.Element {
  useIPC()

  const loadConversations = useConversationStore((s) => s.loadConversations)
  const showArtifactPanel = useUIStore((s) => s.showArtifactPanel)
  const showSettings = useUIStore((s) => s.showSettings)

  useEffect(() => {
    loadConversations()
  }, [loadConversations])

  return (
    <div className="flex flex-col h-screen bg-void-black text-text-primary overflow-hidden">
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <ChatPanel />
        {showArtifactPanel && <ArtifactPanel />}
      </div>
      {showSettings && <SettingsDrawer />}
    </div>
  )
}

export default App
