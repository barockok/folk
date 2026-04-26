import { useState, useMemo, useEffect, useRef } from 'react'
import { Icon } from '../../components/icons'
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

function dirBase(s: Session): string {
  const base = s.workingDir.split('/').filter(Boolean).pop() ?? s.workingDir
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

interface RenameModalProps {
  session: Session
  onClose: () => void
  onSubmit: (title: string) => Promise<void>
}

function RenameModal({ session, onClose, onSubmit }: RenameModalProps) {
  const [title, setTitle] = useState(session.title)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const submit = async () => {
    const trimmed = title.trim()
    if (!trimmed || trimmed === session.title) {
      onClose()
      return
    }
    setBusy(true)
    try {
      await onSubmit(trimmed)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form
        className="modal-card"
        role="dialog"
        aria-label="Rename session"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <div className="modal-hd">Rename session</div>
        <input
          ref={inputRef}
          type="text"
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              onClose()
            }
          }}
          disabled={busy}
        />
        <div className="modal-foot">
          <button className="btn btn-plain" type="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  )
}

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
  const [menuId, setMenuId] = useState<string | null>(null)
  const [renameTarget, setRenameTarget] = useState<Session | null>(null)

  // Click-outside closes menu.
  useEffect(() => {
    if (!menuId) return
    const handler = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (!t.closest('.sess-menu') && !t.closest('.sess-kebab')) {
        setMenuId(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuId])

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

  const handleDelete = async (s: Session) => {
    setMenuId(null)
    if (!confirm(`Delete "${s.title}"? This cannot be undone.`)) return
    setPendingId(s.id)
    try {
      await onDelete(s.id)
    } finally {
      setPendingId(null)
    }
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
                const subtitle = s.goal ?? dirBase(s)
                const notStarted = !s.claudeStarted
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
                  >
                    <div className="sess-top">
                      <div className="sess-meta">
                        <StatusDot status={s.status} />
                      </div>
                      <span className="sess-name" title={s.title}>
                        {s.title}
                      </span>
                    </div>
                    <div className="sess-preview">
                      <span className="sess-preview-dir">{subtitle}</span>
                      <span className="sess-preview-sep">·</span>
                      <span className="sess-preview-time">
                        {notStarted ? 'not started' : formatRelTime(s.createdAt)}
                      </span>
                    </div>

                    <button
                      className="sess-kebab"
                      type="button"
                      title="More"
                      aria-haspopup="menu"
                      aria-expanded={menuId === s.id}
                      aria-label={`Session options for ${s.title}`}
                      disabled={pendingId === s.id}
                      onClick={(e) => {
                        e.stopPropagation()
                        setMenuId((cur) => (cur === s.id ? null : s.id))
                      }}
                    >
                      ⋯
                    </button>

                    {menuId === s.id && (
                      <div
                        className="sess-menu"
                        role="menu"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          role="menuitem"
                          className="sess-menu-item"
                          onClick={() => {
                            setMenuId(null)
                            setRenameTarget(s)
                          }}
                        >
                          <Icon name="edit" size={13} className="sess-menu-ic" />
                          <span>Rename</span>
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="sess-menu-item sess-menu-item-danger"
                          onClick={() => void handleDelete(s)}
                        >
                          <Icon name="trash" size={13} className="sess-menu-ic" />
                          <span>Delete</span>
                        </button>
                      </div>
                    )}
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

      {renameTarget && (
        <RenameModal
          session={renameTarget}
          onClose={() => setRenameTarget(null)}
          onSubmit={async (title) => {
            await onRename(renameTarget.id, title)
          }}
        />
      )}
    </div>
  )
}
