import { useEffect, useState } from 'react'
import { useSessions } from '../hooks/useSessions'
import { useSessionStore } from '../stores/useSessionStore'
import { useUIStore } from '../stores/useUIStore'
import { Conversation } from '../pages/sessions/Conversation'
import { Composer } from '../pages/sessions/Composer'
import { TodoPanel } from '../pages/sessions/TodoPanel'
import { Icon } from './icons'
import type { Session } from '@shared/types'

const popoutStyles = {
  root: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100vh',
    overflow: 'hidden',
    background: 'var(--bg-app)'
  },
  titlebar: {
    height: 38,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    paddingLeft: 80,
    paddingRight: 12,
    WebkitAppRegion: 'drag' as const,
    borderBottom: '1px solid var(--border)'
  },
  title: {
    fontSize: 13,
    fontFamily: 'var(--ff-sans)',
    color: 'var(--body)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    flex: 1
  },
  panelToggle: {
    WebkitAppRegion: 'no-drag' as const,
    background: 'transparent',
    border: 0,
    cursor: 'pointer',
    padding: '4px 6px',
    color: 'var(--fg-faint)'
  },
  body: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden'
  },
  main: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
    minWidth: 0
  }
}

export function PopoutShell({ sessionId }: { sessionId: string }) {
  const [session, setSession] = useState<Session | null>(null)
  const { setActive, send, cancel } = useSessions()
  const rightSidebarCollapsed = useUIStore((s) => s.rightSidebarCollapsed)
  const toggleRightSidebar = useUIStore((s) => s.toggleRightSidebar)

  useEffect(() => {
    void (async () => {
      const s = await window.folk.sessions.get(sessionId)
      if (s) {
        setSession(s)
        setActive(s.id)
      }
    })()
  }, [sessionId, setActive])

  const active = useSessionStore((s) => s.sessions.find((x) => x.id === sessionId) ?? session)

  return (
    <div style={popoutStyles.root}>
      <div style={popoutStyles.titlebar}>
        <span style={popoutStyles.title}>{active?.title ?? session?.title ?? 'Loading…'}</span>
        <button
          type="button"
          style={popoutStyles.panelToggle}
          onClick={toggleRightSidebar}
          title={rightSidebarCollapsed ? 'Show context panel' : 'Hide context panel'}
        >
          <Icon name="sidebar" size={14} style={{ transform: 'scaleX(-1)' }} />
        </button>
      </div>
      <div style={popoutStyles.body}>
        <div style={popoutStyles.main}>
          <Conversation session={active ?? null} />
          <Composer
            session={active ?? null}
            onSend={(text, atts) => void send(sessionId, text, atts)}
            onCancel={() => void cancel(sessionId)}
          />
        </div>
        {!rightSidebarCollapsed && (
          <TodoPanel session={active ?? null} />
        )}
      </div>
    </div>
  )
}
