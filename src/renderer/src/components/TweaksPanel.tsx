// TweaksPanel.tsx — minimal tweaks surface (Task 34)
// Per CLAUDE.md: dark mode, density, replay onboarding only.
import { useUIStore } from '../stores/useUIStore'
import { useSessionStore } from '../stores/useSessionStore'
import { Icon } from './icons'

export function TweaksPanel() {
  const theme = useUIStore((s) => s.theme)
  const density = useUIStore((s) => s.density)
  const setTheme = useUIStore((s) => s.setTheme)
  const setDensity = useUIStore((s) => s.setDensity)
  const setForceOnboarding = useUIStore((s) => s.setForceOnboarding)
  const toast = useUIStore((s) => s.toast)
  const activeSessionId = useSessionStore((s) => s.activeId)

  const replayOnboarding = () => {
    localStorage.removeItem('folk.onboarded')
    location.reload()
  }

  const simulateBlankOnboarding = () => {
    setForceOnboarding(true)
  }

  const copySessionId = async () => {
    if (!activeSessionId) return
    try {
      await navigator.clipboard.writeText(activeSessionId)
      toast({ kind: 'ok', text: 'Session id copied' })
    } catch {
      toast({ kind: 'err', text: 'Copy failed' })
    }
  }

  return (
    <div className="tweaks-panel">
      {/* Dark mode */}
      <div className="tweaks-row">
        <div className="tweaks-row-label">
          <Icon name="settings" size={13} />
          <span>Dark mode</span>
        </div>
        <button
          role="switch"
          aria-checked={theme === 'dark'}
          className="tweaks-toggle"
          data-on={theme === 'dark' ? '1' : '0'}
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        >
          <i />
        </button>
      </div>

      {/* Density */}
      <div className="tweaks-row">
        <div className="tweaks-row-label">
          <Icon name="layers" size={13} />
          <span>Density</span>
        </div>
        <div className="segmented" style={{ fontSize: 12 }}>
          <button
            className={density === 'compact' ? 'on' : ''}
            onClick={() => setDensity('compact')}
          >
            Compact
          </button>
          <button
            className={density === 'regular' ? 'on' : ''}
            onClick={() => setDensity('regular')}
          >
            Regular
          </button>
        </div>
      </div>

      {/* Dev — Session id */}
      <div className="tweaks-row tweaks-row--sep" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
        <div className="tweaks-row-label" style={{ justifyContent: 'space-between' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icon name="terminal" size={13} />
            <span>Session id</span>
          </span>
          <span
            style={{
              fontSize: 9,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--fg-faint)'
            }}
          >
            dev
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'var(--bg-sub)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-sm)',
            padding: '6px 8px'
          }}
        >
          <code
            style={{
              flex: 1,
              fontFamily: 'var(--ff-mono)',
              fontSize: 11,
              color: activeSessionId ? 'var(--body)' : 'var(--fg-faint)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
            title={activeSessionId ?? ''}
          >
            {activeSessionId ?? 'no active session'}
          </code>
          <button
            type="button"
            className="btn btn-plain"
            disabled={!activeSessionId}
            onClick={copySessionId}
            style={{ padding: '2px 6px' }}
            title="Copy session id"
          >
            <Icon name="copy" size={12} />
          </button>
        </div>
      </div>

      {/* Dev — Simulate blank onboarding */}
      <div className="tweaks-row">
        <button
          className="btn btn-plain"
          style={{ fontSize: 12, width: '100%', justifyContent: 'flex-start', gap: 6 }}
          onClick={simulateBlankOnboarding}
        >
          <Icon name="wand" size={13} />
          Simulate blank onboarding
          <span
            style={{
              marginLeft: 'auto',
              fontSize: 9,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--fg-faint)'
            }}
          >
            dev
          </span>
        </button>
      </div>

      {/* Replay onboarding */}
      <div className="tweaks-row">
        <button
          className="btn btn-plain"
          style={{ fontSize: 12, width: '100%', justifyContent: 'flex-start', gap: 6 }}
          onClick={replayOnboarding}
        >
          <Icon name="refresh" size={13} />
          Replay first-run onboarding
        </button>
      </div>
    </div>
  )
}
