import { useState, useMemo, useEffect, useRef } from 'react'
import type { Session, SessionStatus } from '@shared/types'

interface HistoryRailProps {
  sessions: Session[]
  activeId: string | null
  onPick: (id: string) => void
  onDelete: (id: string) => Promise<void>
  onRename: (id: string, title: string) => Promise<void>
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

function sessionPreview(s: Session): string {
  const base = s.workingDir.split('/').filter(Boolean).pop() ?? s.workingDir
  if (!s.claudeStarted) return `${base} · not started`
  return base
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

export function HistoryRail({
  sessions,
  activeId,
  onPick,
  onDelete,
  onRename,
  onNew
}: HistoryRailProps) {
  const [query, setQuery] = useState('')
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (renamingId && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [renamingId])

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

  const handleDelete = async (e: React.MouseEvent, id: string, title: string) => {
    e.stopPropagation()
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return
    setPendingId(id)
    try {
      await onDelete(id)
    } finally {
      setPendingId(null)
    }
  }

  const startRename = (e: React.MouseEvent, s: Session) => {
    e.stopPropagation()
    setRenamingId(s.id)
    setDraftTitle(s.title)
  }

  const commitRename = async (id: string) => {
    const title = draftTitle.trim()
    setRenamingId(null)
    if (!title) return
    const orig = sessions.find((s) => s.id === id)
    if (!orig || title === orig.title) return
    setPendingId(id)
    try {
      await onRename(id, title)
    } finally {
      setPendingId(null)
    }
  }

  const cancelRename = () => {
    setRenamingId(null)
    setDraftTitle('')
  }

  return (
    <div className="sess-rail">
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

      <div className="sess-list">
        {GROUP_ORDER.map((group) => {
          const items = grouped[group]
          if (items.length === 0) return null
          return (
            <div key={group}>
              <div className="sess-group">{group}</div>
              {items.map((s) => {
                const isActive = s.id === activeId
                const isRenaming = renamingId === s.id
                return (
                  <div
                    key={s.id}
                    className={`sess-item ${isActive ? 'on' : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => !isRenaming && onPick(s.id)}
                    onDoubleClick={(e) => startRename(e, s)}
                    onKeyDown={(e) => {
                      if (isRenaming) return
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onPick(s.id)
                      }
                    }}
                  >
                    <div className="sess-top">
                      <div className="sess-meta">
                        <StatusDot status={s.status} />
                      </div>
                      {isRenaming ? (
                        <input
                          ref={inputRef}
                          className="input sess-rename-input"
                          value={draftTitle}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => setDraftTitle(e.target.value)}
                          onBlur={() => void commitRename(s.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              void commitRename(s.id)
                            } else if (e.key === 'Escape') {
                              e.preventDefault()
                              cancelRename()
                            }
                          }}
                        />
                      ) : (
                        <span className="sess-name" title="Double-click to rename">
                          {s.title}
                        </span>
                      )}
                      <span className="sess-time">{formatRelTime(s.createdAt)}</span>
                    </div>
                    <div className="sess-preview">
                      {s.goal ?? sessionPreview(s)}
                    </div>

                    <div className="sess-actions" onClick={(e) => e.stopPropagation()}>
                      <button
                        className="sess-action"
                        type="button"
                        title="Rename"
                        aria-label={`Rename session ${s.title}`}
                        disabled={pendingId === s.id || isRenaming}
                        onClick={(e) => startRename(e, s)}
                      >
                        ✎
                      </button>
                      <button
                        className="sess-action sess-action-danger"
                        type="button"
                        title="Delete"
                        aria-label={`Delete session ${s.title}`}
                        disabled={pendingId === s.id}
                        onClick={(e) => void handleDelete(e, s.id, s.title)}
                      >
                        {pendingId === s.id ? '…' : '✕'}
                      </button>
                    </div>
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
