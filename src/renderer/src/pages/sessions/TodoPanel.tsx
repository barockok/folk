import { useSessionStore } from '../../stores/useSessionStore'
import type { Session, PersistedToolCall, MessageBlock } from '@shared/types'
import { extractTodos, humanizeToolName, type TodoItem } from './ToolCard'
import { Icon } from '../../components/icons'

const EMPTY: never[] = []

interface ToolCallSummary {
  tool: string
  detail: string | null
}

interface CallStats {
  todos: TodoItem[] | null
  totalToolCalls: number
  recentCalls: ToolCallSummary[] // newest-first
  files: string[] // ordered, latest-first, deduped
}

function summarizeInput(tool: string, input: unknown): string | null {
  if (!input || typeof input !== 'object') return null
  const o = input as Record<string, unknown>
  if (tool === 'Skill') {
    const name = typeof o.skill === 'string' ? o.skill : null
    return name
  }
  if (tool === 'Bash') {
    const cmd = typeof o.command === 'string' ? o.command : null
    if (!cmd) return null
    const flat = cmd.replace(/\s+/g, ' ').trim()
    return flat.length > 60 ? flat.slice(0, 57) + '…' : flat
  }
  if (tool === 'Read' || tool === 'Write' || tool === 'Edit' || tool === 'MultiEdit' || tool === 'NotebookEdit') {
    const p = (typeof o.file_path === 'string' && o.file_path) || (typeof o.notebook_path === 'string' && o.notebook_path)
    if (typeof p === 'string') {
      const idx = p.lastIndexOf('/')
      return idx >= 0 ? p.slice(idx + 1) : p
    }
  }
  if (tool === 'Glob') {
    return typeof o.pattern === 'string' ? o.pattern : null
  }
  if (tool === 'Grep') {
    return typeof o.pattern === 'string' ? o.pattern : null
  }
  if (tool === 'WebFetch' || tool === 'WebSearch') {
    return typeof o.url === 'string' ? o.url : (typeof o.query === 'string' ? o.query : null)
  }
  if (tool === 'Task' || tool === 'Agent') {
    return typeof o.description === 'string' ? o.description : (typeof o.subagent_type === 'string' ? o.subagent_type : null)
  }
  // Fallback: pick the first short string value.
  for (const v of Object.values(o)) {
    if (typeof v === 'string' && v && v.length < 80) return v
  }
  return null
}

function collect(messages: ReadonlyArray<{ blocks: ReadonlyArray<MessageBlock> }>): CallStats {
  const stats: CallStats = { todos: null, totalToolCalls: 0, recentCalls: [], files: [] }
  const fileSet = new Set<string>()
  for (let i = messages.length - 1; i >= 0; i--) {
    const blocks = messages[i].blocks
    for (let j = blocks.length - 1; j >= 0; j--) {
      const b = blocks[j]
      if (b.kind !== 'tool') continue
      walkCall(b.call, stats, fileSet)
    }
  }
  return stats
}

