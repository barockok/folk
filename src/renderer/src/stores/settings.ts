import { create } from 'zustand'

interface SettingsState {
  fontSize: 'small' | 'medium' | 'large'
  compactMode: boolean
  workspacePath: string
  setFontSize: (size: 'small' | 'medium' | 'large') => void
  setCompactMode: (compact: boolean) => void
  setWorkspacePath: (path: string) => void
  loadSettings: () => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set) => ({
  fontSize: 'medium',
  compactMode: false,
  workspacePath: '',

  setFontSize: (fontSize: 'small' | 'medium' | 'large') => {
    set({ fontSize })
    window.folk.setSetting('fontSize', fontSize)
  },

  setCompactMode: (compactMode: boolean) => {
    set({ compactMode })
    window.folk.setSetting('compactMode', compactMode)
  },

  setWorkspacePath: (workspacePath: string) => {
    set({ workspacePath })
    window.folk.setSetting('workspacePath', workspacePath)
  },

  loadSettings: async () => {
    const [fontSize, compactMode, workspacePath] = await Promise.all([
      window.folk.getSetting('fontSize') as Promise<'small' | 'medium' | 'large' | null>,
      window.folk.getSetting('compactMode') as Promise<boolean | null>,
      window.folk.getCurrentWorkspace()
    ])

    set({
      fontSize: fontSize ?? 'medium',
      compactMode: compactMode ?? false,
      workspacePath: workspacePath ?? ''
    })
  }
}))
