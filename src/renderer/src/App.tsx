import { useEffect } from 'react'
import { Shell } from './components/Shell'
import { useAgent } from './hooks/useAgent'
import { useUpdater } from './hooks/useUpdater'
import { useGlobalCancelHotkey } from './hooks/useGlobalCancelHotkey'
import { useScrollFadeBars } from './hooks/useScrollFadeBars'
import { useTelemetry } from './hooks/useTelemetry'
import { useUIStore } from './stores/useUIStore'
import { useSessionStore } from './stores/useSessionStore'
import { useProfileStore } from './stores/useProfileStore'
import { useProvidersStore } from './stores/useProvidersStore'
import { useMCPStore } from './stores/useMCPStore'
import { PopoutShell } from './components/PopoutShell'
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

  useEffect(() => {
    const api = window.folk?.window
    if (!api) return
    void api.getPopouts().then((ids) => useUIStore.getState().setPopoutIds(ids))
    const off = api.onPopoutsChanged((ids) => useUIStore.getState().setPopoutIds(ids))
    return off
  }, [])

  // Sync theme/density changes written by another window (e.g. main window
  // changes theme → popup picks it up via the Web storage event, which fires
  // in all OTHER windows when localStorage is updated).
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'folk.theme' && (e.newValue === 'light' || e.newValue === 'dark')) {
        useUIStore.getState().setTheme(e.newValue)
      }
      if (e.key === 'folk.density' && (e.newValue === 'compact' || e.newValue === 'regular')) {
        useUIStore.getState().setDensity(e.newValue)
      }
      if (e.key === 'folk.activateSession' && e.newValue) {
        useSessionStore.getState().setActive(e.newValue)
        useUIStore.getState().setPage('sessions')
        localStorage.removeItem('folk.activateSession')
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const onboarded = localStorage.getItem('folk.onboarded') === '1'
  const forceOnboarding = useUIStore((s) => s.forceOnboarding)

  const popoutMatch = /^#?popout\/(.+)$/.exec(window.location.hash)
  if (popoutMatch) {
    return <PopoutShell sessionId={popoutMatch[1]} />
  }

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
