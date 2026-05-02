import { useEffect } from 'react'
import { useUIStore } from '../stores/useUIStore'
import { useSessionStore } from '../stores/useSessionStore'

// Global Escape → cancel the active session's in-flight turn.
// Mirrors Claude Code CLI behavior. Skipped when a modal/popover/menu is
// open, when an editable input wants to consume Escape itself (slash menu,
// composer textarea — Composer's local handler manages those cases), or
// when no session is currently streaming.
export function useGlobalCancelHotkey() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return
      if (e.defaultPrevented) return

      const ui = useUIStore.getState()
      if (ui.cmdkOpen || ui.tweaksOpen || ui.lightboxSrc || ui.forceOnboarding) return

      const target = e.target as HTMLElement | null
      // Composer owns Esc inside its own surface (slash menu, textarea).
      // Modals/popovers manage their own dismissal.
      if (target?.closest?.('.composer, .slash-menu, .modal-backdrop, .modal-card, .perm-card, .sess-menu')) {
        return
      }

      const ss = useSessionStore.getState()
      const id = ss.activeId
      if (!id || !ss.streamingSessions.has(id)) return

      e.preventDefault()
      void window.folk.agent.cancel(id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
