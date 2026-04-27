// ModelPage.tsx — multi-provider manager (Task 30)
import { useState, useEffect } from 'react'
import type { ProviderConfig, ProviderAuthMode, ModelConfig, ClaudeCodeAuthStatus } from '@shared/types'
import { useProvidersStore } from '../stores/useProvidersStore'
import { useUIStore } from '../stores/useUIStore'
import { Icon, ProviderLogo } from '../components/icons'

function ClaudeCodeStatusField() {
  const status = useClaudeCodeAuth(true)
  return (
    <div className="field">
      <label className="label">Claude Code status</label>
      {status == null ? (
        <div className="hint">Checking…</div>
      ) : status.loggedIn ? (
        <div className="hint" style={{ color: 'var(--ok)' }}>
          <Icon name="check" size={12} /> Logged in
          {status.source === 'keychain' ? ' (macOS Keychain)' : ''}
          {status.email ? ` as ${status.email}` : ''}
        </div>
      ) : (
        <div className="hint" style={{ color: 'var(--warn)' }}>
          Not logged in. Run <code className="mono">claude login</code> in a terminal.
        </div>
      )}
    </div>
  )
}

function useClaudeCodeAuth(enabled: boolean): ClaudeCodeAuthStatus | null {
  const [status, setStatus] = useState<ClaudeCodeAuthStatus | null>(null)
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    void window.folk.auth.claudeCodeStatus().then((s) => {
      if (!cancelled) setStatus(s)
    })
    return () => {
      cancelled = true
    }
  }, [enabled])
  return status
}

function AddModelForm({ onAdd }: { onAdd: (id: string, label: string) => void }) {
  const [id, setId] = useState('')
  const [label, setLabel] = useState('')
  const handleAdd = () => {
    if (!id.trim()) return
    onAdd(id, label)
    setId('')
    setLabel('')
  }
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr auto',
        gap: 8,
        marginTop: 8,
        padding: '8px 0',
        borderTop: '1px dashed var(--border)'
      }}
    >
      <input
        className="input mono"
        placeholder="model-id (e.g. gpt-4o-mini)"
        value={id}
        onChange={(e) => setId(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            handleAdd()
          }
        }}
      />
      <input
        className="input"
        placeholder="display label (optional)"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            handleAdd()
          }
        }}
      />
      <button className="btn" type="button" onClick={handleAdd} disabled={!id.trim()}>
        <Icon name="plus" size={13} /> Add
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Preset data (verbatim from spec)
// ---------------------------------------------------------------------------

