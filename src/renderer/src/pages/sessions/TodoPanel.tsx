import { useSessionStore } from '../../stores/useSessionStore'
import type { Session, PersistedToolCall, MessageBlock } from '@shared/types'
import { extractTodos, type TodoItem } from './ToolCard'
import { Icon } from '../../components/icons'

const EMPTY: never[] = []

function findLatestTodos(messages: ReadonlyArray<{ blocks: ReadonlyArray<MessageBlock> }>): TodoItem[] | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const blocks = messages[i].blocks
    for (let j = blocks.length - 1; j >= 0; j--) {
      const b = blocks[j]
      if (b.kind !== 'tool') continue
      const found = walkCall(b.call)
      if (found) return found
    }
  }
  return null
}

function walkCall(call: PersistedToolCall): TodoItem[] | null {
  if (call.tool === 'TodoWrite') {
    const t = extractTodos(call.input)
    if (t) return t
  }
  if (call.children) {
    for (let i = call.children.length - 1; i >= 0; i--) {
      const r = walkCall(call.children[i])
      if (r) return r
    }
  }
  return null
}

export function TodoPanel({ session }: { session: Session | null }) {
  const messages = useSessionStore((s) => (session ? s.messages[session.id] ?? EMPTY : EMPTY))
  if (!session) return null
  const todos = findLatestTodos(messages)
  if (!todos || todos.length === 0) return null
  const done = todos.filter((t) => t.status === 'completed').length
  return (
    <aside className="sess-todo-panel">
      <div className="sess-todo-hd">
        <Icon name="terminal" size={12} />
        <span className="sess-todo-title">Todos</span>
        <span className="sess-todo-count">{done}/{todos.length}</span>
      </div>
      <ul className="sess-todo-list">
        {todos.map((t, i) => {
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
    </aside>
  )
}
