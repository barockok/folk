import { useState } from 'react'
import { useSessionStore } from '../../stores/useSessionStore'
import { useUIStore } from '../../stores/useUIStore'
import type { Session, PersistedToolCall, MessageBlock } from '@shared/types'
import { extractTodos, humanizeToolName, type TodoItem } from './ToolCard'
import { Icon } from '../../components/icons'
import { fileIconFor } from '../../lib/fileIcon'
import { ShellPanel, hasShells } from './ShellPanel'

const EMPTY: never[] = []

interface CallStats {
  todos: TodoItem[] | null
  totalToolCalls: number
  // Tree shape: server → { total, tools: { toolName → count } }. Ordered
  // by insertion (first-seen), so the most recently active server tends to
  // sit at the top of the rail.
  mcpByServer: Map<string, { total: number; tools: Map<string, number> }>
  files: string[] // ordered, latest-first, deduped
}

function splitMcpToolName(raw: string): { server: string; tool: string } | null {
  const m = raw.match(/^mcp__[^_]+(?:[-_][^_]+)*?__(.+)$/)
  if (!m) return null
  const h = humanizeToolName(raw)
  const server = h.server ?? 'mcp'
  const tool = m[1].replace(/_/g, ' ')
  return { server, tool }
}

function collect(messages: ReadonlyArray<{ blocks: ReadonlyArray<MessageBlock> }>): CallStats {
  const stats: CallStats = { todos: null, totalToolCalls: 0, mcpByServer: new Map(), files: [] }
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
    const split = splitMcpToolName(call.tool)
    if (split) {
      const entry = stats.mcpByServer.get(split.server) ?? { total: 0, tools: new Map<string, number>() }
      entry.total += 1
      entry.tools.set(split.tool, (entry.tools.get(split.tool) ?? 0) + 1)
      stats.mcpByServer.set(split.server, entry)
    }
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
  const openFileViewer = useUIStore((s) => s.openFileViewer)
  const viewerLoadingPath = useUIStore((s) => s.viewerLoadingPath)
  if (!session) return null
  const stats = collect(messages)
  const totalToolCalls = stats.totalToolCalls
  const shellsPresent = hasShells(messages)
  const hasAnything =
    !!stats.todos || stats.files.length > 0 || totalToolCalls > 0 || shellsPresent
  if (!hasAnything) {
    return (
      <aside className="sess-todo-panel">
        <div className="sctx-empty">
          <Icon name="sidebar" size={14} />
          <div className="sctx-empty-title">No context yet</div>
          <div className="sctx-empty-sub">
            Todos, files, and MCP calls will appear here as the session runs.
          </div>
        </div>
      </aside>
    )
  }

  const done = stats.todos?.filter((t) => t.status === 'completed').length ?? 0
  const topFiles = stats.files.slice(0, 12)
  const mcpServers = Array.from(stats.mcpByServer.entries())

  return (
    <aside className="sess-todo-panel">
      <ShellPanel session={session} />
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
            {topFiles.map((p) => {
              const icon = fileIconFor(p)
              const isLoading = viewerLoadingPath === p
              return (
                <li
                  key={p}
                  className={`sctx-file${isLoading ? ' is-loading' : ''}`}
                  title={p}
                  role="button"
                  tabIndex={0}
                  aria-busy={isLoading}
                  onClick={() => { void openFileViewer(p) }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      if (e.key === ' ') e.preventDefault()
                      void openFileViewer(p)
                    }
                  }}
                >
                  <span className="sctx-file-icon" style={{ color: icon.color }}>
                    {isLoading ? <span className="spinner" /> : <Icon name={icon.name} size={14} />}
                  </span>
                  <span className="sctx-file-text">
                    <span className="sctx-file-name trunc">{basename(p)}</span>
                    <span className="sctx-file-dir trunc">{dirname(p)}</span>
                  </span>
                </li>
              )
            })}
            {stats.files.length > topFiles.length && (
              <li className="sctx-more">+{stats.files.length - topFiles.length} more</li>
            )}
          </ul>
        </section>
      )}

      {mcpServers.length > 0 && (
        <section className="sctx-section">
          <div className="sctx-hd">
            <Icon name="server" size={11} />
            <span className="sctx-title">MCP</span>
            <span className="sctx-count">{totalToolCalls}</span>
          </div>
          <ul className="sctx-mcp">
            {mcpServers.map(([server, info]) => (
              <McpServerNode key={server} server={server} total={info.total} tools={info.tools} />
            ))}
          </ul>
        </section>
      )}
    </aside>
  )
}

function McpServerNode({
  server,
  total,
  tools
}: {
  server: string
  total: number
  tools: Map<string, number>
}) {
  const [open, setOpen] = useState(false)
  const sorted = Array.from(tools.entries()).sort((a, b) => b[1] - a[1])
  return (
    <li className={`sctx-mcp-server${open ? ' open' : ''}`}>
      <button
        type="button"
        className="sctx-mcp-row"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="sctx-mcp-caret" aria-hidden="true">
          <Icon name="chevronRight" size={12} />
        </span>
        <span className="sctx-mcp-name trunc" title={server}>{server}</span>
        <span className="sctx-mcp-count">{total}</span>
      </button>
      {open && (
        <ul className="sctx-mcp-tools">
          {sorted.map(([tool, count]) => (
            <li key={tool} className="sctx-mcp-tool" title={tool}>
              <span className="sctx-mcp-tool-name trunc">{tool}</span>
              <span className="sctx-mcp-tool-count">{count}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}