export interface ProviderPreset {
  id: string
  name: string
  brand: 'anthropic' | 'openrouter' | 'opencode' | 'custom'
  baseUrl: string | null
  keyLabel: string
  noAuth?: boolean
  fetchable: boolean
  description: string
  // True when folk's local bridge proxy handles routing (opencode). The Base
  // URL field is hidden in the UI and the saved baseUrl is null — the
  // agent-manager rewrites ANTHROPIC_BASE_URL to the loopback proxy at
  // runtime.
  proxied?: boolean
  // Informational endpoint string shown in the detail header in place of the
  // editable Base URL field, so the user can still see where their requests
  // ultimately go.
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

// ---------------------------------------------------------------------------
// AddProviderModal
// ---------------------------------------------------------------------------

interface AddProviderModalProps {
  usedIds: string[]
  onAdd: (p: ProviderConfig) => void
  onClose: () => void
}

function AddProviderModal({ usedIds, onAdd, onClose }: AddProviderModalProps) {
  const [selectedId, setSelectedId] = useState<string>('')
  const [name, setName] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [authMode, setAuthMode] = useState<ProviderAuthMode>('api-key')
  const [saving, setSaving] = useState(false)
  const ccStatus = useClaudeCodeAuth(selectedId === 'anthropic' && authMode === 'claude-code')

  const available = PROVIDER_PRESETS.filter((p) => !usedIds.includes(p.id))
  const preset = selectedId && selectedId !== CUSTOM_PRESET_ID ? presetFor(selectedId) : null

  const handlePresetChange = (id: string) => {
    setSelectedId(id)
    setAuthMode('api-key')
    if (id === CUSTOM_PRESET_ID) {
      setName('')
      setBaseUrl('')
    } else {
      const p = presetFor(id)
      if (p) {
        setName(p.name)
        setBaseUrl(p.baseUrl ?? '')
      }
    }
  }

  const handleAdd = async () => {
    const resolvedName = name.trim() || preset?.name || 'Custom'
    const resolvedModels: ModelConfig[] =
      preset?.models.map((m) => ({ id: m.id, label: m.label, enabled: true })) ?? []

    const newProvider: ProviderConfig = {
      id: selectedId === CUSTOM_PRESET_ID ? crypto.randomUUID() : selectedId || crypto.randomUUID(),
      name: resolvedName,
      apiKey: authMode === 'claude-code' ? '' : preset?.noAuth ? 'public' : apiKey.trim(),
      authMode: selectedId === 'anthropic' ? authMode : 'api-key',
      baseUrl: baseUrl.trim() || null,
      models: resolvedModels,
      isEnabled: true,
      createdAt: Date.now()
    }

    setSaving(true)
    onAdd(newProvider)
  }

  const needsKey =
    !(selectedId === 'anthropic' && authMode === 'claude-code') && !preset?.noAuth
  const canAdd =
    selectedId.length > 0 &&
    (selectedId !== CUSTOM_PRESET_ID || name.trim().length > 0) &&
    (!needsKey || apiKey.trim().length > 0)

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd">
          <div className="grow">
            <div className="eyebrow">Connect</div>
            <h2 className="h2" style={{ marginTop: 4 }}>
              Add a provider
            </h2>
          </div>
          <button className="btn btn-icon btn-plain" onClick={onClose}>
            <Icon name="x" size={14} />
          </button>
        </div>

        <div className="modal-bd" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p className="sub" style={{ marginBottom: 0 }}>
            Pick from supported providers, or add a custom OpenAI-compatible endpoint.
          </p>

          {/* Provider picker — presets as clickable cards */}
          <div style={{ display: 'grid', gap: 8 }}>
            {available.map((p) => (
              <button
                key={p.id}
                className={'model-opt' + (selectedId === p.id ? ' selected' : '')}
                onClick={() => handlePresetChange(p.id)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 14, textAlign: 'left', padding: 14 }}
              >
                <ProviderLogo brand={p.brand} size={36} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="name" style={{ fontSize: 14 }}>
                    {p.name}
                  </span>
                  <span className="desc" style={{ fontSize: 12, marginTop: 0 }}>
                    {p.description}
                  </span>
                </span>
                {selectedId === p.id && <Icon name="check" size={14} />}
              </button>
            ))}

