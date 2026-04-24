import { useState, useMemo } from 'react'
import type { Session, SessionStatus } from '@shared/types'

interface HistoryRailProps {
  sessions: Session[]
  activeId: string | null
  onPick: (id: string) => void
  onDelete: (id: string) => Promise<void>
  onNew: () => void
}

type Group = 'Today' | 'Yesterday' | 'This week' | 'Earlier'

function getGroup(createdAt: number): Group {
  const now = new Date()
  const d = new Date(createdAt)
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const yesterdayStart = todayStart - 86400000
  const weekStart = todayStart - 6 * 86400000

  if (createdAt >= todayStart) return 'Today'
  if (createdAt >= yesterdayStart) return 'Yesterday'
  if (createdAt >= weekStart) return 'This week'
  return 'Earlier'
}

function formatRelTime(createdAt: number): string {
  const diff = Date.now() - createdAt
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function StatusDot({ status }: { status: SessionStatus }) {
  const color =
    status === 'running'
      ? 'var(--stripe-purple)'
      : status === 'error'
        ? 'var(--ruby)'
        : status === 'cancelled'
          ? 'var(--warn)'
          : 'var(--fg-faint)'
  return (
    <svg className="dot" width="6" height="6" viewBox="0 0 6 6" style={{ flexShrink: 0 }}>
      <circle cx="3" cy="3" r="3" fill={color} />
    </svg>
  )
}

const GROUP_ORDER: Group[] = ['Today', 'Yesterday', 'This week', 'Earlier']

export function HistoryRail({ sessions, activeId, onPick, onDelete, onNew }: HistoryRailProps) {
  const [query, setQuery] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    if (!query.trim()) return sessions
    const q = query.toLowerCase()
    return sessions.filter((s) => s.title.toLowerCase().includes(q))
  }, [sessions, query])

  const grouped = useMemo(() => {
    const map: Record<Group, Session[]> = {
      Today: [],
      Yesterday: [],
      'This week': [],
      Earlier: []
    }
    for (const s of filtered) {
      map[getGroup(s.createdAt)].push(s)
    }
    return map
  }, [filtered])

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    setDeletingId(id)
    try {
      await onDelete(id)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="sess-rail">
      {/* Header */}
      <div className="sess-rail-hd">
        <h3>Sessions</h3>
        <button
          className="btn btn-primary"
          onClick={onNew}
          type="button"
          style={{ fontSize: 12, padding: '4px 10px' }}
          title="New session (⌘N)"
        >
          + New
        </button>
      </div>

      {/* Search */}
      <div className="sess-search">
        <input
          className="input"
          type="search"
          placeholder="Search sessions…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ width: '100%', fontSize: 13 }}
        />
      </div>

      {/* List */}
      <div className="sess-list">
        {GROUP_ORDER.map((group) => {
          const items = grouped[group]
          if (items.length === 0) return null
          return (
            <div key={group}>
              <div className="sess-group">{group}</div>
              {items.map((s) => {
                const isActive = s.id === activeId
                return (
                  <div
                    key={s.id}
                    className={`sess-item ${isActive ? 'on' : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => onPick(s.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onPick(s.id)
                      }
                    }}
                    style={{ position: 'relative' }}
                  >
                    <div className="sess-top">
                      <div className="sess-meta">
                        <StatusDot status={s.status} />
                      </div>
                      <span className="sess-name">{s.title}</span>
                      <span className="sess-time">{formatRelTime(s.createdAt)}</span>
                    </div>
                    <div className="sess-preview">{s.goal ?? 'No messages yet'}</div>

                    {/* Delete on hover — always rendered, visible via CSS :hover on parent */}
                    <button
                      className="btn btn-plain"
                      style={{
                        position: 'absolute',
                        right: 6,
                        top: 6,
                        padding: '2px 6px',
                        fontSize: 11,
                        opacity: 0,
                        transition: 'opacity 120ms',
                        color: 'var(--ruby)'
                      }}
                      onMouseEnter={(e) =>
                        ((e.currentTarget as HTMLButtonElement).style.opacity = '1')
                      }
                      onMouseLeave={(e) =>
                        ((e.currentTarget as HTMLButtonElement).style.opacity = '0')
                      }
                      onClick={(e) => handleDelete(e, s.id)}
                      disabled={deletingId === s.id}
                      title="Delete session"
                      type="button"
                      aria-label={`Delete session ${s.title}`}
                    >
                      {deletingId === s.id ? '…' : '✕'}
                    </button>
                  </div>
                )
              })}
            </div>
          )
        })}

        {filtered.length === 0 && (
          <div className="empty" style={{ padding: '40px 16px', fontSize: 13 }}>
            {query ? 'No sessions match.' : 'No sessions yet. Start one!'}
          </div>
        )}
      </div>
    </div>
  )
}
