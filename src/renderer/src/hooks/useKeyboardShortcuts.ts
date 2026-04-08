import { useEffect } from 'react'
import { useConversationStore } from '../stores/conversation'
import { useUIStore } from '../stores/ui'
import { useAgentStore } from '../stores/agent'

export function useKeyboardShortcuts() {
  const createConversation = useConversationStore(s => s.createConversation)
  const toggleSettings = useUIStore(s => s.toggleSettings)
  const toggleSidebar = useUIStore(s => s.toggleSidebar)
  const toggleArtifactPanel = useUIStore(s => s.toggleArtifactPanel)
  const showSettings = useUIStore(s => s.showSettings)
  const showArtifactPanel = useUIStore(s => s.showArtifactPanel)
  const setShowSettings = useUIStore(s => s.setShowSettings)
  const isProcessing = useAgentStore(s => s.isProcessing)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey

      // Cmd+N — New conversation
      if (mod && e.key === 'n') {
        e.preventDefault()
        createConversation()
      }

      // Cmd+K — Focus search input
      if (mod && e.key === 'k') {
        e.preventDefault()
        const searchInput = document.querySelector('[data-search-input]') as HTMLInputElement
        searchInput?.focus()
      }

      // Cmd+, — Toggle settings
      if (mod && e.key === ',') {
        e.preventDefault()
        toggleSettings()
      }

      // Cmd+B — Toggle sidebar
      if (mod && e.key === 'b') {
        e.preventDefault()
        toggleSidebar()
      }

      // Cmd+W — Close artifact panel
      if (mod && e.key === 'w') {
        e.preventDefault()
        if (showArtifactPanel) {
          toggleArtifactPanel()
        }
      }

      // Escape — Stop agent / close settings / close artifact
      if (e.key === 'Escape') {
        if (showSettings) {
          setShowSettings(false)
        } else if (showArtifactPanel) {
          toggleArtifactPanel()
        } else if (isProcessing) {
          // Stop agent - need to get active conversation
          const activeId = useConversationStore.getState().activeConversationId
          if (activeId) {
            window.folk.stopAgent(activeId)
          }
        }
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [showSettings, showArtifactPanel, isProcessing])
}
