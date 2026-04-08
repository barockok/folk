import { create } from 'zustand'

interface UIState {
  showArtifactPanel: boolean
  showSettings: boolean
  showActivityLog: boolean
  sidebarCollapsed: boolean
  sidebarWidth: number
  artifactPanelWidth: number
  toggleArtifactPanel: () => void
  toggleSettings: () => void
  toggleActivityLog: () => void
  toggleSidebar: () => void
  setShowSettings: (show: boolean) => void
  setSidebarWidth: (w: number) => void
  setArtifactPanelWidth: (w: number) => void
}

export const useUIStore = create<UIState>((set) => ({
  showArtifactPanel: false,
  showSettings: false,
  showActivityLog: false,
  sidebarCollapsed: false,
  sidebarWidth: 260,
  artifactPanelWidth: 400,

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
  },

  setSidebarWidth: (w: number) => {
    set({ sidebarWidth: w })
  },

  setArtifactPanelWidth: (w: number) => {
    set({ artifactPanelWidth: w })
  }
}))
