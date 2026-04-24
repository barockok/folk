import { create } from 'zustand'
import type { ProviderConfig } from '@shared/types'

interface ProvidersState {
  providers: ProviderConfig[]
  hydrated: boolean
  load: () => Promise<void>
  save: (p: ProviderConfig) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const useProvidersStore = create<ProvidersState>((set, get) => ({
  providers: [],
  hydrated: false,
  load: async () => {
    const providers = await window.folk.providers.list()
    set({ providers, hydrated: true })
  },
  save: async (p) => {
    await window.folk.providers.save(p)
    await get().load()
  },
  remove: async (id) => {
    await window.folk.providers.delete(id)
    await get().load()
  }
}))
