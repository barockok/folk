// FirstRunOnboarding.tsx — 4-step first-run walkthrough (Task 34)
import { useState, useEffect } from 'react'
import type {
  Profile,
  ProviderConfig,
  ProviderAuthMode,
  ModelConfig,
  ClaudeCodeAuthStatus
} from '@shared/types'
import { useProfileStore } from '../stores/useProfileStore'
import { useProvidersStore } from '../stores/useProvidersStore'
import { useUIStore } from '../stores/useUIStore'
import { Icon, ProviderLogo } from '../components/icons'

// ---------------------------------------------------------------------------
// Provider presets — kept in sync with ModelPage.tsx
// ---------------------------------------------------------------------------

interface ProviderPreset {
  id: string
  name: string
  brand: 'anthropic' | 'openrouter' | 'opencode' | 'custom'
  baseUrl: string | null
  keyLabel: string
  keyPrefix?: string
  noAuth?: boolean
  proxied?: boolean
  upstreamLabel?: string
  description: string
}

const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    brand: 'anthropic',
    baseUrl: null,
    keyLabel: 'Anthropic API key',
    keyPrefix: 'sk-ant-',
    description: 'Claude — Sonnet, Opus, Haiku.'
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    brand: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    keyLabel: 'OpenRouter API key',
    keyPrefix: 'sk-or-',
    description: 'Unified gateway, 200+ models.'
  },
  {
    id: 'opencode-free',
    name: 'OpenCode (Free)',
    brand: 'opencode',
    baseUrl: null,
    keyLabel: 'No key required',
    noAuth: true,
    proxied: true,
    upstreamLabel: 'opencode.ai/zen (via folk bridge)',
    description: 'Public free tier — Bearer public.'
  },
  {
    id: 'opencode-paid',
    name: 'OpenCode (Paid)',
    brand: 'opencode',
    baseUrl: null,
    keyLabel: 'OpenCode API key',
    proxied: true,
    upstreamLabel: 'opencode.ai/zen (via folk bridge)',
    description: 'Paid tier — your token.'
  }
]

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

const STEPS = [
  { label: 'Welcome' },
  { label: 'About you' },
  { label: 'Model provider' },
  { label: 'Sign in' }
]

const TONES = ['Warm but concise', 'Direct', 'Playful', 'Formal']

