import { useEffect, useLayoutEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useSessionStore } from '../../stores/useSessionStore'
import type { Session } from '@shared/types'
import { ToolCard } from './ToolCard'

// Local-image rewrite: absolute paths and file:// URLs aren't loadable by the
// renderer directly (security + protocol). We register a custom folk-file://
// scheme in main and rewrite <img src> here. Web URLs and data: URIs pass
// through untouched.
function rewriteImgSrc(src?: string): string | undefined {
  if (!src) return src
  if (/^(https?:|data:|blob:|folk-file:)/.test(src)) return src
  let absolute = src
  if (src.startsWith('file://')) absolute = decodeURIComponent(src.slice('file://'.length))
  // Relative paths (including ~/...) can't be resolved here without a base —
  // pass through and let the browser fail visibly so the user can adjust.
  if (!absolute.startsWith('/')) return src
  return 'folk-file://localhost' + absolute.split('/').map(encodeURIComponent).join('/')
}

const MD_COMPONENTS: Components = {
  img: ({ src, alt, ...props }) => {
    const safe = rewriteImgSrc(typeof src === 'string' ? src : undefined)
    return <img src={safe} alt={alt} {...props} />
  }
}

const EMPTY_MESSAGES: never[] = []

// Total streamed-content size — used to retrigger autoscroll as text grows.
function contentLength(messages: ReadonlyArray<{ blocks: ReadonlyArray<{ kind: string; text?: string }> }>): number {
  let n = 0
  for (const m of messages) {
    for (const b of m.blocks) {
      if (b.kind === 'tool') n += 1
      else if (b.text) n += b.text.length
    }
  }
  return n
}

export function Conversation({ session }: { session: Session | null }) {
  const messages = useSessionStore((s) => (session ? s.messages[session.id] ?? EMPTY_MESSAGES : EMPTY_MESSAGES))
  const isStreaming = useSessionStore((s) => (session ? s.streamingSessions.has(session.id) : false))
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickyRef = useRef(true)

  // Track whether the user is parked near the bottom. If they scrolled up to
  // re-read something, don't yank the view back down on each delta.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => {
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
      stickyRef.current = nearBottom
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  // Autoscroll on new messages and as deltas accumulate. useLayoutEffect so we
  // jump before paint — keeps the bottom pinned during fast streaming.
  const lengthSignal = contentLength(messages)
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el || !stickyRef.current) return
    el.scrollTop = el.scrollHeight
  }, [messages.length, lengthSignal])

  if (!session) {
    return <div className="session-empty">Pick a session or start a new one.</div>
  }

  // Pre-compute which messages will actually render, so timeline grouping
  // (continuation / continuesBelow) is based on rendered neighbours — not on
  // hidden thinking-only messages that would leave orphan dots on the rail.
  const lastIdx = messages.length - 1
  const prepared = messages.map((m, i) => {
    const isLast = i === lastIdx
    const hasText = m.blocks.some((b) => b.kind === 'text')
    const isStreamingThought = isLast && m.role === 'assistant' && !hasText
    const visibleBlocks = isStreamingThought
      ? m.blocks
      : m.blocks.filter((b) => b.kind !== 'thinking')
    // The trailing assistant message of an in-flight turn shows a "still
    // working" indicator BETWEEN deltas. Suppress it when something else is
    // already conveying progress: a live thinking block is visible (its dots
    // pulse), or a tool is mid-run (its card shows a spinner).
    const hasLiveThinking = isStreamingThought && m.blocks.some((b) => b.kind === 'thinking')
    const hasRunningTool = m.blocks.some((b) => b.kind === 'tool' && b.call.output === undefined)
    const showProgress =
      isLast &&
      m.role === 'assistant' &&
      !m.error &&
      isStreaming &&
      !hasLiveThinking &&
      !hasRunningTool
    const renderable = visibleBlocks.length > 0 || showProgress || !!m.error
    return { m, isLast, visibleBlocks, showProgress, renderable }
  })
  const visible = prepared.filter((p) => p.renderable)

  return (
    <div className="conv" ref={scrollRef}>
      <div className="conv-inner">
        {visible.map((p, i) => {
          const { m, visibleBlocks, showProgress } = p
          const prev = i > 0 ? visible[i - 1].m : null
          const next = i < visible.length - 1 ? visible[i + 1].m : null
          const continuation = prev != null && prev.role === m.role
          const continuesBelow = next != null && next.role === m.role
          return (
            <article
              key={m.id}
              className={`msg msg-${m.role}${continuation ? ' continuation' : ''}`}
              data-continues-below={continuesBelow ? 'true' : 'false'}
            >
              {continuation ? (
                <div className="msg-rail" aria-hidden="true">
                  <span className="msg-rail-dot" />
                </div>
              ) : (
                <div className={`msg-avatar ${m.role === 'user' ? 'user' : 'assist'}`}>
                  {m.role === 'user' ? 'Y' : 'F'}
                </div>
              )}
              <div className="msg-content">
                {!continuation && (
                  <div className="msg-name">
                    {m.role === 'user' ? 'You' : 'folk'}
                    <span className="when">{new Date(m.createdAt).toLocaleTimeString()}</span>
                  </div>
                )}
                {visibleBlocks.map((b, j) => {
                  const key = `${m.id}-${j}`
                  if (b.kind === 'thinking') {
                    // Live = the streaming message hasn't produced text yet,
                    // so dots still pulse; once text arrives, this thinking
                    // would have been filtered out anyway, so live is implicit.
                    return (
                      <details key={key} className="msg-thinking live" open>
                        <summary>
                          <span className="dots">
                            <span /><span /><span />
                          </span>
                          <span className="msg-thinking-label">Thinking</span>
                          <span className="chev">▸</span>
                        </summary>
                        <div className="msg-thinking-body">{b.text}</div>
                      </details>
                    )
                  }
                  if (b.kind === 'tool') {
                    return (
                      <div key={key} className="msg-tools">
                        <ToolCard call={b.call} />
                      </div>
                    )
                  }
                  // text
                  return (
                    <div key={key} className="msg-body md">
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
                        {b.text}
                      </ReactMarkdown>
                    </div>
                  )
                })}
                {showProgress && (
                  <div className="msg-thinking live no-body">
                    <span className="dots"><span /><span /><span /></span>
                    <span className="msg-thinking-label">
                      {visibleBlocks.length === 0 ? 'Thinking…' : 'Working…'}
                    </span>
                  </div>
                )}
                {m.error && <div className="msg-error">{m.error.message}</div>}
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}
