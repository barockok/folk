import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useSessionStore } from '../../stores/useSessionStore'
import type { PermissionRequest, PersistedToolCall, Session } from '@shared/types'
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
const EMPTY_PERMS: PermissionRequest[] = []

function collectCallIds(call: PersistedToolCall, into: Set<string>): void {
  into.add(call.callId)
  if (call.children) {
    for (const c of call.children) collectCallIds(c, into)
  }
}

// The SDK replays compaction by writing a single synthetic user message into
// the on-disk transcript that contains the prior-session summary. After a
// restart this lands as a giant user bubble — useful info, but not what the
// user wants to scroll past every time. Detect it heuristically and render
// as a collapsible stub.
const COMPACT_SUMMARY_PREFIX = 'This session is being continued from a previous conversation'
function isCompactSummary(text: string | undefined): boolean {
  if (!text) return false
  return text.trimStart().startsWith(COMPACT_SUMMARY_PREFIX)
}

// Internal SDK echoes that show up in the on-disk transcript after a
// /compact run — visible junk for users. Match defensively (whitespace,
// stray attributes) so future SDK rev variations still hide.
const HIDDEN_PATTERNS = [
  /<command-name>\s*\/?compact\s*<\/command-name>/i,
  /<local-command-stdout>\s*compacted\s*<\/local-command-stdout>/i,
  /<command-message>\s*compact\s*<\/command-message>/i
]
function isInternalEcho(text: string | undefined): boolean {
  if (!text) return false
  const t = text.trim()
  if (!t) return false
  // Treat as internal echo only if EVERY non-empty line is one of the
  // recognised tags (or empty) — protects against false positives on real
  // user messages that happen to mention /compact.
  const lines = t.split('\n').map((l) => l.trim()).filter(Boolean)
  return lines.every((l) => HIDDEN_PATTERNS.some((p) => p.test(l)))
}

function CompactSummaryCard({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`compact-summary${open ? ' open' : ''}`}>
      <button
        type="button"
        className="compact-summary-head"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="compact-summary-label">
          Continued from previous session — summary
        </span>
        <span className="compact-summary-chev" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open && (
        <div className="compact-summary-body">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
            {text}
          </ReactMarkdown>
        </div>
      )}
    </div>
  )
}

