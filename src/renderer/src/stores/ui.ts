import { create } from 'zustand'

interface UIState {
  showArtifactPanel: boolean
  showSettings: boolean
  showActivityLog: boolean
  sidebarCollapsed: boolean
  toggleArtifactPanel: () => void
  toggleSettings: () => void
  toggleActivityLog: () => void
  toggleSidebar: () => void
  setShowSettings: (show: boolean) => void
}

export const useUIStore = create<UIState>((set) => ({
  showArtifactPanel: false,
  showSettings: false,
  showActivityLog: false,
  sidebarCollapsed: false,

  toggleArtifactPanel: () => {
    set((state) => ({ showArtifactPanel: !state.showArtifactPanel }))
  },

  toggleSettings: () => {
    set((state) => ({ showSettings: !state.showSettings }))
  },

  toggleActivityLog: () => {
    set((state) => ({ showActivityLog: !state.showActivityLog }))
  },

  toggleSidebar: () => {
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed }))
  },

  setShowSettings: (show: boolean) => {
    set({ showSettings: show })
  }
}))
