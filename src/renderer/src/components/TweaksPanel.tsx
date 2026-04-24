// TweaksPanel.tsx — minimal tweaks surface (Task 34)
// Per CLAUDE.md: dark mode, density, replay onboarding only.
import { useUIStore } from '../stores/useUIStore'
import { Icon } from './icons'

export function TweaksPanel() {
  const theme = useUIStore((s) => s.theme)
  const density = useUIStore((s) => s.density)
  const setTheme = useUIStore((s) => s.setTheme)
  const setDensity = useUIStore((s) => s.setDensity)

  const replayOnboarding = () => {
    localStorage.removeItem('folk.onboarded')
    location.reload()
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

      {/* Replay onboarding */}
      <div className="tweaks-row tweaks-row--sep">
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
