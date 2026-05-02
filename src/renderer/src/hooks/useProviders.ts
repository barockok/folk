import { useEffect, useRef } from 'react'
import { useProvidersStore } from '../stores/useProvidersStore'
import type { ModelConfig } from '@shared/types'

// Used only when a dynamic fetch isn't possible — currently the Anthropic
// provider in `claude-code` auth mode (folk has no api key to call /v1/models
// with; credentials live in the OS keychain). Every other path resolves the
// real model list from the upstream API.
const STATIC_FALLBACK: Record<string, ModelConfig[]> = {
  anthropic: [
    { id: 'claude-opus-4-7', label: 'Claude Opus 4.7', enabled: true },
    { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', enabled: true },
    { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', enabled: true }
  ]
}

export function useProviders() {
  const { providers, hydrated, load, save, remove } = useProvidersStore()
  const fetchedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!hydrated) void load()
  }, [hydrated, load])

  // Lazily backfill an Anthropic provider's model list from /v1/models when
  // it's empty but we already have an api key. Avoids a hardcoded fallback
  // list that drifts from Anthropic's actual catalog. claude-code auth mode
  // can't be backfilled this way (no key in folk's DB) — those users go
  // through the Model page's "Fetch models" action.
  useEffect(() => {
    if (!hydrated) return
    for (const p of providers) {
      if (p.id !== 'anthropic') continue
      if (!p.isEnabled) continue
      if (p.models.length > 0) continue
      if (p.authMode === 'claude-code') continue
      if (!p.apiKey) continue
      if (fetchedRef.current.has(p.id)) continue
      fetchedRef.current.add(p.id)
      void (async () => {
        try {
          const res = await window.folk.providers.fetchModels({
            presetId: p.id,
            apiKey: p.apiKey,
            baseUrl: p.baseUrl ?? undefined
          })
          if (res.ok && res.models.length > 0) {
            await save({ ...p, models: res.models })
          }
        } catch {
          // best-effort — user can still trigger a manual fetch
        }
      })()
    }
  }, [providers, hydrated, save])

  return {
    providers,
    enabledModels: providers
      .filter((p) => p.isEnabled)
      .flatMap((p) => {
        const models =
          p.models.length > 0
            ? p.models
            : p.authMode === 'claude-code'
              ? (STATIC_FALLBACK[p.id] ?? [])
              : []
        return models
          .filter((m) => m.enabled)
          .map((m) => ({ providerId: p.id, providerName: p.name, ...m }))
      }),
    save,
    remove
  }
}
