import { useState } from 'react'
import { X, Download, ExternalLink } from 'lucide-react'
import { useAgentStore } from '../../stores/agent'
import { useUIStore } from '../../stores/ui'
import ArtifactTabs from './ArtifactTabs'
import CodeViewer from './CodeViewer'
import MarkdownViewer from './MarkdownViewer'
import ImageViewer from './ImageViewer'

export default function ArtifactPanel(): React.JSX.Element | null {
  const { artifacts } = useAgentStore()
  const { showArtifactPanel, toggleArtifactPanel } = useUIStore()
  const [activeIndex, setActiveIndex] = useState(0)

  if (!showArtifactPanel) return null

  const activeArtifact = artifacts[activeIndex]

  const renderContent = (): React.JSX.Element => {
    if (!activeArtifact) {
      return (
        <div className="flex-1 flex items-center justify-center px-8">
          <p className="text-text-tertiary text-sm text-center">
            Artifacts will appear here when Folk creates or modifies files
          </p>
        </div>
      )
    }

    switch (activeArtifact.type) {
      case 'code':
      case 'file':
        return (
          <CodeViewer
            code={activeArtifact.content || ''}
            language={activeArtifact.language}
          />
        )
      case 'markdown':
        return <MarkdownViewer content={activeArtifact.content || ''} />
      case 'image':
        return (
          <ImageViewer
            src={activeArtifact.content || ''}
            alt={activeArtifact.title}
          />
        )
      default:
        return (
          <CodeViewer
            code={activeArtifact.content || ''}
            language={activeArtifact.language}
          />
        )
    }
  }

  return (
    <div
      className="flex-shrink-0 bg-pure-black border-l border-border-mist-08 flex flex-col"
      style={{ width: 400 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-mist-06">
        <h2 className="text-sm font-medium text-text-primary">Artifacts</h2>
        <button
          onClick={toggleArtifactPanel}
          className="text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
        >
          <X size={16} />
        </button>
      </div>

      {/* Tabs */}
      {artifacts.length > 0 && (
        <ArtifactTabs
          artifacts={artifacts}
          activeIndex={activeIndex}
          onSelect={setActiveIndex}
        />
      )}

      {/* Content */}
      <div className="flex-1 flex flex-col min-h-0">{renderContent()}</div>

      {/* Action bar */}
      {activeArtifact && (
        <div className="flex items-center gap-2 px-4 py-3 border-t border-border-mist-06">
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors cursor-pointer">
            <Download size={14} />
            Save
          </button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors cursor-pointer">
            <ExternalLink size={14} />
            Open
          </button>
        </div>
      )}
    </div>
  )
}
