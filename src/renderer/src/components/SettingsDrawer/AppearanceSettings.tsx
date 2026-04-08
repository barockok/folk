import { useSettingsStore } from '../../stores/settings'

const fontSizes: { label: string; value: 'small' | 'medium' | 'large' }[] = [
  { label: 'Small', value: 'small' },
  { label: 'Medium', value: 'medium' },
  { label: 'Large', value: 'large' }
]

export default function AppearanceSettings(): React.JSX.Element {
  const fontSize = useSettingsStore((s) => s.fontSize)
  const setFontSize = useSettingsStore((s) => s.setFontSize)
  const compactMode = useSettingsStore((s) => s.compactMode)
  const setCompactMode = useSettingsStore((s) => s.setCompactMode)

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-medium text-text-primary mb-3">Font Size</h3>
        <div className="flex gap-2">
          {fontSizes.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => setFontSize(value)}
              className={`px-4 py-2 text-sm rounded-default border transition-colors cursor-pointer ${
                fontSize === value
                  ? 'border-electric-cyan bg-cyan-glow-12 text-text-primary'
                  : 'border-border-mist-10 text-text-secondary hover:border-border-mist-12'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-text-primary">Compact Mode</h3>
          <button
            onClick={() => setCompactMode(!compactMode)}
            className={`w-10 h-5 rounded-full transition-colors cursor-pointer relative ${
              compactMode ? 'bg-electric-cyan' : 'bg-border-mist-10'
            }`}
          >
            <div
              className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                compactMode ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
        <p className="text-xs text-text-muted mt-1">Reduce spacing between messages</p>
      </div>
    </div>
  )
}