function PermissionPrompt({ req }: { req: PermissionRequest }) {
  const remove = useSessionStore((s) => s.removePermissionRequest)
  const [busy, setBusy] = useState(false)
  const respond = async (
    behavior: 'allow' | 'deny',
    allowAlways = false
  ) => {
    if (busy) return
    setBusy(true)
    try {
      await window.folk.agent.respondPermission(
        behavior === 'allow'
          ? { requestId: req.requestId, behavior: 'allow', allowAlways }
          : { requestId: req.requestId, behavior: 'deny' }
      )
      remove(req.sessionId, req.requestId)
    } catch {
      setBusy(false)
    }
  }
  const tool = humanizeToolName(req.toolName).label
  const summary = req.title || `Allow ${tool}?`
  return (
    <div className="perm-card" role="alertdialog" aria-label={summary}>
      <div className="perm-card-hd">
        <span className="perm-card-ic">⚠</span>
        <span className="perm-card-title">{summary}</span>
      </div>
      {req.description && <div className="perm-card-desc">{req.description}</div>}
      {req.blockedPath && (
        <div className="perm-card-meta">
          <span className="perm-card-meta-k">path</span>
          <code className="perm-card-meta-v">{req.blockedPath}</code>
        </div>
      )}
      {req.decisionReason && (
        <div className="perm-card-meta">
          <span className="perm-card-meta-k">reason</span>
          <span className="perm-card-meta-v">{req.decisionReason}</span>
        </div>
      )}
      <div className="perm-card-actions">
        <button
          type="button"
          className="btn btn-plain"
          onClick={() => respond('deny')}
          disabled={busy}
        >
          Deny
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => respond('allow', true)}
          disabled={busy}
          title="Allow this tool for the rest of the session"
        >
          Allow always
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => respond('allow', false)}
          disabled={busy}
        >
          Allow once
        </button>
      </div>
    </div>
  )
}

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
  // When the agent emits a compact_boundary, hide everything above it behind
  // a single "context compacted — show" stub so the live transcript matches
  // the post-restart view (where the SDK only replays post-boundary content).
  // User can click to peek at the pre-compact history without losing it.
  const [compactExpanded, setCompactExpanded] = useState(false)
  useEffect(() => {
    setCompactExpanded(false)
  }, [session?.id])
  const lifecycleTicker = useSessionStore((s) =>
    session ? s.lifecycleTicker[session.id] ?? null : null
  )
  const pendingPerms = useSessionStore((s) =>
    session ? s.pendingPermissions[session.id] ?? EMPTY_PERMS : EMPTY_PERMS
  )
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
  // Compute "effective last" by skipping lifecycle notices, which never
  // render but would otherwise steal isLast from the trailing assistant
  // placeholder — making its progress chip vanish the moment the SDK emits
  // its first system/init or status: requesting event.
  let lastIdx = messages.length - 1
  while (lastIdx >= 0) {
    const t = messages[lastIdx]
    if (t.role === 'system' && t.notice === 'lifecycle') {
      lastIdx--
      continue
    }
    break
  }
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
    // working" indicator BETWEEN deltas. Suppress it ONLY when something is
    // *currently* animating progress: the live thinking block (last block,
    // pulsing dots) or a tool that's still running. Older thinking blocks no
    // longer pulse, so they no longer count as live — otherwise the user
    // sees a frozen "Thought" with no indication anything is happening.
    const lastBlock = m.blocks[m.blocks.length - 1]
    const hasLiveThinking =
      isStreamingThought && lastBlock?.kind === 'thinking'
    const hasRunningTool = m.blocks.some((b) => b.kind === 'tool' && b.call.output === undefined)
    const showProgress =
      isLast &&
      m.role === 'assistant' &&
      !m.error &&
      isStreaming &&
      !hasLiveThinking &&
      !hasRunningTool
    // Hide messages that contain only post-compact internal echo tags
    // (<command-name>/compact</command-name>, <local-command-stdout>Compacted
    // </local-command-stdout>) — they're SDK transcript bookkeeping, not
    // anything the user typed.
    const onlyEcho =
      visibleBlocks.length > 0 &&
      visibleBlocks.every((b) => b.kind === 'text' && isInternalEcho(b.text))
    const renderable = !onlyEcho && (visibleBlocks.length > 0 || showProgress || !!m.error)
    return { m, isLast, visibleBlocks, showProgress, renderable }
  })
  const visible = prepared.filter((p) => p.renderable)

  // Lifecycle notices (hook started/done, session ready, status: requesting,
  // etc.) are surfaced ephemerally via the thinking-card ticker — they never
  // render as standalone cards / dividers. Non-lifecycle system messages
  // (compact_boundary, api_retry, rate_limit, info — /cost, /status, summary)
  // still render as standalone dividers below.
  const lifecycleFiltered = visible.filter(
    (p) => !(p.m.role === 'system' && p.m.notice === 'lifecycle')
  )
  // Find the LAST compact_boundary divider — everything before it gets folded
  // into a single stub the user can expand on demand.
  let compactIdx = -1
  for (let k = lifecycleFiltered.length - 1; k >= 0; k--) {
    const m = lifecycleFiltered[k].m
    if (m.role === 'system' && m.notice === 'compact_boundary') {
      compactIdx = k
      break
    }
  }
  const hiddenBefore = compactIdx > 0 && !compactExpanded ? compactIdx : 0
  const items =
    hiddenBefore > 0 ? lifecycleFiltered.slice(hiddenBefore) : lifecycleFiltered

  return (
    <div className="conv" ref={scrollRef}>
      <div className="conv-inner">
        {hiddenBefore > 0 && (
          <button
            type="button"
            className="compact-stub"
            onClick={() => setCompactExpanded(true)}
          >
            Context compacted · {hiddenBefore} earlier message
            {hiddenBefore === 1 ? '' : 's'} hidden — show
          </button>
        )}
        {compactExpanded && compactIdx > 0 && (
          <button
            type="button"
            className="compact-stub compact-stub-collapse"
            onClick={() => setCompactExpanded(false)}
          >
            Hide pre-compact history
          </button>
        )}
        {items.map((p, i) => {
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
          // Replayed compact-summary user message — collapse by default.
          if (m.role === 'user') {
            const firstText = m.blocks.find((b) => b.kind === 'text')?.text
            if (isCompactSummary(firstText)) {
              return <CompactSummaryCard key={m.id} text={firstText!} />
            }
          }
          const prev = i > 0 ? items[i - 1].m : null
          const next = i < items.length - 1 ? items[i + 1].m : null
          const continuation = prev != null && prev.role !== 'system' && prev.role === m.role
          const continuesBelow = next != null && next.role !== 'system' && next.role === m.role
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
                            {isLive && lifecycleTicker && (
                              <span className="msg-thinking-ticker" title={lifecycleTicker}>
                                {lifecycleTicker}
                              </span>
                            )}
                            <span className="chev">▸</span>
                          </summary>
                          <div className="msg-thinking-body">{b.text}</div>
                        </details>
                      )
                    }
                    if (b.kind === 'tool') {
                      const matchingPerms = pendingPerms.filter(
                        (pr) => pr.toolUseID === b.call.callId
                      )
                      return (
                        <div key={key} className="msg-tools">
                          <ToolCard call={b.call} />
                          {matchingPerms.map((pr) => (
                            <PermissionPrompt key={pr.requestId} req={pr} />
                          ))}
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
                {p.isLast &&
                  m.role === 'assistant' &&
                  (() => {
                    // Permission requests whose toolUseID didn't match any
                    // rendered tool block — surface them at the message foot
                    // so the user can still respond.
                    const renderedIds = new Set<string>()
                    for (const b of m.blocks) {
                      if (b.kind === 'tool') collectCallIds(b.call, renderedIds)
                    }
                    const orphans = pendingPerms.filter(
                      (pr) => !renderedIds.has(pr.toolUseID)
                    )
                    return orphans.map((pr) => (
                      <PermissionPrompt key={pr.requestId} req={pr} />
                    ))
                  })()}
                {showProgress && (
                  <div className="msg-thinking live no-body">
                    <span className="dots"><span /><span /><span /></span>
                    <span className="msg-thinking-label">
                      {visibleBlocks.length === 0 ? 'Thinking…' : 'Working…'}
                    </span>
                    {lifecycleTicker && (
                      <span className="msg-thinking-ticker" title={lifecycleTicker}>
                        {lifecycleTicker}
                      </span>
                    )}
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
