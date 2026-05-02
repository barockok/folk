import { useEffect } from 'react'
import { Shell } from './components/Shell'
import { UpdateBanner } from './components/UpdateBanner'
import { useAgent } from './hooks/useAgent'
import { useUpdater } from './hooks/useUpdater'
import { useUIStore } from './stores/useUIStore'
import { useProfileStore } from './stores/useProfileStore'
import { useProvidersStore } from './stores/useProvidersStore'
import { useMCPStore } from './stores/useMCPStore'
import { FirstRunOnboarding } from './onboarding/FirstRunOnboarding'
import { Lightbox } from './components/Lightbox'
import { SessionsPage } from './pages/SessionsPage'
import { MCPPage } from './pages/MCPPage'
import { ModelPage } from './pages/ModelPage'
import { SkillsPage } from './pages/SkillsPage'
import { PluginsPage } from './pages/PluginsPage'
import { KeybindingsPage } from './pages/KeybindingsPage'
import { ProfilePage } from './pages/ProfilePage'

export default function App() {
  useAgent()
  useUpdater()
  const { page, theme, density } = useUIStore()

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    document.documentElement.setAttribute('data-density', density)
    try { window.folk?.app?.reportTheme(theme) } catch { /* preload not ready */ }
  }, [theme, density])

  useEffect(() => {
    void useProfileStore.getState().load()
    void useProvidersStore.getState().load()
    void useMCPStore.getState().load()
  }, [])

  const onboarded = localStorage.getItem('folk.onboarded') === '1'
  const forceOnboarding = useUIStore((s) => s.forceOnboarding)

  return (
    <>
      <UpdateBanner />
      <Shell>
        {page === 'sessions' && <SessionsPage />}
        {page === 'mcp' && <MCPPage />}
        {page === 'model' && <ModelPage />}
        {page === 'skills' && <SkillsPage />}
        {page === 'plugins' && <PluginsPage />}
        {page === 'keybindings' && <KeybindingsPage />}
        {page === 'profile' && <ProfilePage />}
      </Shell>
      {(!onboarded || forceOnboarding) && <FirstRunOnboarding force={forceOnboarding} />}
      <Lightbox />
    </>
  )
}
