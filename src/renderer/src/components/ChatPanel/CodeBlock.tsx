import { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { useHighlighter } from '../../hooks/useHighlighter'

interface CodeBlockProps {
  language: string
  children: string
}

export default function CodeBlock({ language, children }: CodeBlockProps): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  const highlighter = useHighlighter()

  const handleCopy = (): void => {
    navigator.clipboard.writeText(children)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const highlighted = highlighter && language
    ? highlighter.codeToHtml(children, { lang: language, theme: 'github-dark' })
    : null

  return (
    <div className="border border-border-mist-10 rounded-default bg-pure-black my-3 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border-mist-10">
        <span className="text-xs font-mono text-text-muted">{language || 'code'}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      {highlighted ? (
        <div className="p-3 overflow-x-auto text-sm [&_pre]:!bg-transparent [&_pre]:!m-0 [&_code]:!text-sm"
             dangerouslySetInnerHTML={{ __html: highlighted }} />
      ) : (
        <pre className="overflow-x-auto p-3">
          <code className="text-sm font-mono text-text-secondary">{children}</code>
        </pre>
      )}
    </div>
  )
}
