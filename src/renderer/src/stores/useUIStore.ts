import { create } from 'zustand'

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
  setPage: (p: PageKey) => void
  openCmdk: () => void
  closeCmdk: () => void
  toast: (t: Omit<Toast, 'id'>) => void
  dismissToast: (id: string) => void
  setTheme: (t: 'light' | 'dark') => void
  setDensity: (d: 'compact' | 'regular') => void
  toggleSidebar: () => void
}

export const useUIStore = create<UIState>((set) => ({
  page: (localStorage.getItem('folk.lastTab') as PageKey) || 'sessions',
  cmdkOpen: false,
  toasts: [],
  theme: (localStorage.getItem('folk.theme') as 'light' | 'dark') || 'light',
  density: (localStorage.getItem('folk.density') as 'compact' | 'regular') || 'compact',
  sidebarCollapsed: localStorage.getItem('folk.sidebarCollapsed') === '1',
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
    })
}))
