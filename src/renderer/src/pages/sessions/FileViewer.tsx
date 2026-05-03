import { useEffect, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useUIStore } from '../../stores/useUIStore'
import { Icon } from '../../components/icons'
import { fileIconFor } from '../../lib/fileIcon'

type ReadResult = Awaited<ReturnType<typeof window.folk.files.read>>
type Mode = 'preview' | 'source'

function basename(p: string): string {
  const idx = p.lastIndexOf('/')
  return idx >= 0 ? p.slice(idx + 1) : p
}

function dirname(p: string): string {
  const idx = p.lastIndexOf('/')
  return idx > 0 ? p.slice(0, idx) : ''
}

function extOf(p: string): string {
  const idx = p.lastIndexOf('.')
  return idx >= 0 ? p.slice(idx).toLowerCase() : ''
}

function isHtml(p: string): boolean {
  return /\.(html?|htm)$/i.test(p)
}
function isMarkdown(p: string): boolean {
  return /\.(md|markdown|mdx)$/i.test(p)
}
function hasPreview(p: string): boolean {
  return isHtml(p) || isMarkdown(p)
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function folkFileUrl(absPath: string): string {
  return `folk-file://localhost/${encodeURI(absPath)}`
}

export function FileViewer({ path }: { path: string }) {
  const close = useUIStore((s) => s.closeFileViewer)
  const [result, setResult] = useState<ReadResult | null>(null)
  const [loading, setLoading] = useState(true)
  // Renderable formats default to a rendered preview; everything else only
  // has the source mode. Toggle persists per file (resets on path change).
  const [mode, setMode] = useState<Mode>(hasPreview(path) ? 'preview' : 'source')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setResult(null)
    setMode(hasPreview(path) ? 'preview' : 'source')
    void window.folk.files.read(path).then((r) => {
      if (!cancelled) {
        setResult(r)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [path])

  const dir = dirname(path)
  const name = basename(path)
  const previewable = hasPreview(path)

  const copyPath = async () => {
    try {
      await navigator.clipboard.writeText(path)
    } catch {
      /* noop */
    }
  }

  const revealInFinder = () => {
    void window.folk.shell.openExternal(`file://${dir || path}`)
  }

  return (
    <aside className="file-viewer" role="region" aria-label={`Viewer · ${name}`}>
      <header className="fv-head">
        <span className="fv-icon" style={{ color: fileIconFor(path).color }}>
          <Icon name={fileIconFor(path).name} size={16} />
        </span>
        <div className="fv-title trunc" title={path}>
          <span className="fv-name">{name}</span>
          {dir && <span className="fv-dir trunc">{dir}</span>}
        </div>
        <div className="fv-actions">
          {previewable && (
            <div className="fv-mode" role="tablist" aria-label="View mode">
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'preview'}
                className={`fv-mode-btn${mode === 'preview' ? ' on' : ''}`}
                onClick={() => setMode('preview')}
              >
                Preview
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'source'}
                className={`fv-mode-btn${mode === 'source' ? ' on' : ''}`}
                onClick={() => setMode('source')}
              >
                Source
              </button>
            </div>
          )}
          <button
            type="button"
            className="btn btn-plain btn-icon"
            onClick={copyPath}
            title="Copy path"
            aria-label="Copy path"
          >
            <Icon name="copy" size={13} />
          </button>
          <button
            type="button"
            className="btn btn-plain btn-icon"
            onClick={revealInFinder}
            title="Reveal in Finder"
            aria-label="Reveal in Finder"
          >
            <Icon name="folder" size={13} />
          </button>
          <button
            type="button"
            className="btn btn-plain btn-icon"
            onClick={close}
            title="Close viewer"
            aria-label="Close viewer"
          >
            <Icon name="x" size={13} />
          </button>
        </div>
      </header>
      <div className="fv-body">
        {loading && <div className="fv-state">Loading…</div>}
        {!loading && result && !result.ok && (
          <div className="fv-state fv-state-err">Could not read file: {result.error}</div>
        )}
        {!loading && result && result.ok && (
          <FileBody result={result} mode={mode} />
        )}
      </div>
      {!loading && result && result.ok && (
        <footer className="fv-foot">
          <span className="fv-meta">{result.kind}</span>
          <span className="fv-meta">{formatBytes(result.size)}</span>
          {previewable && <span className="fv-meta">{mode}</span>}
        </footer>
      )}
    </aside>
  )
}

function FileBody({ result, mode }: { result: Extract<ReadResult, { ok: true }>; mode: Mode }) {
  const url = folkFileUrl(result.path)
  const ext = extOf(result.path)
  const isHtmlFile = ext === '.html' || ext === '.htm'
  const isMd = ext === '.md' || ext === '.markdown' || ext === '.mdx'

  // HTML preview — render the file in a sandboxed iframe via folk-file://.
  if (isHtmlFile && mode === 'preview') {
    return <iframe src={url} title={basename(result.path)} className="fv-iframe" sandbox="allow-scripts allow-same-origin" />
  }
  // Markdown preview — render via react-markdown, GFM enabled.
  if (isMd && mode === 'preview') {
    return (
      <div className="fv-markdown">
        <Markdown content={result.content ?? ''} />
      </div>
    )
  }

  if (result.kind === 'image') {
    return <img src={url} alt={basename(result.path)} className="fv-image" />
  }
  if (result.kind === 'video') {
    return <video src={url} controls className="fv-image" />
  }
  if (result.kind === 'audio') {
    return <audio src={url} controls className="fv-audio" />
  }
  if (result.kind === 'pdf') {
    return <iframe src={url} title={basename(result.path)} className="fv-iframe" />
  }
  if (result.kind === 'too-large') {
    return (
      <div className="fv-state">
        File is too large to preview in-app ({formatBytes(result.size)}). Use Reveal in Finder.
      </div>
    )
  }
  if (result.kind === 'binary') {
    return <div className="fv-state">Binary file — no in-app preview.</div>
  }
  return <pre className="fv-text"><code>{result.content ?? ''}</code></pre>
}

function Markdown({ content }: { content: string }) {
  // Memoize so typing in the chat (rerenders) doesn't re-parse the same body.
  const node = useMemo(
    () => (
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {content}
      </ReactMarkdown>
    ),
    [content]
  )
  return node
}
