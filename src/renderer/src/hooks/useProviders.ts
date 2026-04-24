import { useEffect } from 'react'
import { useProvidersStore } from '../stores/useProvidersStore'

export function useProviders() {
  const { providers, hydrated, load, save, remove } = useProvidersStore()
  useEffect(() => {
    if (!hydrated) void load()
  }, [hydrated, load])
  return {
    providers,
    enabledModels: providers
      .filter((p) => p.isEnabled)
      .flatMap((p) =>
        p.models
          .filter((m) => m.enabled)
          .map((m) => ({ providerId: p.id, providerName: p.name, ...m }))
      ),
    save,
    remove
  }
}
