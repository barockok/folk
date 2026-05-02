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
  --stripe-purple-bg: ${isDark ? 'rgba(102,94,253,0.12)' : 'rgba(83,58,253,0.05)'};
  --r: 6px; --r-sm: 5px; --r-xs: 4px;
  --ff-sans: "Inter", -apple-system, BlinkMacSystemFont, sans-serif;
  --ff-mono: "Source Code Pro", SFMono-Regular, Menlo, monospace;
}
html, body {
  margin: 0; padding: 0;
  background: var(--bg); color: var(--fg);
  font-family: var(--ff-sans);
  font-size: 14px; line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}`.trim()

  // Catches unhandled errors and renders them inline so the frame is never
  // silently blank — the user sees what went wrong without opening devtools.
  // Also reports errors back to the parent so the renderer can trigger an
  // auto-fix turn when the artifact lives in the latest assistant message.
  const errorHandler = `var __folkId="${id}";function __folkReport(msg,line){try{parent.postMessage({folkVisualError:{message:String(msg||''),line:Number(line)||0},folkVisualId:__folkId},'*');}catch(_){}}
window.addEventListener('error',function(e){
var d=document.createElement('div');
d.style.cssText='padding:10px 14px;margin:8px;background:rgba(234,34,97,0.08);color:#ea2261;font:12px/1.5 monospace;border-radius:5px;border:1px solid rgba(234,34,97,0.25);white-space:pre-wrap;word-break:break-all';
d.textContent='Error: '+e.message+'\\n(line '+e.lineno+')';
document.body?document.body.insertBefore(d,document.body.firstChild):document.addEventListener('DOMContentLoaded',function(){document.body.insertBefore(d,document.body.firstChild)});
__folkReport(e.message,e.lineno);
});
window.addEventListener('unhandledrejection',function(e){__folkReport((e.reason&&(e.reason.message||e.reason))||'unhandled rejection',0);});`

  const reporter = `(function(){var i="${id}";function r(){parent.postMessage({folkVisualHeight:document.documentElement.scrollHeight,folkVisualId:i},'*');}if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',r);}else{r();}if(window.ResizeObserver){new ResizeObserver(r).observe(document.documentElement);}}());`

  const inject = `<style>*{box-sizing:border-box}${tokenCss}</style><script>${errorHandler}${reporter}<\/script>`

  if (lang === 'svg') {
    return `<!DOCTYPE html><html><head>${inject}</head><body style="display:flex;align-items:center;justify-content:center;">${code}</body></html>`
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
// Height we collapse to when the user presses the collapse button on a tall
// artifact. Default render is uncapped so the artifact grows to its natural
// height and the outer chat scroll handles paging — nested iframe scroll is
// confusing in a chat context.
const COLLAPSED_H = 560

interface Props {
  code: string
  lang: 'html' | 'svg'
  onError?: (info: { message: string; line: number }) => void
}

export function InlineVisual({ code, lang, onError }: Props) {
  const theme = useUIStore((s) => s.theme)
  const isDark = theme === 'dark'
  const id = useRef(Math.random().toString(36).slice(2)).current
  const [height, setHeight] = useState(DEFAULT_H)
  const [showSource, setShowSource] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  const srcdoc = buildSrcdoc(code, lang, isDark, id)

  const reportedErrorRef = useRef<string | null>(null)

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.folkVisualId !== id) return
      if (typeof e.data.folkVisualHeight === 'number') {
        setHeight(Math.max(e.data.folkVisualHeight, MIN_H))
      }
      const err = e.data.folkVisualError
      if (err && typeof err.message === 'string' && err.message) {
        if (reportedErrorRef.current === err.message) return
        reportedErrorRef.current = err.message
        onError?.({ message: err.message, line: typeof err.line === 'number' ? err.line : 0 })
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [id, onError])

  useEffect(() => {
    reportedErrorRef.current = null
  }, [code])

  const renderH = collapsed ? Math.min(height, COLLAPSED_H) : height
  const canCollapse = height > COLLAPSED_H

  return (
    <div className="inline-visual">
      <div className="iv-frame-wrap" style={{ height: renderH }}>
        <iframe
          key={isDark ? 'dark' : 'light'}
          srcDoc={srcdoc}
          sandbox="allow-scripts"
          className="iv-frame"
          title={`${lang} visual`}
        />
        <div className="iv-actions">
          <button type="button" className="iv-btn" onClick={() => setShowSource((v) => !v)}>
            {showSource ? 'Hide' : 'Source'}
          </button>
          <button type="button" className="iv-btn" onClick={() => void navigator.clipboard.writeText(code)}>
            Copy
          </button>
          {canCollapse && (
            <button
              type="button"
              className="iv-btn"
              onClick={() => setCollapsed((v) => !v)}
              aria-label={collapsed ? 'Expand' : 'Collapse'}
            >
              {collapsed ? '↗' : '↙'}
            </button>
          )}
        </div>
      </div>
      {showSource && (
        <pre className="iv-source"><code>{code}</code></pre>
      )}
    </div>
  )
}