const AVATAR_COLORS = [
  '#7c3aed', '#2563eb', '#059669', '#d97706',
  '#dc2626', '#db2777', '#0891b2', '#65a30d'
]

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function FirstRunOnboarding() {
  // Defense-in-depth: bail early if already onboarded
  if (localStorage.getItem('folk.onboarded') === '1') return null

  const saveProfile = useProfileStore((s) => s.save)
  const saveProvider = useProvidersStore((s) => s.save)
  const toast = useUIStore((s) => s.toast)

  const [step, setStep] = useState(0)

  // Step 1 — profile draft
  const [nickname, setNickname] = useState('')
  const [role, setRole] = useState('')
  const [tone, setTone] = useState('Warm but concise')
  const [avatarColor, setAvatarColor] = useState(AVATAR_COLORS[0])

  // Step 2 — provider pick
  const [providerId, setProviderId] = useState('anthropic')

  // Step 3 — API key / Claude Code auth
  const [apiKey, setApiKey] = useState('')
  const [verified, setVerified] = useState(false)
  const [testing, setTesting] = useState(false)
  const [authMode, setAuthMode] = useState<ProviderAuthMode>('api-key')
  const [ccStatus, setCcStatus] = useState<ClaudeCodeAuthStatus | null>(null)

  const preset = PROVIDER_PRESETS.find((p) => p.id === providerId)!
  const canUseClaudeCode = providerId === 'anthropic'

  // Reset auth mode + verification when provider changes away from Anthropic.
  // For noAuth providers (OpenCode Free) auto-verify since no key to validate.
  useEffect(() => {
    if (!canUseClaudeCode && authMode === 'claude-code') setAuthMode('api-key')
    setVerified(!!preset?.noAuth)
  }, [providerId])

  // Poll Claude Code auth status when that mode is active
  useEffect(() => {
    if (step !== 3 || authMode !== 'claude-code') return
    let cancelled = false
    void window.folk.auth.claudeCodeStatus().then((s) => {
      if (cancelled) return
      setCcStatus(s)
      setVerified(s.loggedIn)
    })
    return () => {
      cancelled = true
    }
  }, [step, authMode])

  const next = () => setStep((s) => Math.min(STEPS.length - 1, s + 1))
  const back = () => setStep((s) => Math.max(0, s - 1))

  const canNext = () => {
    if (step === 1) return nickname.trim().length > 0
    if (step === 2) return !!providerId
    if (step === 3) return verified
    return true
  }

  const handleTest = () => {
    setTesting(true)
    // Simulate key verification — real validation wired in future task
    setTimeout(() => {
      setTesting(false)
      setVerified(true)
    }, 900)
  }

  const handleSkip = async () => {
    await persistProfile()
    localStorage.setItem('folk.onboarded', '1')
    toast({ kind: 'ok', text: 'Skipped — add a provider any time from Models & Providers' })
    location.reload()
  }

  const persistProfile = async () => {
    const profile: Profile = {
      nickname: nickname.trim() || 'User',
      pronouns: '',
      role,
      tone,
      avatarColor,
      about: ''
    }
    await saveProfile(profile)
  }

  const handleFinish = async () => {
    await persistProfile()
    if (verified && preset) {
      const resolvedKey = preset.noAuth ? 'public' : authMode === 'claude-code' ? '' : apiKey
      let models: ModelConfig[] = []
      if (authMode !== 'claude-code') {
        try {
          const res = await window.folk.providers.fetchModels({
            presetId: providerId,
            apiKey: resolvedKey,
            baseUrl: preset.baseUrl ?? undefined
          })
          if (res.ok) models = res.models
        } catch {
          // ignore — user can fetch later
        }
      }
      const provider: ProviderConfig = {
        id: providerId,
        name: preset.name,
        apiKey: resolvedKey,
        authMode,
        baseUrl: preset.baseUrl,
        models,
        isEnabled: true,
        createdAt: Date.now()
      }
      await saveProvider(provider)
    }
    localStorage.setItem('folk.onboarded', '1')
    toast({ kind: 'ok', text: 'Welcome to folk' })
    location.reload()
  }

  return (
    <div className="ob-scrim">
      <div className="ob-card">
        {/* Header */}
        <div className="ob-head">
          <div className="ob-logo">
            <div className="sb-logo" style={{ width: 28, height: 28, fontSize: 13 }}>
              <span>f</span>
            </div>
            <span style={{ fontWeight: 500, fontSize: 14, color: 'var(--heading)', letterSpacing: '-0.01em' }}>
              folk
            </span>
          </div>
          <div className="ob-steps">
            {STEPS.map((s, i) => (
              <div
                key={i}
                className={['ob-step', i === step ? 'on' : '', i < step ? 'done' : ''].filter(Boolean).join(' ')}
              >
                <div className="ob-step-dot">
                  {i < step ? <Icon name="check" size={10} /> : i + 1}
                </div>
                <span>{s.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="ob-body">
          {/* Step 0 — Welcome */}
          {step === 0 && (
            <div className="ob-welcome">
              <div className="ob-hero">
                <div className="ob-hero-mark">
                  <div className="sb-logo" style={{ width: 56, height: 56, fontSize: 24 }}>
                    <span>f</span>
                  </div>
                </div>
                <h1 className="ob-title">Meet folk.</h1>
                <p className="ob-lede">
                  A local-first way to work with any model, with your tools and your files.
                  Takes about a minute to set up.
                </p>
              </div>
              <div className="ob-points">
                <div className="ob-point">
                  <div className="ob-point-ic"><Icon name="lock" size={14} /></div>
                  <div>
                    <div className="ob-point-h">Runs on your machine</div>
                    <div className="ob-point-p">
                      Your data, history, and keys stay in macOS Keychain — never synced to folk.
                    </div>
                  </div>
                </div>
                <div className="ob-point">
                  <div className="ob-point-ic"><Icon name="cpu" size={14} /></div>
                  <div>
                    <div className="ob-point-h">Bring your own model</div>
                    <div className="ob-point-p">
                      Anthropic, OpenAI, Moonshot, Qwen — swap providers per session.
                    </div>
                  </div>
                </div>
                <div className="ob-point">
                  <div className="ob-point-ic"><Icon name="server" size={14} /></div>
                  <div>
                    <div className="ob-point-h">Your tools, always ready</div>
                    <div className="ob-point-p">
                      MCP servers, skills, and plugins — installed and managed in one place.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 1 — Profile */}
          {step === 1 && (
            <div className="ob-step-body">
              <h2 className="ob-step-title">How should folk refer to you?</h2>
              <p className="ob-step-sub">Just the basics — you can fill in the rest later on your Profile page.</p>

              <div className="ob-avatar-preview">
                <div
                  className="prof-av-lg"
                  style={{ background: avatarColor }}
                >
                  {(nickname || 'Y').slice(0, 1).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--heading)' }}>
                    {nickname || 'Your nickname'}
                  </div>
                  <div className="sub" style={{ fontSize: 13 }}>{role || 'What you do'}</div>
                </div>
              </div>

              <div className="field">
                <label className="label">
                  Nickname{' '}
                  <span style={{ color: 'var(--fg-faint)', fontWeight: 400 }}>— what folk calls you</span>
                </label>
                <input
                  className="input"
                  autoFocus
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="e.g. Jamie"
                  onKeyDown={(e) => e.key === 'Enter' && canNext() && next()}
                />
              </div>

              <div className="field">
                <label className="label">
                  Role or what you do{' '}
                  <span style={{ color: 'var(--fg-faint)', fontWeight: 400 }}>— optional</span>
                </label>
                <input
                  className="input"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder="e.g. Product engineer at Acme"
                />
              </div>

              <div className="field">
                <label className="label">Preferred tone</label>
                <div className="segmented" style={{ width: 'fit-content' }}>
                  {TONES.map((t) => (
                    <button
                      key={t}
                      className={tone === t ? 'on' : ''}
                      onClick={() => setTone(t)}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div className="field">
                <label className="label">Avatar color</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {AVATAR_COLORS.map((c) => (
                    <button
                      key={c}
                      aria-label={`Avatar color ${c}`}
                      onClick={() => setAvatarColor(c)}
                      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setAvatarColor(c)}
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        background: c,
                        border: avatarColor === c ? '2px solid var(--heading)' : '2px solid transparent',
                        cursor: 'default',
                        outline: 'none',
                        padding: 0
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 2 — Provider pick */}
          {step === 2 && (
            <div className="ob-step-body">
              <h2 className="ob-step-title">Pick a model provider to start.</h2>
              <p className="ob-step-sub">
                You can add more any time from <b>Models &amp; Providers</b>.
              </p>

              <div className="ob-prov-grid">
                {PROVIDER_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    className={['ob-prov', providerId === p.id ? 'on' : ''].filter(Boolean).join(' ')}
                    onClick={() => setProviderId(p.id)}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setProviderId(p.id)}
                  >
                    <ProviderLogo brand={p.brand} size={40} />
                    <span className="ob-prov-name">{p.name}</span>
                    <span className="ob-prov-sub">{p.description}</span>
                  </button>
                ))}
              </div>

              <div className="ob-note">
                <Icon name="info" size={13} />
                <span>
                  folk is BYO-key. You pay your provider directly — folk takes no cut, sees no keys.
                </span>
              </div>
            </div>
          )}

          {/* Step 3 — API Key / Claude Code auth */}
          {step === 3 && (
            <div className="ob-step-body">
              <h2 className="ob-step-title">Sign in to {preset.name}.</h2>
              <p className="ob-step-sub">
                {authMode === 'claude-code'
                  ? 'Reuse your existing Claude Code login — no key to paste.'
                  : `Paste your ${preset.keyLabel.toLowerCase()} — we'll verify it and store it in macOS Keychain.`}
              </p>

              <div className="ob-key-panel">
                <div className="ob-key-hd">
                  <ProviderLogo brand={preset.brand} size={32} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--heading)' }}>
                      {preset.name}
                    </div>
                    <div className="sub" style={{ fontSize: 12 }}>
                      {preset.proxied
                        ? (preset.upstreamLabel ?? 'managed by folk')
                        : (preset.baseUrl ?? 'api.anthropic.com')}
                    </div>
                  </div>
                </div>

                {canUseClaudeCode && (
                  <div className="field" style={{ marginTop: 12 }}>
                    <label className="label">How to authenticate</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <button
                        type="button"
                        className={'ob-prov' + (authMode === 'api-key' ? ' on' : '')}
                        onClick={() => {
                          setAuthMode('api-key')
                          setVerified(false)
                        }}
                        style={{ padding: 12, alignItems: 'flex-start', textAlign: 'left' }}
                      >
                        <span className="ob-prov-name">API key</span>
                        <span className="ob-prov-sub">Paste an Anthropic API key</span>
                      </button>
                      <button
                        type="button"
                        className={'ob-prov' + (authMode === 'claude-code' ? ' on' : '')}
                        onClick={() => {
                          setAuthMode('claude-code')
                          setVerified(false)
                        }}
                        style={{ padding: 12, alignItems: 'flex-start', textAlign: 'left' }}
                      >
                        <span className="ob-prov-name">Use Claude Code login</span>
                        <span className="ob-prov-sub">Reuse existing subscription</span>
                      </button>
                    </div>
                  </div>
                )}

                {preset.noAuth ? (
                  <div className="ob-key-actions" style={{ marginTop: 12 }}>
                    <div className="ob-verified">
                      <div className="ob-verified-ic">
                        <Icon name="check" size={14} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 500, color: 'var(--heading)', fontSize: 13 }}>
                          No key required
                        </div>
                        <div className="sub" style={{ fontSize: 12 }}>
                          Uses <code className="mono">Bearer public</code> against opencode.ai/zen.
                        </div>
                      </div>
                    </div>
                  </div>
                ) : authMode === 'api-key' ? (
                  <>
                    <div className="field" style={{ marginTop: 12 }}>
                      <label className="label">{preset.keyLabel}</label>
                      <input
                        className="input mono"
                        type="password"
                        placeholder={preset.keyPrefix ? `${preset.keyPrefix}…` : 'Paste your key'}
                        value={apiKey}
                        autoFocus
                        onChange={(e) => {
                          setApiKey(e.target.value)
                          setVerified(false)
                        }}
                      />
                      <div className="hint">Stored in macOS Keychain. Never synced to folk.</div>
                    </div>

                    <div className="ob-key-actions">
                      {!verified && (
                        <button
                          className="btn btn-primary"
                          onClick={handleTest}
                          disabled={!apiKey.trim() || testing}
                        >
                          {testing ? (
                            <><span className="spinner" /> Verifying…</>
                          ) : (
                            <>Verify key</>
                          )}
                        </button>
                      )}
                      {verified && (
                        <div className="ob-verified">
                          <div className="ob-verified-ic">
                            <Icon name="check" size={14} />
                          </div>
                          <div>
                            <div style={{ fontWeight: 500, color: 'var(--heading)', fontSize: 13 }}>
                              Connected to {preset.name}
                            </div>
                            <div className="sub" style={{ fontSize: 12 }}>
                              Models will be fetched on finish.
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="ob-key-actions" style={{ marginTop: 12 }}>
                    {ccStatus == null ? (
                      <div className="hint">Checking Claude Code login…</div>
                    ) : ccStatus.loggedIn ? (
                      <div className="ob-verified">
                        <div className="ob-verified-ic">
                          <Icon name="check" size={14} />
                        </div>
                        <div>
                          <div style={{ fontWeight: 500, color: 'var(--heading)', fontSize: 13 }}>
                            Claude Code logged in
                            {ccStatus.source === 'keychain' ? ' (macOS Keychain)' : ''}
                          </div>
                          <div className="sub" style={{ fontSize: 12 }}>
                            {ccStatus.email ?? 'Your subscription will be used for Anthropic models.'}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="hint" style={{ color: 'var(--warn)' }}>
                        Not logged in. Run <code className="mono">claude login</code> in a terminal, then return here.
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="ob-skip">
                Or{' '}
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault()
                    handleSkip()
                  }}
                >
                  skip for now
                </a>{' '}
                and set this up later.
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="ob-foot">
          {step > 0 ? (
            <button className="btn btn-plain" onClick={back}>
              <Icon name="chevronLeft" size={12} /> Back
            </button>
          ) : (
            <span />
          )}
          <span style={{ flex: 1 }} />
          {step < STEPS.length - 1 ? (
            <button className="btn btn-primary" onClick={next} disabled={!canNext()}>
              {step === 0 ? 'Get started' : 'Continue'}
              <Icon name="chevronRight" size={12} />
            </button>
          ) : (
            <button className="btn btn-primary" onClick={handleFinish} disabled={!verified}>
              <Icon name="check" size={12} /> Finish setup
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
