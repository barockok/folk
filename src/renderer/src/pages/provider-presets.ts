export interface ProviderPreset {
  id: string
  name: string
  brand: 'anthropic' | 'openrouter' | 'opencode' | 'custom'
  baseUrl: string | null
  keyLabel: string
  noAuth?: boolean
  fetchable: boolean
  description: string
  proxied?: boolean
  upstreamLabel?: string
  models: Array<{ id: string; label: string }>
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    brand: 'anthropic',
    baseUrl: null,
    keyLabel: 'Anthropic API key',
    fetchable: true,
    description: 'Native Claude models. Models fetched from /v1/models.',
    models: []
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    brand: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    keyLabel: 'OpenRouter API key',
    fetchable: true,
    description: 'Unified gateway to 200+ models. Bearer auth.',
    models: []
  },
  {
    id: 'opencode-free',
    name: 'OpenCode (Free)',
    brand: 'opencode',
    baseUrl: null,
    keyLabel: 'No key required',
    noAuth: true,
    fetchable: true,
    proxied: true,
    upstreamLabel: 'opencode.ai/zen (via folk bridge)',
    description: 'Public free tier. Bearer public, models ending with -free.',
    models: []
  },
  {
    id: 'opencode-paid',
    name: 'OpenCode (Paid)',
    brand: 'opencode',
    baseUrl: null,
    keyLabel: 'OpenCode API key',
    fetchable: true,
    proxied: true,
    upstreamLabel: 'opencode.ai/zen (via folk bridge)',
    description: 'Paid tier. Bearer key from opencode.ai.',
    models: []
  }
]

export const CUSTOM_PRESET_ID = '__custom__'

export function presetFor(id: string): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find((p) => p.id === id)
}
