import { useEffect } from 'react'
import { Shell } from './components/Shell'
import { useAgent } from './hooks/useAgent'
import { useUpdater } from './hooks/useUpdater'
import { useGlobalCancelHotkey } from './hooks/useGlobalCancelHotkey'
import { useScrollFadeBars } from './hooks/useScrollFadeBars'
import { useTelemetry } from './hooks/useTelemetry'
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
  useGlobalCancelHotkey()
  useScrollFadeBars()
  useTelemetry()
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

  // Wire main-process menu items + window state events to the UI store.
  // Window blur/focus paints `data-window-state` on <html> so CSS can
  // desaturate sidebar accents to match macOS native app behavior.
  useEffect(() => {
    const api = window.folk?.app
    if (!api) return
    const offState = api.onWindowState((s) =>
      useUIStore.getState().setWindowBlurred(s === 'blurred')
    )
    const offTweaks = api.onOpenTweaks(() => useUIStore.getState().setTweaksOpen(true))
    const offCmdk = api.onOpenCmdk(() => useUIStore.getState().openCmdk())
    const offSidebar = api.onToggleSidebar(() => useUIStore.getState().toggleSidebar())
    const offNew = api.onNewSession(() => useUIStore.getState().setPage('sessions'))
    return () => {
      offState()
      offTweaks()
      offCmdk()
      offSidebar()
      offNew()
    }
  }, [])

  const onboarded = localStorage.getItem('folk.onboarded') === '1'
  const forceOnboarding = useUIStore((s) => s.forceOnboarding)

  return (
    <>
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
