import { create } from 'zustand'
import type { ProviderConfig } from '@shared/types'
import { captureRenderer } from '../lib/telemetry'

function providerTypeOf(p: { id: string }): 'anthropic' | 'openai' | 'google' | 'openai-compatible' {
  switch (p.id) {
    case 'anthropic': return 'anthropic'
    case 'openai': return 'openai'
    case 'google': return 'google'
    default: return 'openai-compatible'
  }
}

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
    try {
      const providers = await window.folk.providers.list()
      set({ providers, hydrated: true })
    } catch (err) {
      console.error('[providers] load failed:', err)
      set({ hydrated: true })
    }
  },
  save: async (p) => {
    const isNew = !get().providers.some((existing) => existing.id === p.id)
    await window.folk.providers.save(p)
    await get().load()
    if (isNew) {
      captureRenderer('provider_added', { provider_type: providerTypeOf(p) })
    }
  },
  remove: async (id) => {
    const target = get().providers.find((p) => p.id === id)
    await window.folk.providers.delete(id)
    await get().load()
    if (target) {
      captureRenderer('provider_removed', { provider_type: providerTypeOf(target) })
    }
  }
}))
