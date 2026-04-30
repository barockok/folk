import { useEffect, useRef, useState } from 'react'
import { useUIStore } from '../../stores/useUIStore'

function buildSrcdoc(code: string, lang: 'html' | 'svg', isDark: boolean, id: string): string {
  const tokenCss = `
:root {
  color-scheme: ${isDark ? 'dark' : 'light'};
  --bg: ${isDark ? '#0a0f1e' : '#ffffff'};
  --bg-card: ${isDark ? '#111937' : '#ffffff'};
  --bg-sub: ${isDark ? '#0d1428' : '#f6f9fc'};
  --fg: ${isDark ? '#e8ecf5' : '#061b31'};
  --body: ${isDark ? '#8b96b0' : '#64748d'};
  --border: ${isDark ? '#1e2a4a' : '#e5edf5'};
  --stripe-purple: #533afd;
}
body {
  margin: 0; padding: 16px;
  font-family: -apple-system, BlinkMacSystemFont, "Inter", sans-serif;
  font-size: 14px; line-height: 1.5;
  background: var(--bg); color: var(--fg);
}`.trim()

  // Inlined height reporter — posts scrollHeight to parent keyed by id so
  // sibling visuals on the same page don't clobber each other's heights.
  const reporter = `<script>(function(){var i="${id}";function r(){parent.postMessage({folkVisualHeight:document.documentElement.scrollHeight,folkVisualId:i},'*');}if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',r);}else{r();}if(window.ResizeObserver){new ResizeObserver(r).observe(document.documentElement);}}());</script>`

  const inject = `<style>*{box-sizing:border-box}${tokenCss}</style>${reporter}`

  if (lang === 'svg') {
    return `<!DOCTYPE html><html><head>${inject}</head><body style="display:flex;align-items:center;justify-content:center;min-height:100vh;">${code}</body></html>`
  }

  if (/<html[\s>]/i.test(code)) {
    if (code.includes('</head>')) return code.replace('</head>', `${inject}</head>`)
    if (/<body[\s>]/i.test(code)) return code.replace(/<body/i, `${inject}<body`)
    return inject + code
  }

  return `<!DOCTYPE html><html><head>${inject}</head><body>${code}</body></html>`
}

const MIN_H = 100
const DEFAULT_H = 300
const MAX_H = 560

interface Props { code: string; lang: 'html' | 'svg' }

export function InlineVisual({ code, lang }: Props) {
  const theme = useUIStore((s) => s.theme)
  const isDark = theme === 'dark'
  const id = useRef(Math.random().toString(36).slice(2)).current
  const [height, setHeight] = useState(DEFAULT_H)
  const [showSource, setShowSource] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const srcdoc = buildSrcdoc(code, lang, isDark, id)

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (
        e.data?.folkVisualId === id &&
        typeof e.data.folkVisualHeight === 'number'
      ) {
        setHeight(Math.min(Math.max(e.data.folkVisualHeight, MIN_H), MAX_H))
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [id])

  return (
    <div className="inline-visual">
      <div className="iv-bar">
        <span className="iv-tag">{lang === 'svg' ? 'SVG' : 'Visual'}</span>
        <div className="iv-actions">
          <button
            type="button"
            className="btn btn-xs btn-plain"
            onClick={() => setShowSource((v) => !v)}
          >
            {showSource ? 'Hide source' : 'Source'}
          </button>
          <button
            type="button"
            className="btn btn-xs btn-plain"
            onClick={() => void navigator.clipboard.writeText(code)}
          >
            Copy
          </button>
          <button
            type="button"
            className="btn btn-xs btn-plain"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? '↙' : '↗'}
          </button>
        </div>
      </div>
      <div className="iv-frame-wrap" style={{ height: expanded ? MAX_H : height }}>
        {/* key forces full remount on theme change so the injected token CSS updates */}
        <iframe
          key={isDark ? 'dark' : 'light'}
          srcDoc={srcdoc}
          sandbox="allow-scripts"
          className="iv-frame"
          title={`${lang} visual`}
        />
      </div>
      {showSource && (
        <pre className="iv-source"><code>{code}</code></pre>
      )}
    </div>
  )
}
