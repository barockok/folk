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
  rightSidebarCollapsed: boolean
  tweaksOpen: boolean
  windowBlurred: boolean
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
  toggleRightSidebar: () => void
  setTweaksOpen: (v: boolean) => void
  toggleTweaks: () => void
  setWindowBlurred: (v: boolean) => void
  setForceOnboarding: (v: boolean) => void
  openLightbox: (src: string) => void
  closeLightbox: () => void
  // Bump to ask SessionsPage to stage a fresh draft. Triggered from the
  // sidebar "+ New" button or anywhere else that wants a new session.
  newSessionTick: number
  requestNewSession: () => void
  // Path of a file the user opened in the in-app viewer (set from the
  // right-panel Files list). When non-null, the SessionsPage layout
  // splits 50/50 with the viewer and the right-sidebar is suppressed.
  viewerFilePath: string | null
  openFileViewer: (path: string) => void
  closeFileViewer: () => void
  sidebarWidth: number
  setSidebarWidth: (px: number) => void
}

export const SIDEBAR_MIN = 180
export const SIDEBAR_MAX = 380
export const SIDEBAR_DEFAULT = 232

export const useUIStore = create<UIState>((set) => ({
  page: (localStorage.getItem('folk.lastTab') as PageKey) || 'sessions',
  cmdkOpen: false,
  toasts: [],
  theme: (localStorage.getItem('folk.theme') as 'light' | 'dark') || 'light',
  density: (localStorage.getItem('folk.density') as 'compact' | 'regular') || 'compact',
  sidebarCollapsed: localStorage.getItem('folk.sidebarCollapsed') === '1',
  rightSidebarCollapsed: localStorage.getItem('folk.rightSidebarCollapsed') !== '0',
  tweaksOpen: false,
  windowBlurred: false,
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
  toggleRightSidebar: () =>
    set((st) => {
      const v = !st.rightSidebarCollapsed
      localStorage.setItem('folk.rightSidebarCollapsed', v ? '1' : '0')
      return { rightSidebarCollapsed: v }
    }),
  setTweaksOpen: (v) => set({ tweaksOpen: v }),
  toggleTweaks: () => set((st) => ({ tweaksOpen: !st.tweaksOpen })),
  setWindowBlurred: (v) => {
    document.documentElement.setAttribute('data-window-state', v ? 'blurred' : 'focused')
    set({ windowBlurred: v })
  },
  setForceOnboarding: (v) => set({ forceOnboarding: v }),
  toggleFolkSkill: (id) =>
    set((st) => {
      const next = { ...st.folkSkillsEnabled, [id]: !st.folkSkillsEnabled[id] }
      localStorage.setItem('folk.folkSkills', JSON.stringify(next))
      return { folkSkillsEnabled: next }
    }),
  openLightbox: (src) => set({ lightboxSrc: src }),
  closeLightbox: () => set({ lightboxSrc: null }),
  newSessionTick: 0,
  requestNewSession: () =>
    set((st) => ({ newSessionTick: st.newSessionTick + 1, page: 'sessions' })),
  viewerFilePath: null,
  openFileViewer: (path) => set({ viewerFilePath: path, page: 'sessions' }),
  closeFileViewer: () => set({ viewerFilePath: null }),
  sidebarWidth: (() => {
    const raw = Number(localStorage.getItem('folk.sidebarWidth'))
    if (!Number.isFinite(raw) || raw < SIDEBAR_MIN || raw > SIDEBAR_MAX) return SIDEBAR_DEFAULT
    return raw
  })(),
  setSidebarWidth: (px) => {
    const clamped = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(px)))
    localStorage.setItem('folk.sidebarWidth', String(clamped))
    set({ sidebarWidth: clamped })
  }
}))
