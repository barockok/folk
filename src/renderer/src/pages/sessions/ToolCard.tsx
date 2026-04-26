// src/renderer/src/pages/sessions/ToolCard.tsx
import { useState, type ReactElement } from 'react'
import { Icon } from '../../components/icons'

import type { PersistedToolCall } from '@shared/types'

export interface ToolCardProps {
  call: PersistedToolCall
  /** Required to push the chosen answer back through respondToolUse for
   *  client-side elicitation tools (AskUserQuestion). Other tools ignore. */
  sessionId?: string
}

interface AskUserQuestionInput {
  questions: Array<{
    question: string
    header?: string
    options: Array<{ label: string; description?: string }>
  }>
}

function extractAskUserQuestion(input: unknown): AskUserQuestionInput | null {
  if (!input || typeof input !== 'object') return null
  const qs = (input as { questions?: unknown }).questions
  if (!Array.isArray(qs) || qs.length === 0) return null
  const out: AskUserQuestionInput['questions'] = []
  for (const q of qs) {
    if (!q || typeof q !== 'object') return null
    const o = q as Record<string, unknown>
    const question = typeof o.question === 'string' ? o.question : null
    const header = typeof o.header === 'string' ? o.header : undefined
    const options = Array.isArray(o.options) ? o.options : null
    if (!question || !options) return null
    const optsOut: AskUserQuestionInput['questions'][number]['options'] = []
    for (const opt of options) {
      if (!opt || typeof opt !== 'object') return null
      const oo = opt as Record<string, unknown>
      const label = typeof oo.label === 'string' ? oo.label : null
      if (!label) return null
      optsOut.push({
        label,
        description: typeof oo.description === 'string' ? oo.description : undefined
      })
    }
    out.push({ question, header, options: optsOut })
  }
  return { questions: out }
}

const isOtherLabel = (label: string): boolean => label.trim().toLowerCase() === 'other'