            <button
              className={'model-opt' + (selectedId === CUSTOM_PRESET_ID ? ' selected' : '')}
              onClick={() => handlePresetChange(CUSTOM_PRESET_ID)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 14, textAlign: 'left', padding: 14 }}
            >
              <ProviderLogo brand="custom" size={36} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="name" style={{ fontSize: 14 }}>
                  Custom URL
                </span>
                <span className="desc" style={{ fontSize: 12, marginTop: 0 }}>
                  Any Anthropic-compatible endpoint
                </span>
              </span>
              {selectedId === CUSTOM_PRESET_ID && <Icon name="check" size={14} />}
            </button>
          </div>

          {/* Fields shown after selection */}
          {selectedId && (
            <>
              {selectedId === CUSTOM_PRESET_ID && (
                <div className="field">
                  <label className="label">Provider name</label>
                  <input
                    className="input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. My self-hosted LLM"
                    autoFocus
                  />
                </div>
              )}

              {!preset?.proxied && (
                <div className="field">
                  <label className="label">Base URL</label>
                  <input
                    className="input mono"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="https://api.example.com/v1"
                  />
                </div>
              )}
              {preset?.proxied && (
                <div className="field">
                  <label className="label">Endpoint</label>
                  <div className="hint">
                    <code className="mono">{preset.upstreamLabel ?? 'managed by folk'}</code>
                  </div>
                </div>
              )}

              {selectedId === 'anthropic' && (
                <div className="field">
                  <label className="label">How to authenticate</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <button
                      type="button"
                      className={'model-opt' + (authMode === 'api-key' ? ' selected' : '')}
                      onClick={() => setAuthMode('api-key')}
                      style={{ padding: 12, textAlign: 'left' }}
                    >
                      <span className="name" style={{ fontSize: 13 }}>API key</span>
                      <span className="desc" style={{ fontSize: 11, marginTop: 2 }}>
                        Paste an Anthropic API key
                      </span>
                    </button>
                    <button
                      type="button"
                      className={'model-opt' + (authMode === 'claude-code' ? ' selected' : '')}
                      onClick={() => setAuthMode('claude-code')}
                      style={{ padding: 12, textAlign: 'left' }}
                    >
                      <span className="name" style={{ fontSize: 13 }}>Use Claude Code login</span>
                      <span className="desc" style={{ fontSize: 11, marginTop: 2 }}>
                        Reuse your existing subscription
                      </span>
                    </button>
                  </div>
                </div>
              )}

              {preset?.noAuth ? (
                <div className="field">
                  <label className="label">Authentication</label>
                  <div className="hint">
                    No key required. Uses <code className="mono">Bearer public</code> against{' '}
                    <code className="mono">opencode.ai/zen</code>.
                  </div>
                </div>
              ) : needsKey ? (
                <div className="field">
                  <label className="label">{preset?.keyLabel ?? 'API key'}</label>
                  <input
                    className="input mono"
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Paste key"
                  />
                  <div className="hint">Stored locally. Never synced.</div>
                </div>
              ) : (
                <div className="field">
                  <label className="label">Claude Code status</label>
                  {ccStatus == null ? (
                    <div className="hint">Checking…</div>
                  ) : ccStatus.loggedIn ? (
                    <div className="hint" style={{ color: 'var(--ok)' }}>
                      <Icon name="check" size={12} /> Logged in
                      {ccStatus.source === 'keychain' ? ' (macOS Keychain)' : ''}
                      {ccStatus.email ? ` as ${ccStatus.email}` : ''}
                    </div>
                  ) : (
                    <div className="hint" style={{ color: 'var(--warn)' }}>
                      Not logged in. Run <code className="mono">claude login</code> in a terminal, then reopen this dialog.
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div className="modal-ft">
          <button className="btn btn-plain" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleAdd} disabled={!canAdd || saving}>
            {saving ? 'Adding…' : 'Add provider'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main ModelPage
// ---------------------------------------------------------------------------

export function ModelPage() {
  const { providers, hydrated, load, save, remove } = useProvidersStore()
  const toast = useUIStore((s) => s.toast)

  const [activeId, setActiveId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [reveal, setReveal] = useState(false)
  const [testing, setTesting] = useState(false)
  const [fetchingModels, setFetchingModels] = useState(false)

  // Draft edits for the active provider
  const [draft, setDraft] = useState<ProviderConfig | null>(null)

  useEffect(() => {
    if (!hydrated) load()
  }, [hydrated, load])

  // Sync activeId when providers load or change
  useEffect(() => {
    if (!hydrated) return
    if (providers.length === 0) {
      setActiveId(null)
      setDraft(null)
      return
    }
    const stillExists = activeId && providers.find((p) => p.id === activeId)
    if (!stillExists) {
      setActiveId(providers[0].id)
    }
  }, [hydrated, providers])

  // Sync draft when active tab changes
  useEffect(() => {
    if (!activeId) return
    const p = providers.find((p) => p.id === activeId)
    if (p) setDraft(structuredClone(p))
  }, [activeId, providers])

  const active = providers.find((p) => p.id === activeId)
  const preset = active ? presetFor(active.id) : null
  const usedIds = providers.map((p) => p.id)

  const isDirty = active && draft && JSON.stringify(draft) !== JSON.stringify(active)

  const handleSave = async () => {
    if (!draft) return
    try {
      await save(draft)
      toast({ kind: 'ok', text: 'Provider saved' })
    } catch (err) {
      toast({ kind: 'err', text: `Save failed: ${(err as Error).message}` })
    }
  }

  const handleTest = async () => {
    if (!active) return
    setTesting(true)
    try {
      const res = await window.folk.providers.test(active.id)
      if (res.ok) {
        toast({ kind: 'ok', text: 'Connection verified' })
      } else {
        toast({ kind: 'err', text: res.error ?? 'Connection failed — check the key' })
      }
    } catch (err) {
      toast({ kind: 'err', text: (err as Error).message })
    } finally {
      setTesting(false)
    }
  }

  const handleFetchModels = async () => {
    if (!draft || !active) return
    const def = presetFor(active.id)
    if (!def?.fetchable) return
    setFetchingModels(true)
    try {
      const res = await window.folk.providers.fetchModels({
        presetId: active.id,
        apiKey: def.noAuth ? 'public' : draft.apiKey,
        baseUrl: draft.baseUrl ?? def.baseUrl ?? undefined
      })
      if (!res.ok) {
        toast({ kind: 'err', text: res.error ?? 'Fetch failed' })
        return
      }
      // Merge: keep enabled flag for models the user already had.
      const prev = new Map(draft.models.map((m) => [m.id, m]))
      const merged: ModelConfig[] = res.models.map((m) => {
        const existing = prev.get(m.id)
        return existing ? { ...m, enabled: existing.enabled } : m
      })
      setDraft({ ...draft, models: merged })
      toast({ kind: 'ok', text: `Fetched ${merged.length} models` })
    } catch (err) {
      toast({ kind: 'err', text: (err as Error).message })
    } finally {
      setFetchingModels(false)
    }
  }

  const handleRemove = async () => {
    if (!active) return
    if (!window.confirm(`Remove ${active.name}? All model settings will be lost.`)) return
    try {
      await remove(active.id)
      toast({ kind: 'ok', text: 'Provider removed' })
    } catch (err) {
      toast({ kind: 'err', text: `Remove failed: ${(err as Error).message}` })
    }
  }

  const handleAddProvider = async (p: ProviderConfig) => {
    try {
      const def = presetFor(p.id)
      let provider = p
      if (def?.fetchable && (def.noAuth || p.apiKey)) {
        try {
          const res = await window.folk.providers.fetchModels({
            presetId: p.id,
            apiKey: def.noAuth ? 'public' : p.apiKey,
            baseUrl: p.baseUrl ?? def.baseUrl ?? undefined
          })
          if (res.ok && res.models.length > 0) {
            provider = { ...p, models: res.models }
          }
        } catch {
          // non-fatal — user can fetch later
        }
      }
      await save(provider)
      setActiveId(provider.id)
      setShowAdd(false)
      toast({ kind: 'ok', text: `${provider.name} added` })
    } catch (err) {
      toast({ kind: 'err', text: `Add failed: ${(err as Error).message}` })
    }
  }

  const toggleModel = (idx: number) => {
    if (!draft) return
    const models = draft.models.map((m, i) =>
      i === idx ? { ...m, enabled: !m.enabled } : m
    )
    setDraft({ ...draft, models })
  }

  const addModel = (id: string, label: string) => {
    if (!draft) return
    const trimmedId = id.trim()
    if (!trimmedId) return
    if (draft.models.some((m) => m.id === trimmedId)) {
      toast({ kind: 'warn', text: `Model ${trimmedId} already exists.` })
      return
    }
    setDraft({
      ...draft,
      models: [...draft.models, { id: trimmedId, label: label.trim() || trimmedId, enabled: true }]
    })
  }

  const removeModel = (idx: number) => {
    if (!draft) return
    const models = draft.models.filter((_, i) => i !== idx)
    setDraft({ ...draft, models })
  }

  const updateDraft = (patch: Partial<ProviderConfig>) => {
    if (!draft) return
    setDraft({ ...draft, ...patch })
  }

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  if (!hydrated) {
    return (
      <div className="page">
        <div style={{ padding: 32, color: 'var(--fg-faint)' }}>Loading providers…</div>
      </div>
    )
  }

  return (
    <div className="page">
      {/* Header */}
      <div className="page-head">
        <div className="grow">
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            Configure
          </div>
          <h1 className="h1">Models &amp; Providers</h1>
          <div className="sub">
            Bring any OpenAI- or Anthropic-compatible endpoint. Configure several providers and switch per-session.
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
          <Icon name="plus" size={13} /> Add provider
        </button>
      </div>

      {/* Provider tabs */}
      {providers.length > 0 && (
        <div className="prov-tabs">
          {providers.map((p) => {
            const def = presetFor(p.id)
            const enabledCount = p.models.filter((m) => m.enabled).length
            return (
              <button
                key={p.id}
                className={'prov-tab' + (activeId === p.id ? ' on' : '')}
                onClick={() => setActiveId(p.id)}
              >
                <ProviderLogo brand={def?.brand ?? 'custom'} size={18} />
                <span>{def?.name ?? p.name}</span>
                <span className="count">{enabledCount}</span>
              </button>
            )
          })}
          <button className="prov-tab add-new" onClick={() => setShowAdd(true)}>
            <Icon name="plus" size={12} /> Add
          </button>
        </div>
      )}

      {/* Empty state */}
      {providers.length === 0 && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12,
            padding: '64px 0',
            color: 'var(--fg-faint)'
          }}
        >
          <Icon name="cpu" size={32} />
          <div style={{ fontSize: 14, color: 'var(--body)' }}>No providers configured yet.</div>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
            <Icon name="plus" size={13} /> Add your first provider
          </button>
        </div>
      )}

      {/* Provider detail panel */}
      {draft && active && (
        <>
          {/* Provider header */}
          <div className="prov-head">
            <ProviderLogo brand={preset?.brand ?? 'custom'} size={44} />
            <div className="prov-info">
              <div className="prov-name">{preset?.name ?? active.name}</div>
              <div className="prov-sub">
                {preset?.proxied
                  ? (preset.upstreamLabel ?? 'managed by folk')
                  : (active.baseUrl ?? 'Anthropic default endpoint')}
              </div>
            </div>

            <button
              className="btn btn-sm btn-plain"
              onClick={handleTest}
              disabled={testing}
              title="Test connection"
            >
              <Icon name="play" size={12} /> {testing ? 'Testing…' : 'Test'}
            </button>

            {isDirty && (
              <button className="btn btn-sm btn-primary" onClick={handleSave}>
                Save
              </button>
            )}

            {providers.length > 1 && (
              <button
                className="btn btn-sm btn-plain btn-danger"
                onClick={handleRemove}
                title="Remove provider"
              >
                <Icon name="trash" size={12} />
              </button>
            )}
          </div>

          {/* Credentials section */}
          <div className="section">
            <div className="section-head">
              <h2 className="h2">Credentials</h2>
            </div>

            {active.id === 'anthropic' && (
              <div className="field">
                <label className="label">How to authenticate</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <button
                    type="button"
                    className={'model-opt' + (draft.authMode !== 'claude-code' ? ' selected' : '')}
                    onClick={() => updateDraft({ authMode: 'api-key' })}
                    style={{ padding: 12, textAlign: 'left' }}
                  >
                    <span className="name" style={{ fontSize: 13 }}>API key</span>
                    <span className="desc" style={{ fontSize: 11, marginTop: 2 }}>
                      Paste an Anthropic API key
                    </span>
                  </button>
                  <button
                    type="button"
                    className={'model-opt' + (draft.authMode === 'claude-code' ? ' selected' : '')}
                    onClick={() => updateDraft({ authMode: 'claude-code', apiKey: '' })}
                    style={{ padding: 12, textAlign: 'left' }}
                  >
                    <span className="name" style={{ fontSize: 13 }}>Use Claude Code login</span>
                    <span className="desc" style={{ fontSize: 11, marginTop: 2 }}>
                      Reuse your existing subscription
                    </span>
                  </button>
                </div>
              </div>
            )}

            {draft.authMode === 'claude-code' ? (
              <ClaudeCodeStatusField />
            ) : preset?.noAuth ? (
              <div className="field">
                <label className="label">Authentication</label>
                <div className="hint">
                  No key required. Uses <code className="mono">Bearer public</code> against{' '}
                  <code className="mono">opencode.ai/zen</code>.
                </div>
              </div>
            ) : (
              <div className="field">
                <label className="label">{preset?.keyLabel ?? 'API key'}</label>
                <div style={{ position: 'relative' }}>
                  <input
                    className="input mono"
                    type={reveal ? 'text' : 'password'}
                    value={draft.apiKey}
                    placeholder="Paste key"
                    onChange={(e) => updateDraft({ apiKey: e.target.value })}
                    style={{ paddingRight: 80 }}
                  />
                  <button
                    className="btn btn-sm btn-plain"
                    style={{ position: 'absolute', right: 4, top: 3 }}
                    onClick={() => setReveal((r) => !r)}
                  >
                    {reveal ? 'Hide' : 'Show'}
                  </button>
                </div>
                <div className="hint">Stored locally. Never synced.</div>
              </div>
            )}

            {preset?.proxied ? (
              <div className="field">
                <label className="label">Endpoint</label>
                <div className="hint">
                  Routed through folk's local OpenCode bridge —{' '}
                  <code className="mono">{preset.upstreamLabel ?? 'managed by folk'}</code>.
                </div>
              </div>
            ) : (
              <div className="field">
                <label className="label">
                  Base URL{' '}
                  <span style={{ color: 'var(--fg-faint)', fontWeight: 400 }}>
                    (override for proxies or self-hosted)
                  </span>
                </label>
                <input
                  className="input mono"
                  value={draft.baseUrl ?? ''}
                  onChange={(e) => updateDraft({ baseUrl: e.target.value || null })}
                />
              </div>
            )}
          </div>

          {/* Models section */}
          <div className="section" style={{ marginTop: 16 }}>
            <div className="section-head" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <h2 className="h2" style={{ flex: 1 }}>
                Models
              </h2>
              {draft.authMode !== 'claude-code' && (
                <>
                  <span className="sub" style={{ fontSize: 13 }}>
                    {draft.models.filter((m) => m.enabled).length} of {draft.models.length} enabled
                  </span>
                  {preset?.fetchable && (
                    <button
                      className="btn btn-sm btn-plain"
                      onClick={handleFetchModels}
                      disabled={fetchingModels}
                      title="Fetch model list from upstream"
                      type="button"
                    >
                      <Icon name="refresh" size={12} />{' '}
                      {fetchingModels ? 'Fetching…' : 'Fetch models'}
                    </button>
                  )}
                </>
              )}
            </div>

            {draft.authMode === 'claude-code' ? (
              <div
                style={{
                  color: 'var(--fg-faint)',
                  fontSize: 13,
                  padding: '8px 0',
                  lineHeight: 1.5
                }}
              >
                Model is managed by your Claude Code subscription. Pinning or disabling
                individual models doesn't apply here — the SDK picks based on your plan.
              </div>
            ) : (
              <>
                {draft.models.length === 0 && (
                  <div style={{ color: 'var(--fg-faint)', fontSize: 13, padding: '8px 0' }}>
                    No models added yet. Use the form below to add one.
                  </div>
                )}

                {draft.models.map((m, i) => (
                  <div key={m.id} className="model-row">
                    <div className="m-main">
                      <div className="m-name">{m.label || m.id}</div>
                      <div className="m-meta">
                        <span style={{ color: 'var(--fg-faint)' }}>{m.id}</span>
                        {m.contextWindow != null && (
                          <span>
                            <Icon name="clock" size={11} /> {Math.round(m.contextWindow / 1000)}K ctx
                          </span>
                        )}
                        {m.maxOutput != null && (
                          <span>
                            <Icon name="arrow-right" size={11} /> {Math.round(m.maxOutput / 1000)}K out
                          </span>
                        )}
                      </div>
                    </div>
                    <div
                      className={'switch' + (m.enabled ? ' on' : '')}
                      onClick={() => toggleModel(i)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          toggleModel(i)
                        }
                      }}
                      role="switch"
                      tabIndex={0}
                      aria-checked={m.enabled}
                    />
                    <button
                      className="btn btn-icon btn-sm btn-plain"
                      title="Remove model"
                      onClick={() => removeModel(i)}
                      type="button"
                    >
                      <Icon name="trash" size={13} />
                    </button>
                  </div>
                ))}
                <AddModelForm onAdd={addModel} />
              </>
            )}
          </div>
        </>
      )}

      {/* Add provider modal */}
      {showAdd && (
        <AddProviderModal
          usedIds={usedIds}
          onAdd={handleAddProvider}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  )
}
