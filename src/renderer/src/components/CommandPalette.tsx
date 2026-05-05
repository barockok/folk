import { useEffect, useMemo, useRef, useState } from 'react'
import { useUIStore } from '../stores/useUIStore'
import type { PageKey } from '../stores/useUIStore'
import { useSessionStore } from '../stores/useSessionStore'
import { Icon } from './icons'

type ItemGroup = 'Go to' | 'Action' | 'Sessions'

interface CmdItem {
  g: ItemGroup
  id: string
  label: string
  icon: string
  action: () => void
}

export function CommandPalette() {
  const cmdkOpen = useUIStore((s) => s.cmdkOpen)
  const closeCmdk = useUIStore((s) => s.closeCmdk)
  const setPage = useUIStore((s) => s.setPage)
  const sessions = useSessionStore((s) => s.sessions)
  const setActive = useSessionStore((s) => s.setActive)
  const popoutIds = useUIStore((s) => s.popoutIds)

  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // Bind ⌘K / Ctrl+K globally
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        useUIStore.getState().openCmdk()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    if (cmdkOpen) {
      setQ('')
      setSel(0)
      // Intentional: wait for the DOM to render before focusing
      setTimeout(() => inputRef.current?.focus(), 20)
    }
  }, [cmdkOpen])

  const nav = (page: PageKey) => {
    setPage(page)
    closeCmdk()
  }

  const isPopout = /^#?popout\//.test(window.location.hash)

  const openSession = (id: string) => {
    if (popoutIds.has(id)) {
      void window.folk.window.popout(id)
      closeCmdk()
      return
    }
    if (isPopout) {
      // Signal the main window to activate this session via storage event.
      // Popup stores are isolated — direct setActive only affects this window.
      localStorage.setItem('folk.activateSession', id)
      closeCmdk()
      return
    }
    setActive(id)
    setPage('sessions')
    closeCmdk()
  }

  const items = useMemo<CmdItem[]>(() => {
    const base: CmdItem[] = [
      { g: 'Go to', id: 'sessions',     label: 'Sessions (Terminal)',         icon: 'terminal',  action: () => nav('sessions') },
      { g: 'Go to', id: 'mcp',          label: 'MCP',                        icon: 'server',    action: () => nav('mcp') },
      { g: 'Go to', id: 'skills',       label: 'Skills',                     icon: 'sparkles',  action: () => nav('skills') },
      { g: 'Go to', id: 'plugins',      label: 'Plugins',                    icon: 'puzzle',    action: () => nav('plugins') },
      { g: 'Go to', id: 'model',        label: 'Models & Providers',         icon: 'cpu',       action: () => nav('model') },
      { g: 'Go to', id: 'keybindings',  label: 'Keybindings',               icon: 'keyboard',  action: () => nav('keybindings') },
      { g: 'Action', id: 'add-mcp',     label: 'Add a new MCP',             icon: 'plus',
        // TODO: thread action payload for "Add MCP" flow (Task 29)
        action: () => nav('mcp') },
      { g: 'Action', id: 'new-session', label: 'Start a new session',       icon: 'terminal',  action: () => nav('sessions') },
      { g: 'Action', id: 'test-all',    label: 'Test-connect all MCPs',      icon: 'bolt',   action: () => nav('mcp') },
    ]
    const needle = q.trim().toLowerCase()
    // Sessions only appear once the user is actually searching — keeps the
    // empty-state palette compact and avoids any chance of opening a session
    // by accident (Enter on first-row default).
    if (!needle) return base
    const matchedBase = base.filter((i) => i.label.toLowerCase().includes(needle))
    const matchedSessions: CmdItem[] = sessions
      .filter((s) => (s.title || 'Untitled session').toLowerCase().includes(needle))
      .map((s) => ({
        g: 'Sessions',
        id: `s-${s.id}`,
        label: s.title || 'Untitled session',
        icon: 'terminal',
        action: () => openSession(s.id)
      }))
    return [...matchedBase, ...matchedSessions]
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, setPage, sessions])

  if (!cmdkOpen) return null

  const groups: Record<string, CmdItem[]> = {}
  items.forEach((it) => {
    ;(groups[it.g] = groups[it.g] || []).push(it)
  })

  const run = (it: CmdItem) => {
    it.action()
    // action already calls closeCmdk via nav(); standalone actions close explicitly
    closeCmdk()
  }

  return (
    <div
      className="modal-scrim modal-scrim--top"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onClick={closeCmdk}
      onKeyDown={(e) => {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setSel((s) => Math.min(items.length - 1, s + 1))
        } else if (e.key === 'ArrowUp') {
          e.preventDefault()
          setSel((s) => Math.max(0, s - 1))
        } else if (e.key === 'Enter') {
          e.preventDefault()
          if (items[sel]) run(items[sel])
        } else if (e.key === 'Escape') {
          closeCmdk()
        }
      }}
    >
      <div className="cmdk" onClick={(e) => e.stopPropagation()}>
        <div className="cmdk-input-wrap">
          <Icon name="search" size={16} style={{ color: 'var(--fg-faint)' }} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setSel(0)
            }}
            placeholder="Type a command or search…"
          />
          <span className="kbd">Esc</span>
        </div>
        <div className="cmdk-list scroll" role="listbox">
          {items.length === 0 && (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--fg-faint)', fontSize: 13 }}>
              No results
            </div>
          )}
          {Object.entries(groups).map(([g, arr]) => (
            <div key={g}>
              <div className="cmdk-group">{g}</div>
              {arr.map((it) => {
                const idx = items.indexOf(it)
                return (
                  <div
                    key={it.id}
                    className={'cmdk-item' + (idx === sel ? ' on' : '')}
                    role="option"
                    aria-selected={idx === sel}
                    onMouseEnter={() => setSel(idx)}
                    onClick={() => run(it)}
                  >
                    <Icon name={it.icon} size={15} />
                    <span>{it.label}</span>
                    <span className="trail">↵</span>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
