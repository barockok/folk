import { useState, useEffect } from 'react'
import { ExternalLink } from 'lucide-react'

export default function AboutSection(): React.JSX.Element {
  const [version, setVersion] = useState('')

  useEffect(() => {
    window.folk.getAppVersion().then(setVersion)
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-medium text-text-primary mb-1">Version</h3>
        <p className="text-sm text-text-secondary font-mono">{version || '...'}</p>
      </div>

      <div>
        <p className="text-sm text-text-muted">
          Powered by llama.cpp + Gemma 4 E4B
        </p>
      </div>

      <div className="space-y-3">
        <a
          href="https://github.com/nicepkg/folk"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
        >
          <ExternalLink size={14} />
          GitHub Repository
        </a>
        <a
          href="https://github.com/nicepkg/folk/issues/new"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
        >
          <ExternalLink size={14} />
          Report an Issue
        </a>
      </div>
    </div>
  )
}
