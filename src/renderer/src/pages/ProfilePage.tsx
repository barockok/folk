import { useState, useEffect } from 'react'
import type { Profile } from '@shared/types'
import { useProfileStore } from '../stores/useProfileStore'
import { useUIStore } from '../stores/useUIStore'

const AVATAR_COLORS = [
  '#533AFD', // stripe-purple
  '#E0245E', // ruby
  '#C026D3', // magenta
  '#0EA5E9', // sky
  '#10B981', // emerald
  '#F59E0B', // amber
  '#EF4444', // red
  '#6366F1', // indigo
  '#8B5CF6', // violet
  '#EC4899', // pink
]

function initials(nickname: string): string {
  const parts = nickname.trim().split(/\s+/)
  if (parts.length === 0 || !parts[0]) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

const EMPTY_DRAFT: Profile = {
  nickname: '',
  pronouns: '',
  role: '',
  tone: '',
  avatarColor: AVATAR_COLORS[0],
  about: '',
}

export function ProfilePage() {
  const profile = useProfileStore((s) => s.profile)
  const save = useProfileStore((s) => s.save)
  const toast = useUIStore((s) => s.toast)

  const [draft, setDraft] = useState<Profile>(EMPTY_DRAFT)
  const [saving, setSaving] = useState(false)

  // Sync store → draft when profile loads
  useEffect(() => {
    if (profile) setDraft(profile)
  }, [profile])

  const set = (field: keyof Profile, value: string) =>
    setDraft((d) => ({ ...d, [field]: value }))

  const handleSave = async () => {
    setSaving(true)
    try {
      await save(draft)
      toast({ kind: 'ok', text: 'Profile saved' })
    } catch {
      toast({ kind: 'err', text: 'Failed to save profile' })
    } finally {
      setSaving(false)
    }
  }

  if (profile === null) {
    return (
      <div className="page">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: 200,
            color: 'var(--fg-faint)',
            fontSize: 14,
          }}
        >
          Loading profile…
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <div className="eyebrow" style={{ marginBottom: 8 }}>You</div>
          <h1 className="h1">Profile</h1>
          <div className="sub">
            How folk refers to you and what it knows about you. Stored locally — no cloud account
            required.
          </div>
        </div>
      </div>

      {/* Avatar preview + color picker */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 20,
          padding: '20px 24px',
          background: 'var(--bg-card)',
          border: 'var(--hair) solid var(--border)',
          borderRadius: 'var(--r)',
          marginBottom: 24,
        }}
      >
        {/* Avatar chip */}
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 'var(--r)',
            background: draft.avatarColor,
            color: '#fff',
            display: 'grid',
            placeItems: 'center',
            fontSize: 20,
            fontWeight: 600,
            letterSpacing: '-0.02em',
            flex: 'none',
          }}
          aria-label="Avatar preview"
        >
          {initials(draft.nickname || 'Folk')}
        </div>

        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--body)',
              marginBottom: 10,
            }}
          >
            Avatar color
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {AVATAR_COLORS.map((color) => (
              <div
                key={color}
                role="button"
                tabIndex={0}
                aria-label={`Avatar color ${color}`}
                aria-pressed={draft.avatarColor === color}
                onClick={() => set('avatarColor', color)}
                onKeyDown={(e: React.KeyboardEvent) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    set('avatarColor', color)
                  }
                }}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: color,
                  cursor: 'pointer',
                  boxShadow:
                    draft.avatarColor === color
                      ? `0 0 0 2px var(--bg), 0 0 0 4px ${color}`
                      : 'none',
                  transition: 'box-shadow .12s',
                  outline: 'none',
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Form fields */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 16,
          marginBottom: 16,
        }}
      >
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--body)',
            }}
          >
            Nickname
          </span>
          <input
            className="input"
            placeholder="How folk calls you"
            value={draft.nickname}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('nickname', e.target.value)}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--body)',
            }}
          >
            Pronouns
          </span>
          <input
            className="input"
            placeholder="e.g. they/them"
            value={draft.pronouns}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('pronouns', e.target.value)}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--body)',
            }}
          >
            Role
          </span>
          <input
            className="input"
            placeholder="e.g. Engineer, PM, Designer"
            value={draft.role}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('role', e.target.value)}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--body)',
            }}
          >
            Preferred tone
          </span>
          <input
            className="input"
            placeholder="e.g. concise, casual, formal"
            value={draft.tone}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('tone', e.target.value)}
          />
        </label>
      </div>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 24 }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--body)',
          }}
        >
          About you
        </span>
        <textarea
          className="input"
          placeholder="Anything folk should know — your stack, working style, preferred conventions…"
          rows={4}
          value={draft.about}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => set('about', e.target.value)}
          style={{ resize: 'vertical', fontFamily: 'var(--ff-sans)' }}
        />
      </label>

      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save profile'}
        </button>
        <button
          className="btn btn-plain"
          onClick={() => setDraft(profile ?? EMPTY_DRAFT)}
          disabled={saving}
        >
          Discard
        </button>
      </div>
    </div>
  )
}
