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
}
/* Default-inline replaced elements (canvas, img, svg, iframe, video) sit on
   the text baseline, leaving a descender gap below them. When a chart lib
   like Chart.js measures parent and resizes its canvas based on it, that
   gap accumulates each frame — body scrollHeight grows → iframe grows →
   chart resizes → repeat. Forcing block layout removes the gap.
   Canvas also gets max-width so responsive charts can't push past parent. */
canvas, img, svg, video, iframe { display: block; max-width: 100%; }
/* Iframe is sized to fit content — outer chat handles paging. Hide any
   nested scrollbars so charts/SVGs don't show stray rails. */
html { scrollbar-width: none; -ms-overflow-style: none; }
html::-webkit-scrollbar, body::-webkit-scrollbar { width: 0; height: 0; display: none; }`.trim()

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

  // Height reporter with a runaway-loop guard. Several chart libs
  // (Chart.js with maintainAspectRatio:false, vh-based SVGs) size their
  // container to the iframe viewport — every height we send back grows
  // the iframe, which grows the chart, which fires ResizeObserver again.
  // Defenses: (1) ignore deltas smaller than 4px, (2) throttle to ~80ms,
  // (3) detect monotonic growth (8+ consecutive grows totalling >300px)
  // and freeze the height at the last sane value.
  // Height reporter: observe during a bounded init window (~1.6s after
  // load) then disconnect. Chart.js / D3 / responsive layouts can settle
  // into a feedback loop where iframe height feeds back into chart sizing
  // — leaving ResizeObserver on indefinitely is unsafe. Sample several
  // times during init to catch slow chart builds, freeze afterward.
  // Hard cap per send too (the parent enforces MAX_H regardless).
  const reporter = `(function(){var i="${id}";var last=0;var frozen=false;var ro=null;function send(){if(frozen)return;var h=document.documentElement.scrollHeight;if(h===last)return;last=h;parent.postMessage({folkVisualHeight:h,folkVisualId:i},'*');}function freeze(){if(frozen)return;frozen=true;if(ro){try{ro.disconnect();}catch(_){}}send();parent.postMessage({folkVisualHeight:last,folkVisualId:i,frozen:true},'*');}function tick(){if(!frozen)send();}var pending=null;function debounced(){if(pending)return;pending=setTimeout(function(){pending=null;tick();},60);}function start(){tick();[100,300,700,1200,1600].forEach(function(ms){setTimeout(tick,ms);});setTimeout(freeze,1700);if(window.ResizeObserver){ro=new ResizeObserver(debounced);ro.observe(document.documentElement);ro.observe(document.body||document.documentElement);}}if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',start);}else{start();}window.addEventListener('load',tick);}());`

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
// Last-resort cap. Iframes that report > this are misbehaving (responsive
// chart feedback loop, vh-based layouts). Beyond ~4k the chat scroll is
// useless anyway — collapse button still works.
const MAX_H = 4000
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
        const clamped = Math.min(Math.max(e.data.folkVisualHeight, MIN_H), MAX_H)
        setHeight((prev) => (Math.abs(prev - clamped) < 4 ? prev : clamped))
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
