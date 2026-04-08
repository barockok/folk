import MarkdownRenderer from '../ChatPanel/MarkdownRenderer'

interface MarkdownViewerProps {
  content: string
}

export default function MarkdownViewer({ content }: MarkdownViewerProps): React.JSX.Element {
  return (
    <div className="flex-1 overflow-auto p-6 text-text-secondary">
      <MarkdownRenderer content={content} />
    </div>
  )
}
