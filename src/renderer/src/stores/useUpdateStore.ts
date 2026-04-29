import { create } from 'zustand'

export type UpdatePhase = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error'

interface UpdateState {
  phase: UpdatePhase
  version: string | null
  percent: number
  error: string | null
  dismissed: boolean
  setChecking: () => void
  setAvailable: (version: string) => void
  setNotAvailable: () => void
  setProgress: (percent: number) => void
  setDownloaded: (version: string) => void
  setError: (message: string) => void
  dismiss: () => void
  reset: () => void
}

export const useUpdateStore = create<UpdateState>((set) => ({
  phase: 'idle',
  version: null,
  percent: 0,
  error: null,
  dismissed: false,
  setChecking: () => set({ phase: 'checking', error: null }),
  setAvailable: (version) => set({ phase: 'available', version, percent: 0, dismissed: false }),
  setNotAvailable: () => set({ phase: 'idle', version: null }),
  setProgress: (percent) => set({ phase: 'downloading', percent }),
  setDownloaded: (version) => set({ phase: 'ready', version, percent: 100, dismissed: false }),
  setError: (message) => set({ phase: 'error', error: message }),
  dismiss: () => set({ dismissed: true }),
  reset: () => set({ phase: 'idle', version: null, percent: 0, error: null, dismissed: false })
}))
