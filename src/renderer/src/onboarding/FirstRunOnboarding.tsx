// FirstRunOnboarding.tsx — 4-step first-run walkthrough (Task 34)
import { useState } from 'react'
import type { Profile, ProviderConfig, ModelConfig } from '@shared/types'
import { useProfileStore } from '../stores/useProfileStore'
import { useProvidersStore } from '../stores/useProvidersStore'
import { useUIStore } from '../stores/useUIStore'
import { Icon } from '../components/icons'

// ---------------------------------------------------------------------------
// Provider presets — verbatim from ModelPage.tsx (Task 30)
// ---------------------------------------------------------------------------

interface ProviderPreset {
  id: string
  name: string
  logoClass: string
  logoText: string
  baseUrl: string | null
  keyLabel: string
  keyPrefix?: string
  models: Array<{ id: string; label: string }>
}

const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    logoClass: 'lg-anthropic',
    logoText: 'AN',
    baseUrl: null,
    keyLabel: 'Anthropic API key',
    keyPrefix: 'sk-ant-',
    models: [
      { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
      { id: 'claude-opus-4', label: 'Claude Opus 4' },
      { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' }
    ]
  },
  {
    id: 'openai',
    name: 'OpenAI',
    logoClass: 'lg-openai',
    logoText: 'OA',
    baseUrl: 'https://api.openai.com/v1',
    keyLabel: 'OpenAI API key',
    keyPrefix: 'sk-',
    models: [
      { id: 'gpt-4o', label: 'GPT-4o' },
      { id: 'gpt-4o-mini', label: 'GPT-4o mini' },
      { id: 'o3-mini', label: 'o3-mini' }
    ]
  },
  {
    id: 'google',
    name: 'Google',
    logoClass: 'lg-google',
    logoText: 'GG',
    baseUrl: 'https://generativelanguage.googleapis.com',
    keyLabel: 'Google AI Studio key',
    models: [
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' }
    ]
  },
  {
    id: 'glm',
    name: 'GLM (Zhipu)',
    logoClass: 'lg-zhipu',
    logoText: 'GL',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    keyLabel: 'Zhipu API key',
    models: [
      { id: 'glm-4.6', label: 'GLM-4.6' },
      { id: 'glm-4-air', label: 'GLM-4-Air' }
    ]
  },
  {
    id: 'moonshot',
    name: 'Moonshot',
    logoClass: 'lg-moonshot',
    logoText: 'KM',
    baseUrl: 'https://api.moonshot.cn/v1',
    keyLabel: 'Moonshot API key',
    models: [
      { id: 'kimi-k2', label: 'Kimi K2' },
      { id: 'moonshot-v1-128k', label: 'Moonshot v1 128K' }
    ]
  },
  {
    id: 'qwen',
    name: 'Qwen',
    logoClass: 'lg-qwen',
    logoText: 'QW',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    keyLabel: 'DashScope key',
    models: [
      { id: 'qwen-max', label: 'Qwen Max' },
      { id: 'qwen-coder-plus', label: 'Qwen Coder Plus' }
    ]
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

  // Step 3 — API key
  const [apiKey, setApiKey] = useState('')
  const [verified, setVerified] = useState(false)
  const [testing, setTesting] = useState(false)

  const preset = PROVIDER_PRESETS.find((p) => p.id === providerId)!

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
      const models: ModelConfig[] = preset.models.map((m) => ({
        id: m.id,
        label: m.label,
        enabled: true
      }))
      const provider: ProviderConfig = {
        id: crypto.randomUUID(),
        name: preset.name,
        apiKey,
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
                    <span
                      className={`prov-logo-lg ${p.logoClass}`}
                      style={{ width: 40, height: 40, fontSize: 14 }}
                    >
                      {p.logoText}
                    </span>
                    <span className="ob-prov-name">{p.name}</span>
                    <span className="ob-prov-sub">{p.models.length} models</span>
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

          {/* Step 3 — API Key */}
          {step === 3 && (
            <div className="ob-step-body">
              <h2 className="ob-step-title">Sign in to {preset.name}.</h2>
              <p className="ob-step-sub">
                Paste your {preset.keyLabel.toLowerCase()} — we'll verify it and store it in macOS Keychain.
              </p>

              <div className="ob-key-panel">
                <div className="ob-key-hd">
                  <span
                    className={`prov-logo-lg ${preset.logoClass}`}
                    style={{ width: 32, height: 32, fontSize: 12 }}
                  >
                    {preset.logoText}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--heading)' }}>
                      {preset.name}
                    </div>
                    <div className="sub" style={{ fontSize: 12 }}>
                      {preset.baseUrl ?? 'api.anthropic.com'}
                    </div>
                  </div>
                </div>

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
                          {preset.models.length} models ready to use.
                        </div>
                      </div>
                    </div>
                  )}
                </div>
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
