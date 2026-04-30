import { useEffect } from 'react'
import { useProvidersStore } from '../stores/useProvidersStore'
import type { ModelConfig } from '@shared/types'

// Shown when the user hasn't fetched models yet — lets them start a session
// without going through the Model page first.
const FALLBACK_MODELS: Record<string, ModelConfig[]> = {
  anthropic: [
    { id: 'claude-opus-4-7', label: 'Claude Opus 4.7', enabled: true },
    { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', enabled: true },
    { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', enabled: true }
  ]
}

export function useProviders() {
  const { providers, hydrated, load, save, remove } = useProvidersStore()
  useEffect(() => {
    if (!hydrated) void load()
  }, [hydrated, load])
  return {
    providers,
    enabledModels: providers
      .filter((p) => p.isEnabled)
      .flatMap((p) => {
        const models = p.models.length > 0 ? p.models : (FALLBACK_MODELS[p.id] ?? [])
        return models
          .filter((m) => m.enabled)
          .map((m) => ({ providerId: p.id, providerName: p.name, ...m }))
      }),
    save,
    remove
  }
}
