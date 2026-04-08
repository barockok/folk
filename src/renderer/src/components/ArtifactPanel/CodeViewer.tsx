import { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { useHighlighter } from '../../hooks/useHighlighter'

interface CodeViewerProps {
  code: string
  language: string | null
}

export default function CodeViewer({ code, language }: CodeViewerProps): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  const highlighter = useHighlighter()

  const handleCopy = (): void => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const highlighted = highlighter && language
    ? highlighter.codeToHtml(code, { lang: language, theme: 'github-dark' })
    : null

  const lines = code.split('\n')

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border-mist-06">
        <span className="text-xs font-mono text-text-muted">{language || 'plaintext'}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      {/* Code with line numbers */}
      {highlighted ? (
        <div className="flex-1 overflow-auto p-4 text-sm [&_pre]:!bg-transparent [&_pre]:!m-0 [&_code]:!text-sm"
             dangerouslySetInnerHTML={{ __html: highlighted }} />
      ) : (
        <div className="flex-1 overflow-auto p-4">
          <pre>
            {lines.map((line, index) => (
              <div key={index} className="flex">
                <span className="w-10 text-right pr-4 text-text-muted select-none text-sm font-mono shrink-0">
                  {index + 1}
                </span>
                <code className="text-sm font-mono text-text-secondary">{line}</code>
              </div>
            ))}
          </pre>
        </div>
      )}
    </div>
  )
}
