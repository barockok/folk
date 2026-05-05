import { useEffect, useState } from 'react'
import { useSessionStore } from '../stores/useSessionStore'
import { useUIStore } from '../stores/useUIStore'
import { Conversation } from '../pages/sessions/Conversation'
import { Composer } from '../pages/sessions/Composer'
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
    overflow: 'hidden'
  }
}

export function PopoutShell({ sessionId }: { sessionId: string }) {
  const [session, setSession] = useState<Session | null>(null)
  const setActive = useSessionStore((s) => s.setActive)
  const hydrateMessages = useSessionStore((s) => s.hydrateMessages)
  const rightSidebarCollapsed = useUIStore((s) => s.rightSidebarCollapsed)
  const toggleRightSidebar = useUIStore((s) => s.toggleRightSidebar)

  useEffect(() => {
    void (async () => {
      const s = await window.folk.sessions.get(sessionId)
      if (s) {
        setSession(s)
        setActive(s.id)
        await hydrateMessages(s.id)
      }
    })()
  }, [sessionId, setActive, hydrateMessages])

  async function handleSend(text: string) {
    if (!session) return
    await window.folk.agent.sendMessage(session.id, text)
  }

  async function handleCancel() {
    if (!session) return
    await window.folk.agent.cancel(session.id)
  }

  return (
    <div style={popoutStyles.root}>
      <div style={popoutStyles.titlebar}>
        <span style={popoutStyles.title}>{session?.title ?? 'Loading…'}</span>
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
          <Conversation session={session} />
          <Composer
            session={session}
            onSend={handleSend}
            onCancel={handleCancel}
          />
        </div>
      </div>
    </div>
  )
}
