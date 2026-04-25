import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useSessionStore } from '../../stores/useSessionStore'
import type { PersistedToolCall, Session } from '@shared/types'
import { ToolCard, humanizeToolName } from './ToolCard'

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

// Collapsible group of consecutive same-tool calls. Header shows count +
// running/error badges; expand to see each ToolCard individually.
function ToolGroup({ calls }: { calls: PersistedToolCall[] }) {
  const [open, setOpen] = useState(false)
  // Distinct humanized labels for the header — first 3 then "+N more" so a
  // mixed run reads "chrome · use browser, Read, Bash +2 more".
  const labels: string[] = []
  for (const c of calls) {
    const l = humanizeToolName(c.tool).label
    if (!labels.includes(l)) labels.push(l)
  }
  const previewLabels = labels.slice(0, 3).join(', ')
  const moreCount = labels.length - 3
  const running = calls.filter((c) => c.output === undefined).length
  const errors = calls.filter((c) => c.isError).length
  const status = running > 0 ? 'running' : errors > 0 ? 'failed' : 'done'
  return (
    <div className={`tool-card tool-group ${status}`} data-open={open ? 'true' : 'false'}>
      <button type="button" className="tool-hd" onClick={() => setOpen((v) => !v)}>
        <span className="tool-ic">▦</span>
        <span className="tool-name">
          {calls.length} tool calls
        </span>
        <span className="tool-srv" title={labels.join(', ')}>
          {previewLabels}
          {moreCount > 0 ? ` +${moreCount} more` : ''}
        </span>
        <span className="tool-status">
          {running > 0 && <span className="spinner" />}
          {errors > 0 ? `${errors} err` : running > 0 ? `${running} running` : 'done'}
        </span>
        <span className="tool-caret">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="tool-body" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {calls.map((c) => (
            <ToolCard key={c.callId} call={c} />
          ))}
        </div>
      )}
    </div>
  )
}

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
    if (m.role === 'system') {
      return { m, isLast, visibleBlocks: m.blocks, showProgress: false, renderable: true }
    }
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
          if (m.role === 'system') {
            const label = m.blocks.find((b) => b.kind === 'text')?.text ?? 'Context compacted'
            return (
              <div key={m.id} className="msg-divider" role="separator" aria-label={label}>
                <span className="msg-divider-line" />
                <span className="msg-divider-label">{label}</span>
                <span className="msg-divider-line" />
              </div>
            )
          }
          const prev = i > 0 ? visible[i - 1].m : null
          const next = i < visible.length - 1 ? visible[i + 1].m : null
          const continuation = prev != null && prev.role === m.role && prev.role !== 'system'
          const continuesBelow = next != null && next.role === m.role && next.role !== 'system'
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
                {(() => {
                  // Coalesce consecutive same-tool tool blocks into a group
                  // entry so a chain of identical calls renders as one chip.
                  type Entry =
                    | { type: 'block'; b: typeof visibleBlocks[number]; idx: number }
                    | { type: 'group'; calls: PersistedToolCall[]; idx: number }
                  const entries: Entry[] = []
                  for (let j = 0; j < visibleBlocks.length; j++) {
                    const b = visibleBlocks[j]
                    if (b.kind === 'tool') {
                      // Greedily absorb every subsequent tool block — different
                      // tools allowed. Run breaks only when a text or thinking
                      // block intervenes.
                      const calls: PersistedToolCall[] = [b.call]
                      const startIdx = j
                      while (
                        j + 1 < visibleBlocks.length &&
                        visibleBlocks[j + 1].kind === 'tool'
                      ) {
                        j++
                        calls.push(
                          (visibleBlocks[j] as { kind: 'tool'; call: PersistedToolCall }).call
                        )
                      }
                      if (calls.length >= 2) {
                        entries.push({ type: 'group', calls, idx: startIdx })
                      } else {
                        entries.push({
                          type: 'block',
                          b: { kind: 'tool', call: calls[0] } as typeof visibleBlocks[number],
                          idx: startIdx
                        })
                      }
                    } else {
                      entries.push({ type: 'block', b, idx: j })
                    }
                  }
                  let lastThinkingIdx = -1
                  for (let k = visibleBlocks.length - 1; k >= 0; k--) {
                    if (visibleBlocks[k].kind === 'thinking') {
                      lastThinkingIdx = k
                      break
                    }
                  }
                  return entries.map((e) => {
                    if (e.type === 'group') {
                      return (
                        <div key={`${m.id}-grp-${e.idx}`} className="msg-tools">
                          <ToolGroup calls={e.calls} />
                        </div>
                      )
                    }
                    const b = e.b
                    const key = `${m.id}-${e.idx}`
                    if (b.kind === 'thinking') {
                      const isLive =
                        p.isLast &&
                        isStreaming &&
                        e.idx === lastThinkingIdx &&
                        lastThinkingIdx === visibleBlocks.length - 1
                      return (
                        <details
                          key={key}
                          className={`msg-thinking${isLive ? ' live' : ''}`}
                          open={isLive}
                        >
                          <summary>
                            {isLive ? (
                              <span className="dots">
                                <span /><span /><span />
                              </span>
                            ) : (
                              <span className="msg-thinking-bullet" aria-hidden="true">·</span>
                            )}
                            <span className="msg-thinking-label">
                              {isLive ? 'Thinking' : 'Thought'}
                            </span>
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
                    return (
                      <div key={key} className="msg-body md">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
                          {b.text}
                        </ReactMarkdown>
                      </div>
                    )
                  })
                })()}
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
