import type { Artifact } from '../../../../shared/types'

interface ArtifactTabsProps {
  artifacts: Artifact[]
  activeIndex: number
  onSelect: (index: number) => void
}

export default function ArtifactTabs({
  artifacts,
  activeIndex,
  onSelect
}: ArtifactTabsProps): React.JSX.Element {
  return (
    <div className="flex gap-1 px-4 border-b border-border-mist-06 overflow-x-auto">
      {artifacts.map((artifact, index) => (
        <button
          key={artifact.id}
          onClick={() => onSelect(index)}
          className={`px-3 py-2 text-xs whitespace-nowrap transition-colors cursor-pointer ${
            index === activeIndex
              ? 'border-b-2 border-electric-cyan text-text-primary'
              : 'border-b-2 border-transparent text-text-tertiary hover:text-text-secondary'
          }`}
        >
          {artifact.title}
        </button>
      ))}
    </div>
  )
}