function AskUserQuestionCard({
  call,
  sessionId
}: {
  call: PersistedToolCall
  sessionId?: string
}) {
  const parsed = extractAskUserQuestion(call.input)
  const [busy, setBusy] = useState(false)
  const [submitted, setSubmitted] = useState<boolean>(call.output !== undefined)
  const [answers, setAnswers] = useState<Array<string | null>>(() =>
    parsed ? parsed.questions.map(() => null) : []
  )
  // For each question, the free-text fallback when the user picked "Other".
  const [otherText, setOtherText] = useState<string[]>(() =>
    parsed ? parsed.questions.map(() => '') : []
  )
  if (!parsed) return null
  const answered = submitted || call.output !== undefined

  const effectiveAnswer = (qi: number): string | null => {
    const a = answers[qi]
    if (a === null) return null
    if (isOtherLabel(a)) {
      const t = otherText[qi]?.trim()
      return t ? t : null
    }
    return a
  }
  const allPicked = answers.every((a, i) => effectiveAnswer(i) !== null)

  const pick = (qi: number, label: string) => {
    if (answered || busy) return
    setAnswers((prev) => {
      const next = [...prev]
      next[qi] = label
      return next
    })
  }
  const setOther = (qi: number, value: string) => {
    if (answered || busy) return
    setOtherText((prev) => {
      const next = [...prev]
      next[qi] = value
      return next
    })
  }

  const submit = async () => {
    if (busy || answered || !sessionId || !allPicked) return
    setBusy(true)
    try {
      const payload =
        parsed.questions.length === 1
          ? effectiveAnswer(0)!
          : parsed.questions
              .map((q, i) => {
                const tag = q.header || q.question
                return `${i + 1}. ${tag}: ${effectiveAnswer(i)}`
              })
              .join('\n')
      await window.folk.agent.respondToolUse(sessionId, call.callId, payload)
      setSubmitted(true)
    } finally {
      setBusy(false)
    }
  }

  // Single-question card auto-submits on first click for the snappy UX.
  const autoSubmitOnPick = parsed.questions.length === 1
  const [activeTab, setActiveTab] = useState(0)

  const onPick = async (qi: number, label: string) => {
    pick(qi, label)
    // "Other" requires a free-text fallback — never auto-submit on Other,
    // wait for the user to type something then explicitly submit.
    if (autoSubmitOnPick && !isOtherLabel(label) && sessionId && !answered && !busy) {
      setBusy(true)
      try {
        await window.folk.agent.respondToolUse(sessionId, call.callId, label)
        setSubmitted(true)
      } finally {
        setBusy(false)
      }
      return
    }
    // Multi-question: after picking, advance to the next unanswered tab so
    // the user moves through them sequentially without hunting for the next
    // pending question.
    if (!autoSubmitOnPick && qi === activeTab) {
      const nextPending = answers
        .map((a, i) => (i !== qi && a === null ? i : -1))
        .find((i) => i !== -1)
      if (nextPending !== undefined && nextPending !== -1) {
        setActiveTab(nextPending)
      }
    }
  }

  if (autoSubmitOnPick) {
    const q = parsed.questions[0]
    const otherSelected = answers[0] !== null && isOtherLabel(answers[0])
    const canSubmitOther =
      otherSelected && !answered && !busy && (otherText[0]?.trim()?.length ?? 0) > 0
    return (
      <div className={`tool-card ask-card ${answered ? 'done' : 'running'}`}>
        <div className="ask-head">
          <Icon name="terminal" size={12} />
          <span className="ask-title">Question</span>
          {answered && <span className="ask-status">answered</span>}
        </div>
        <div className="ask-q">
          {q.header && <div className="ask-header">{q.header}</div>}
          <div className="ask-question">{q.question}</div>
          <div className="ask-options">
            {q.options.map((opt, oi) => {
              const selected = answers[0] === opt.label
              return (
                <button
                  key={oi}
                  type="button"
                  className={`ask-opt${selected ? ' on' : ''}`}
                  disabled={answered || busy}
                  onClick={() => onPick(0, opt.label)}
                >
                  <span className="ask-opt-label">{opt.label}</span>
                  {opt.description && (
                    <span className="ask-opt-desc">{opt.description}</span>
                  )}
                </button>
              )
            })}
          </div>
          {otherSelected && (
            <div className="ask-other">
              <input
                type="text"
                className="input ask-other-input"
                placeholder="Type your custom answer…"
                value={otherText[0] ?? ''}
                disabled={answered || busy}
                onChange={(e) => setOther(0, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && canSubmitOther) {
                    e.preventDefault()
                    void submit()
                  }
                }}
                autoFocus
              />
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={!canSubmitOther}
                onClick={submit}
              >
                {busy ? 'Submitting…' : 'Submit'}
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Multi-question: tabbed UI, one question per tab.
  const active = parsed.questions[activeTab]
  return (
    <div className={`tool-card ask-card ${answered ? 'done' : 'running'}`}>
      <div className="ask-head">
        <Icon name="terminal" size={12} />
        <span className="ask-title">{parsed.questions.length} questions</span>
        {answered && <span className="ask-status">answered</span>}
      </div>
      <div className="ask-tabs" role="tablist">
        {parsed.questions.map((q, qi) => {
          const picked = answers[qi]
          const label = q.header || `Q${qi + 1}`
          return (
            <button
              key={qi}
              type="button"
              role="tab"
              aria-selected={qi === activeTab}
              className={`ask-tab${qi === activeTab ? ' on' : ''}${picked ? ' picked' : ''}`}
              onClick={() => setActiveTab(qi)}
            >
              <span className="ask-tab-num">{qi + 1}</span>
              <span className="ask-tab-label">{label}</span>
              {picked && <span className="ask-tab-dot" aria-hidden="true" />}
            </button>
          )
        })}
      </div>
      <div className="ask-q" role="tabpanel">
        <div className="ask-question">{active.question}</div>
        <div className="ask-options">
          {active.options.map((opt, oi) => {
            const selected = answers[activeTab] === opt.label
            return (
              <button
                key={oi}
                type="button"
                className={`ask-opt${selected ? ' on' : ''}`}
                disabled={answered || busy}
                onClick={() => onPick(activeTab, opt.label)}
              >
                <span className="ask-opt-label">{opt.label}</span>
                {opt.description && (
                  <span className="ask-opt-desc">{opt.description}</span>
                )}
              </button>
            )
          })}
        </div>
        {answers[activeTab] !== null && isOtherLabel(answers[activeTab]!) && (
          <div className="ask-other">
            <input
              type="text"
              className="input ask-other-input"
              placeholder="Type your custom answer…"
              value={otherText[activeTab] ?? ''}
              disabled={answered || busy}
              onChange={(e) => setOther(activeTab, e.target.value)}
              autoFocus
            />
          </div>
        )}
      </div>
      {!answered && (
        <div className="ask-foot">
          <span className="ask-foot-status">
            {answers.filter((a) => a !== null).length}/{parsed.questions.length} answered
          </span>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!allPicked || busy}
            onClick={submit}
          >
            {busy ? 'Submitting…' : 'Submit'}
          </button>
        </div>
      )}
    </div>
  )
}

// Map class is keyed to existing CSS in components.css (.tool-card.running /
// .done / .failed). The component-side status name differs from the visual
// state name on purpose — keep the runtime status semantic, the class visual.
function statusClass(s: 'running' | 'success' | 'error'): string {
  if (s === 'running') return 'running'
  if (s === 'error') return 'failed'
  return 'done'
}

// Pretty-print a tool name. MCP tools arrive as
// `mcp__<namespace>_<server>__<tool>` (sometimes with `plugin_` prefix on the
// namespace, and the server name duplicated). Strip the noise and surface
// `<server> · <tool>` in title-friendly form.
export function humanizeToolName(name: string): { label: string; server?: string } {
  if (!name) return { label: name }
  const m = name.match(/^mcp__([^_]+(?:[-_][^_]+)*?)__(.+)$/)
  if (m) {
    let ns = m[1]
    const tool = m[2].replace(/_/g, ' ')
    ns = ns.replace(/^plugin[-_]/, '')
    // Many MCP IDs duplicate the server: `superpowers-chrome_chrome`. Collapse
    // the dup so we show just the leaf.
    const parts = ns.split(/[-_]/)
    const dedup: string[] = []
    for (const p of parts) {
      if (dedup[dedup.length - 1] !== p) dedup.push(p)
    }
    const server = dedup[dedup.length - 1] ?? ns
    return { label: `${server} · ${tool}`, server }
  }
  // Plain SDK tools — keep as-is, they're already short.
  return { label: name }
}

function summarizeInput(input: unknown): string | null {
  if (input == null) return null
  if (typeof input === 'string') return input
  if (typeof input !== 'object') return String(input)
  const obj = input as Record<string, unknown>
  // Common single-key cases — show the value directly so the head row reads
  // like a CLI invocation rather than a JSON dump.
  for (const key of ['command', 'file_path', 'path', 'pattern', 'url', 'query']) {
    const v = obj[key]
    if (typeof v === 'string') return v
  }
  return null
}

// Edit / Write tools — surface a colored diff instead of dumping JSON. We
// produce a unified diff: Edit shows old_string → new_string, Write shows the
// whole file as additions, NotebookEdit shows old_source → new_source.
function buildDiffLines(call: PersistedToolCall): { path: string; lines: string[] } | null {
  if (!call.input || typeof call.input !== 'object') return null
  const o = call.input as Record<string, unknown>
  const path =
    (typeof o.file_path === 'string' && o.file_path) ||
    (typeof o.path === 'string' && o.path) ||
    (typeof o.notebook_path === 'string' && o.notebook_path) ||
    ''
  let oldText = ''
  let newText = ''
  if (call.tool === 'Write') {
    newText = typeof o.content === 'string' ? o.content : ''
  } else if (call.tool === 'Edit') {
    oldText = typeof o.old_string === 'string' ? o.old_string : ''
    newText = typeof o.new_string === 'string' ? o.new_string : ''
  } else if (call.tool === 'NotebookEdit') {
    oldText = typeof o.old_source === 'string' ? o.old_source : ''
    newText = typeof o.new_source === 'string' ? o.new_source : ''
  }
  if (!path && !oldText && !newText) return null
  const lines: string[] = []
  for (const l of oldText.split('\n')) lines.push('-' + l)
  for (const l of newText.split('\n')) lines.push('+' + l)
  return { path, lines }
}

function renderDiffPanel(call: PersistedToolCall): ReactElement | null {
  const built = buildDiffLines(call)
  if (!built) return null
  const status: 'running' | 'success' | 'error' =
    call.output === undefined ? 'running' : call.isError ? 'error' : 'success'
  return (
    <DiffCard
      call={call}
      status={status}
      path={built.path}
      lines={built.lines}
    />
  )
}

function DiffCard({
  call,
  status,
  path,
  lines
}: {
  call: PersistedToolCall
  status: 'running' | 'success' | 'error'
  path: string
  lines: string[]
}) {
  const [open, setOpen] = useState(true)
  return (
    <div className={`tool-card diff-card ${statusClass(status)}`} data-open={open ? 'true' : 'false'}>
      <button type="button" className="tool-hd" onClick={() => setOpen((v) => !v)}>
        <span className="tool-ic">
          <Icon name="terminal" size={12} />
        </span>
        <span className="tool-name" title={call.tool}>{humanizeToolName(call.tool).label}</span>
        {path && <span className="tool-srv" title={path}>{path}</span>}
        <span className="tool-status">
          {status === 'running' && <span className="spinner" />}
          {status}
        </span>
        <span className="tool-caret">
          <Icon name="chevronRight" size={12} />
        </span>
      </button>
      {open && (
        <div className="tool-body">
          <pre className="diff-pre">
            {lines.map((l, i) => (
              <div
                key={i}
                className={l.startsWith('+') ? 'diff-add' : l.startsWith('-') ? 'diff-del' : ''}
              >
                {l}
              </div>
            ))}
          </pre>
          {call.output !== undefined && call.isError && (
            <div className="tool-section">
              <div className="tool-label">error</div>
              <pre>{typeof call.output === 'string' ? call.output : JSON.stringify(call.output, null, 2)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface TodoItem {
  content: string
  status: 'pending' | 'in_progress' | 'completed'
  activeForm?: string
}

function extractTodos(input: unknown): TodoItem[] | null {
  if (!input || typeof input !== 'object') return null
  const todos = (input as { todos?: unknown }).todos
  if (!Array.isArray(todos)) return null
  const out: TodoItem[] = []
  for (const t of todos) {
    if (!t || typeof t !== 'object') return null
    const o = t as Record<string, unknown>
    const content = typeof o.content === 'string' ? o.content : null
    const status = o.status
    if (!content || (status !== 'pending' && status !== 'in_progress' && status !== 'completed'))
      return null
    out.push({
      content,
      status,
      activeForm: typeof o.activeForm === 'string' ? o.activeForm : undefined
    })
  }
  return out
}

export function ToolCard({ call, sessionId }: ToolCardProps) {
  const [open, setOpen] = useState(false)
  const status: 'running' | 'success' | 'error' =
    call.output === undefined ? 'running' : call.isError ? 'error' : 'success'
  const summary = summarizeInput(call.input)

  if (call.tool === 'AskUserQuestion') {
    const card = <AskUserQuestionCard call={call} sessionId={sessionId} />
    if (extractAskUserQuestion(call.input)) return card
  }

  if (call.tool === 'Edit' || call.tool === 'Write' || call.tool === 'NotebookEdit') {
    const diffNode = renderDiffPanel(call)
    if (diffNode) return diffNode
  }

  if (call.tool === 'TodoWrite') {
    const todos = extractTodos(call.input)
    if (todos) {
      const done = todos.filter((t) => t.status === 'completed').length
      return (
        <div className={`tool-card todo-card ${statusClass(status)}`}>
          <div className="todo-head">
            <Icon name="terminal" size={12} />
            <span className="todo-title">Todos</span>
            <span className="todo-count">{done}/{todos.length}</span>
          </div>
          <ul className="todo-list">
            {todos.map((t, i) => {
              const label =
                t.status === 'in_progress' && t.activeForm ? t.activeForm : t.content
              return (
                <li key={i} className={`todo-item todo-${t.status}`}>
                  <span className={`todo-box todo-box-${t.status}`} aria-hidden="true">
                    {t.status === 'completed' ? '✓' : t.status === 'in_progress' ? '◐' : ''}
                  </span>
                  <span className="todo-label">{label}</span>
                </li>
              )
            })}
          </ul>
        </div>
      )
    }
  }
  return (
    <div className={`tool-card ${statusClass(status)}`} data-open={open ? 'true' : 'false'}>
      <button type="button" className="tool-hd" onClick={() => setOpen((v) => !v)}>
        <span className="tool-ic">
          <Icon name="terminal" size={12} />
        </span>
        <span className="tool-name" title={call.tool}>{humanizeToolName(call.tool).label}</span>
        {summary && <span className="tool-srv" title={summary}>{summary}</span>}
        <span className="tool-status">
          {status === 'running' && <span className="spinner" />}
          {status === 'success' && <span className="dot" style={{ background: 'var(--ok)', borderRadius: '50%', display: 'inline-block' }} />}
          {status === 'error' && <span className="dot" style={{ background: 'var(--err, #ea2261)', borderRadius: '50%', display: 'inline-block' }} />}
          {status === 'running' && call.elapsedSeconds != null
            ? `${call.elapsedSeconds.toFixed(1)}s`
            : status}
        </span>
        <span className="tool-caret">
          <Icon name="chevronRight" size={12} />
        </span>
      </button>
      {open && (
        <div className="tool-body">
          <div className="tool-section">
            <div className="tool-label">input</div>
            <pre>{JSON.stringify(call.input, null, 2)}</pre>
          </div>
          {call.output !== undefined && (
            <div className="tool-section">
              <div className="tool-label">{call.isError ? 'error' : 'output'}</div>
              <pre>{typeof call.output === 'string' ? call.output : JSON.stringify(call.output, null, 2)}</pre>
            </div>
          )}
          {call.children && call.children.length > 0 && (
            <div className="tool-section">
              <div className="tool-label">subagent ({call.children.length})</div>
              <div className="tool-children">
                {call.children.map((c) => (
                  <ToolCard key={c.callId} call={c} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
