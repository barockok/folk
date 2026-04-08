import { useEffect, useState } from 'react'
import { useIPC } from './hooks/useIPC'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useConversationStore } from './stores/conversation'
import { useUIStore } from './stores/ui'
import TitleBar from './components/TitleBar'
import Sidebar from './components/Sidebar/Sidebar'
import ChatPanel from './components/ChatPanel/ChatPanel'
import ArtifactPanel from './components/ArtifactPanel/ArtifactPanel'
import SettingsDrawer from './components/SettingsDrawer/SettingsDrawer'
import OnboardingWizard from './components/Onboarding/OnboardingWizard'
import ToastContainer from './components/ToastContainer'

function App(): React.JSX.Element {
  useIPC()
  useKeyboardShortcuts()

  const loadConversations = useConversationStore((s) => s.loadConversations)
  const showArtifactPanel = useUIStore((s) => s.showArtifactPanel)
  const showSettings = useUIStore((s) => s.showSettings)
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed)

  const [showOnboarding, setShowOnboarding] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function checkFirstLaunch(): Promise<void> {
      try {
        const workspace = await window.folk.getSetting('workspacePath')
        const modelPath = await window.folk.getSetting('modelPath')
        if (!workspace && !modelPath) {
          setShowOnboarding(true)
        }
      } catch {
        // If settings fail to load, show onboarding
        setShowOnboarding(true)
      } finally {
        setLoading(false)
      }
    }
    checkFirstLaunch()
  }, [])

  useEffect(() => {
    if (!showOnboarding && !loading) {
      loadConversations()
    }
  }, [showOnboarding, loading, loadConversations])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-void-black text-text-primary">
        <div className="text-text-secondary">Loading...</div>
      </div>
    )
  }

  if (showOnboarding) {
    return <OnboardingWizard onComplete={() => setShowOnboarding(false)} />
  }

  return (
    <div className="flex flex-col h-screen bg-void-black text-text-primary overflow-hidden">
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        {!sidebarCollapsed && <Sidebar />}
        <ChatPanel />
        {showArtifactPanel && <ArtifactPanel />}
      </div>
      {showSettings && <SettingsDrawer />}
      <ToastContainer />
    </div>
  )
}

export default App