// Pull paths a shell command writes to. Matches the common shapes:
// curl -o / --output PATH, wget -O PATH, tee PATH, redirect > PATH / >>,
// cp/mv SRC DST. Only keeps tokens that look like absolute or qualified
// paths; bare names like "log" would create noise.
const PATH_LIKE = /^[~/]|^\.{1,2}\//
function extractBashOutputs(cmd: string): string[] {
  const out: string[] = []
  const tokens = cmd.match(/(?:"[^"]*"|'[^']*'|[^\s]+)/g) ?? []
  const stripQuotes = (s: string) => s.replace(/^['"]|['"]$/g, '')
  for (let i = 0; i < tokens.length; i++) {
    const t = stripQuotes(tokens[i])
    if (t === '-o' || t === '--output' || t === '-O' || t === 'tee') {
      const next = tokens[i + 1] ? stripQuotes(tokens[i + 1]) : ''
      if (PATH_LIKE.test(next)) out.push(next)
    }
    if (t === '>' || t === '>>') {
      const next = tokens[i + 1] ? stripQuotes(tokens[i + 1]) : ''
      if (PATH_LIKE.test(next)) out.push(next)
    } else if ((t.startsWith('>') || t.startsWith('>>')) && t.length > 1) {
      const target = stripQuotes(t.replace(/^>+/, ''))
      if (PATH_LIKE.test(target)) out.push(target)
    }
  }
  // cp/mv SRC DST — last argument.
  if (/^(cp|mv)\b/.test(cmd) && tokens.length >= 3) {
    const last = stripQuotes(tokens[tokens.length - 1])
    if (PATH_LIKE.test(last)) out.push(last)
  }
  return out
}

// MCP tools are addressed as mcp__<server>__<tool> by the SDK. Standard
// Claude Code tools (Read/Write/Bash/TodoWrite/Skill/...) are surfaced
// elsewhere in the UI (file list, todo list, inline cards) so the right
// rail only highlights the *external* surface area: which MCP servers /
// tools the agent actually reached for this session.
function isMcpTool(name: string): boolean {
  return name.startsWith('mcp__')
}

function walkCall(call: PersistedToolCall, stats: CallStats, fileSet: Set<string>): void {
  if (isMcpTool(call.tool)) {
    stats.totalToolCalls += 1
    stats.recentCalls.push({ tool: call.tool, detail: summarizeInput(call.tool, call.input) })
  }
  if (call.tool === 'TodoWrite' && !stats.todos) {
    const t = extractTodos(call.input)
    if (t) stats.todos = t
  }
  if (call.input && typeof call.input === 'object') {
    const o = call.input as Record<string, unknown>
    const path =
      (typeof o.file_path === 'string' && o.file_path) ||
      (typeof o.notebook_path === 'string' && o.notebook_path) ||
      ''
    if (path && /^(Write|Edit|MultiEdit|NotebookEdit)$/.test(call.tool)) {
      if (!fileSet.has(path)) {
        fileSet.add(path)
        stats.files.push(path)
      }
    }
    // Bash side-effects: detect output targets in shell commands so a curl
    // download / wget / redirect / tee / cp / mv shows up in Files.
    if (call.tool === 'Bash' && typeof o.command === 'string') {
      for (const out of extractBashOutputs(o.command)) {
        if (!fileSet.has(out)) {
          fileSet.add(out)
          stats.files.push(out)
        }
      }
    }
  }
  if (call.children) {
    for (const c of call.children) walkCall(c, stats, fileSet)
  }
}

function basename(p: string): string {
  const idx = p.lastIndexOf('/')
  return idx >= 0 ? p.slice(idx + 1) : p
}

function dirname(p: string): string {
  const idx = p.lastIndexOf('/')
  return idx > 0 ? p.slice(0, idx) : ''
}

export function TodoPanel({ session }: { session: Session | null }) {
  const messages = useSessionStore((s) => (session ? s.messages[session.id] ?? EMPTY : EMPTY))
  if (!session) return null
  const stats = collect(messages)
  const totalToolCalls = stats.totalToolCalls
  const hasAnything = !!stats.todos || stats.files.length > 0 || totalToolCalls > 0
  if (!hasAnything) {
    return (
      <aside className="sess-todo-panel">
        <div className="sctx-empty">
          Tasks, files touched, and tools used will land here as the agent works.
        </div>
      </aside>
    )
  }

  const done = stats.todos?.filter((t) => t.status === 'completed').length ?? 0
  const topFiles = stats.files.slice(0, 12)
  const recentCalls = stats.recentCalls.slice(0, 12)

  return (
    <aside className="sess-todo-panel">
      {stats.todos && stats.todos.length > 0 && (
        <section className="sctx-section">
          <div className="sctx-hd">
            <Icon name="check" size={11} />
            <span className="sctx-title">Todos</span>
            <span className="sctx-count">{done}/{stats.todos.length}</span>
          </div>
          <ul className="sess-todo-list">
            {stats.todos.map((t, i) => {
              const label = t.status === 'in_progress' && t.activeForm ? t.activeForm : t.content
              return (
                <li key={i} className={`sess-todo-item todo-${t.status}`}>
                  <span className={`todo-box todo-box-${t.status}`} aria-hidden="true">
                    {t.status === 'completed' ? '✓' : t.status === 'in_progress' ? '◐' : ''}
                  </span>
                  <span className="todo-label">{label}</span>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {topFiles.length > 0 && (
        <section className="sctx-section">
          <div className="sctx-hd">
            <Icon name="folder" size={11} />
            <span className="sctx-title">Files</span>
            <span className="sctx-count">{stats.files.length}</span>
          </div>
          <ul className="sctx-files">
            {topFiles.map((p) => (
              <li key={p} className="sctx-file" title={p}>
                <span className="sctx-file-name trunc">{basename(p)}</span>
                <span className="sctx-file-dir trunc">{dirname(p)}</span>
              </li>
            ))}
            {stats.files.length > topFiles.length && (
              <li className="sctx-more">+{stats.files.length - topFiles.length} more</li>
            )}
          </ul>
        </section>
      )}

      {recentCalls.length > 0 && (
        <section className="sctx-section">
          <div className="sctx-hd">
            <Icon name="server" size={11} />
            <span className="sctx-title">MCP</span>
            <span className="sctx-count">{totalToolCalls}</span>
          </div>
          <ul className="sctx-tools">
            {recentCalls.map((c, i) => (
              <li key={i} className="sctx-tool" title={c.detail ?? c.tool}>
                <span className="sctx-tool-name trunc">
                  {humanizeToolName(c.tool).label}
                </span>
                {c.detail && (
                  <span className="sctx-tool-detail trunc">{c.detail}</span>
                )}
              </li>
            ))}
            {stats.totalToolCalls > recentCalls.length && (
              <li className="sctx-more">+{stats.totalToolCalls - recentCalls.length} earlier</li>
            )}
          </ul>
        </section>
      )}
    </aside>
  )
}
