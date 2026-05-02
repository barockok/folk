import { create } from 'zustand'
import { INITIAL_SKILLS } from '../data'

export type PageKey =
  | 'sessions'
  | 'mcp'
  | 'skills'
  | 'plugins'
  | 'model'
  | 'keybindings'
  | 'profile'

export interface Toast {
  id: string
  kind: 'info' | 'ok' | 'warn' | 'err'
  text: string
}

interface UIState {
  page: PageKey
  cmdkOpen: boolean
  toasts: Toast[]
  theme: 'light' | 'dark'
  density: 'compact' | 'regular'
  sidebarCollapsed: boolean
  forceOnboarding: boolean
  folkSkillsEnabled: Record<string, boolean>
  lightboxSrc: string | null
  toggleFolkSkill: (id: string) => void
  setPage: (p: PageKey) => void
  openCmdk: () => void
  closeCmdk: () => void
  toast: (t: Omit<Toast, 'id'>) => void
  dismissToast: (id: string) => void
  setTheme: (t: 'light' | 'dark') => void
  setDensity: (d: 'compact' | 'regular') => void
  toggleSidebar: () => void
  setForceOnboarding: (v: boolean) => void
  openLightbox: (src: string) => void
  closeLightbox: () => void
}

export const useUIStore = create<UIState>((set) => ({
  page: (localStorage.getItem('folk.lastTab') as PageKey) || 'sessions',
  cmdkOpen: false,
  toasts: [],
  theme: (localStorage.getItem('folk.theme') as 'light' | 'dark') || 'light',
  density: (localStorage.getItem('folk.density') as 'compact' | 'regular') || 'compact',
  sidebarCollapsed: localStorage.getItem('folk.sidebarCollapsed') === '1',
  forceOnboarding: false,
  lightboxSrc: null,
  folkSkillsEnabled: (() => {
    const saved = localStorage.getItem('folk.folkSkills')
    if (saved) return JSON.parse(saved) as Record<string, boolean>
    return Object.fromEntries(INITIAL_SKILLS.map((s) => [s.id, s.enabled]))
  })(),
  setPage: (p) => {
    localStorage.setItem('folk.lastTab', p)
    set({ page: p })
  },
  openCmdk: () => set({ cmdkOpen: true }),
  closeCmdk: () => set({ cmdkOpen: false }),
  toast: (t) =>
    set((st) => ({ toasts: [...st.toasts, { ...t, id: crypto.randomUUID() }] })),
  dismissToast: (id) => set((st) => ({ toasts: st.toasts.filter((x) => x.id !== id) })),
  setTheme: (t) => {
    localStorage.setItem('folk.theme', t)
    document.documentElement.setAttribute('data-theme', t)
    // Inform main so the next cold launch can paint the BrowserWindow in the
    // matching color before the renderer is ready.
    try { window.folk?.app?.reportTheme(t) } catch { /* preload not ready */ }
    set({ theme: t })
  },
  setDensity: (d) => {
    localStorage.setItem('folk.density', d)
    document.documentElement.setAttribute('data-density', d)
    set({ density: d })
  },
  toggleSidebar: () =>
    set((st) => {
      const v = !st.sidebarCollapsed
      localStorage.setItem('folk.sidebarCollapsed', v ? '1' : '0')
      return { sidebarCollapsed: v }
    }),
  setForceOnboarding: (v) => set({ forceOnboarding: v }),
  toggleFolkSkill: (id) =>
    set((st) => {
      const next = { ...st.folkSkillsEnabled, [id]: !st.folkSkillsEnabled[id] }
      localStorage.setItem('folk.folkSkills', JSON.stringify(next))
      return { folkSkillsEnabled: next }
    }),
  openLightbox: (src) => set({ lightboxSrc: src }),
  closeLightbox: () => set({ lightboxSrc: null })
}))
