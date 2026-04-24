import { create } from 'zustand'
import type { Profile } from '@shared/types'

interface ProfileState {
  profile: Profile | null
  load: () => Promise<void>
  save: (p: Profile) => Promise<void>
}

export const useProfileStore = create<ProfileState>((set) => ({
  profile: null,
  load: async () => set({ profile: await window.folk.profile.get() }),
  save: async (p) => {
    await window.folk.profile.save(p)
    set({ profile: p })
  }
}))
