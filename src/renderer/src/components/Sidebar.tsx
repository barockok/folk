import { useEffect, useRef, useState } from 'react'
import { Icon } from './icons'
import { TweaksPanel } from './TweaksPanel'
import { useUIStore, SIDEBAR_MIN, SIDEBAR_MAX } from '../stores/useUIStore'
import { useProfileStore } from '../stores/useProfileStore'
import { useSessionStore } from '../stores/useSessionStore'
import { useSessions } from '../hooks/useSessions'
import type { PageKey } from '../stores/useUIStore'
import type { Session, SessionStatus } from '@shared/types'

const SIDEBAR_RECENTS_LIMIT = 14

interface RenameSessionModalProps {
  session: Session
  onClose: () => void
  onSubmit: (title: string) => Promise<void>
}

function RenameSessionModal({ session, onClose, onSubmit }: RenameSessionModalProps) {
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

function StatusDot({ status }: { status: SessionStatus }) {
  const color =
    status === 'running'
      ? 'var(--stripe-purple)'
      : status === 'error'
        ? 'var(--ruby)'
        : status === 'cancelled'
          ? 'var(--warn)'
          : 'transparent'
  if (color === 'transparent') return null
  return (
    <span
      className="sb-session-dot"
      style={{ background: color }}
      aria-hidden="true"
    />
  )
}

interface NavItem {
  id: PageKey
  label: string
  icon: string
}

interface NavGroup {
  group: string
  items: NavItem[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    group: 'Workspace',
    items: [
      { id: 'sessions', label: 'New session', icon: 'plus' },
      { id: 'mcp', label: 'MCP', icon: 'server' },
      { id: 'skills', label: 'Skills', icon: 'sparkles' },
      { id: 'plugins', label: 'Plugins', icon: 'puzzle' },
    ],
  },
  {
    group: 'Configure',
    items: [
      { id: 'model', label: 'Models', icon: 'cpu' },
      { id: 'keybindings', label: 'Keybindings', icon: 'keyboard' },
    ],
  },
]

export function Sidebar() {
  const page = useUIStore((s) => s.page)
  const setPage = useUIStore((s) => s.setPage)
  const collapsed = useUIStore((s) => s.sidebarCollapsed)
  const nickname = useProfileStore((s) => s.profile?.nickname)
  const sessions = useSessionStore((s) => s.sessions)
  const activeId = useSessionStore((s) => s.activeId)
  const setActive = useSessionStore((s) => s.setActive)
  const streamingSessions = useSessionStore((s) => s.streamingSessions)
  const popoutIds = useUIStore((s) => s.popoutIds)
  const requestNewSession = useUIStore((s) => s.requestNewSession)
  const setSidebarWidth = useUIStore((s) => s.setSidebarWidth)
  const { delete: deleteSession, rename, cancel } = useSessions()
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [menuId, setMenuId] = useState<string | null>(null)
  const [renameTarget, setRenameTarget] = useState<Session | null>(null)
  const tweaksOpen = useUIStore((s) => s.tweaksOpen)
  const setTweaksOpen = useUIStore((s) => s.setTweaksOpen)
  const toggleTweaks = useUIStore((s) => s.toggleTweaks)
  const tweaksWrapRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!tweaksOpen) return
    const onDown = (e: MouseEvent) => {
      if (!tweaksWrapRef.current) return
      if (!tweaksWrapRef.current.contains(e.target as Node)) setTweaksOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setTweaksOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [tweaksOpen, setTweaksOpen])

  // Close the row popover on outside click.
  useEffect(() => {
    if (!menuId) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (!t.closest('.sb-session-menu') && !t.closest('.sb-session-act')) {
        setMenuId(null)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [menuId])
  const dragStateRef = useRef<{ startX: number; startWidth: number } | null>(null)
  const [dragging, setDragging] = useState(false)

  // Drag-to-resize. Pointer-down on the handle captures the starting width
  // and tracks deltas at the document level so the user can flick out past
  // the sidebar without losing the grab.
  useEffect(() => {
    if (!dragging) return
    const onMove = (e: PointerEvent) => {
      const ds = dragStateRef.current
      if (!ds) return
      setSidebarWidth(ds.startWidth + (e.clientX - ds.startX))
    }
    const onUp = () => {
      dragStateRef.current = null
      setDragging(false)
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp, { once: true })
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    return () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [dragging, setSidebarWidth])

  const initial = (nickname || 'Y').slice(0, 1).toUpperCase()
  const displayName = nickname || 'You'

  const recents = sessions.slice(0, SIDEBAR_RECENTS_LIMIT)

  const openSession = (id: string) => {
    if (popoutIds.has(id)) {
      void window.folk.window.popout(id)
      return
    }
    setActive(id)
    setPage('sessions')
  }

  const handleDelete = async (s: Session) => {
    if (!confirm(`Delete "${s.title}"? This cannot be undone.`)) return
    await deleteSession(s.id)
  }

  return (
    <aside className={`sb${collapsed ? ' sb-collapsed' : ''}${dragging ? ' sb-resizing' : ''}`}>
      <div className="sb-brand">
        <div className="sb-logo" title={collapsed ? 'folk' : undefined}>
          <span>f</span>
        </div>
        <div className="sb-brand-name sb-fade" style={{ flex: 1 }}>folk</div>
      </div>

      <nav className="sb-nav scroll" aria-label="Main navigation">
        {NAV_GROUPS.map((g) => (
          <div key={g.group}>
            <div className="sb-group sb-fade">{g.group}</div>
            {g.items.map((it) => {
              // The "New session" entry doubles as the sessions-page nav and
              // the create-session action — clicking it always stages a fresh
              // hero composer (via requestNewSession), which also flips the
              // active page to sessions.
              const isNew = it.id === 'sessions'
              const onActivate = isNew ? requestNewSession : () => setPage(it.id)
              return (
                <div
                  key={it.id}
                  className={`sb-item${page === it.id ? ' active' : ''}`}
                  role="button"
                  tabIndex={0}
                  aria-current={page === it.id ? 'page' : undefined}
                  onClick={onActivate}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      if (e.key === ' ') e.preventDefault()
                      onActivate()
                    }
                  }}
                  title={collapsed ? it.label : undefined}
                >
                  <Icon name={it.icon} size={16} className="sb-ico" />
                  <span className="sb-fade">{it.label}</span>
                </div>
              )
            })}
          </div>
        ))}

        {!collapsed && (
          <div>
            <div className="sb-group sb-group-with-action">
              <span>Recents</span>
              <button
                type="button"
                className="sb-group-act"
                onClick={requestNewSession}
                title="New session (⌘N)"
                aria-label="New session"
              >
                <Icon name="plus" size={11} />
              </button>
            </div>
            <div className="sb-sessions">
              {recents.map((s) => {
                const isActive = s.id === activeId
                const isStreaming = streamingSessions.has(s.id)
                return (
                  <div
                    key={s.id}
                    className={`sb-session${isActive ? ' active' : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => openSession(s.id)}
                    onMouseEnter={() => setHoverId(s.id)}
                    onMouseLeave={() => setHoverId((cur) => (cur === s.id ? null : cur))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        if (e.key === ' ') e.preventDefault()
                        openSession(s.id)
                      }
                    }}
                    title={s.title}
                  >
                    <StatusDot status={s.status} />
                    <span className="sb-session-title trunc">{s.title || 'Untitled session'}</span>
                    {isStreaming && (
                      <button
                        type="button"
                        className="sb-session-act"
                        title="Stop turn"
                        aria-label={`Stop ${s.title}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          void cancel(s.id)
                        }}
                      >
                        <Icon name="pause" size={11} />
                      </button>
                    )}
                    {!isStreaming && (hoverId === s.id || menuId === s.id) && (
                      <button
                        type="button"
                        className="sb-session-act"
                        title="More"
                        aria-haspopup="menu"
                        aria-expanded={menuId === s.id}
                        aria-label={`Options for ${s.title}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          setMenuId((cur) => (cur === s.id ? null : s.id))
                        }}
                      >
                        <span style={{ fontSize: 14, lineHeight: 1 }}>⋯</span>
                      </button>
                    )}
                    {menuId === s.id && (
                      <div
                        className="sb-session-menu"
                        role="menu"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          role="menuitem"
                          className="sb-session-menu-item"
                          onClick={() => {
                            setMenuId(null)
                            setRenameTarget(s)
                          }}
                        >
                          <Icon name="edit" size={12} />
                          <span>Rename</span>
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="sb-session-menu-item sb-session-menu-item-danger"
                          onClick={() => {
                            setMenuId(null)
                            void handleDelete(s)
                          }}
                        >
                          <Icon name="trash" size={12} />
                          <span>Delete</span>
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </nav>

      <div
        className={`sb-profile${page === 'profile' ? ' on' : ''}`}
        role="button"
        tabIndex={0}
        aria-current={page === 'profile' ? 'page' : undefined}
        onClick={() => setPage('profile')}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            if (e.key === ' ') e.preventDefault()
            setPage('profile')
          }
        }}
        title={collapsed ? `${displayName} — profile` : undefined}
      >
        <div className="sb-profile-av">{initial}</div>
        <div className="sb-profile-text sb-fade" style={{ minWidth: 0, flex: 1 }}>
          <div className="sb-profile-name trunc">{displayName}</div>
          <div className="sb-profile-sub trunc">How folk refers to you</div>
        </div>
        <div
          className="tweaks-wrap tweaks-wrap-sb"
          ref={tweaksWrapRef}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="btn btn-plain btn-icon sb-profile-tweaks"
            onClick={(e) => {
              e.stopPropagation()
              toggleTweaks()
            }}
            title="Tweaks"
            aria-label="Open tweaks"
            aria-expanded={tweaksOpen}
            aria-haspopup="true"
          >
            <Icon name="settings" size={14} />
          </button>
          {tweaksOpen && (
            <div className="tweaks-popover" role="dialog" aria-label="Tweaks">
              <TweaksPanel />
            </div>
          )}
        </div>
      </div>

      {!collapsed && (
        <div
          className="sb-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          aria-valuemin={SIDEBAR_MIN}
          aria-valuemax={SIDEBAR_MAX}
          aria-valuenow={useUIStore.getState().sidebarWidth}
          onPointerDown={(e) => {
            e.preventDefault()
            ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
            dragStateRef.current = {
              startX: e.clientX,
              startWidth: useUIStore.getState().sidebarWidth
            }
            setDragging(true)
          }}
          onDoubleClick={() => setSidebarWidth(232)}
        />
      )}
      {renameTarget && (
        <RenameSessionModal
          session={renameTarget}
          onClose={() => setRenameTarget(null)}
          onSubmit={async (title) => {
            await rename(renameTarget.id, title)
          }}
        />
      )}
    </aside>
  )
}
