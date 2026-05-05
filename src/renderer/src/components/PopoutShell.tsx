import { useEffect, useState } from 'react'
import { useSessions } from '../hooks/useSessions'
import { useSessionStore } from '../stores/useSessionStore'
import { useUIStore } from '../stores/useUIStore'
import { Conversation } from '../pages/sessions/Conversation'
import { Composer } from '../pages/sessions/Composer'
import { TodoPanel } from '../pages/sessions/TodoPanel'
import { FileViewer } from '../pages/sessions/FileViewer'
import { CommandPalette } from './CommandPalette'
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
  wrap: {
    flex: 1,
    minHeight: 0
  }
}

export function PopoutShell({ sessionId }: { sessionId: string }) {
  const [session, setSession] = useState<Session | null>(null)
  const { setActive, send, cancel } = useSessions()
  const rightSidebarCollapsed = useUIStore((s) => s.rightSidebarCollapsed)
  const toggleRightSidebar = useUIStore((s) => s.toggleRightSidebar)
  const viewerFilePath = useUIStore((s) => s.viewerFilePath)

  useEffect(() => {
    void (async () => {
      const s = await window.folk.sessions.get(sessionId)
      if (s) {
        setSession(s)
        setActive(s.id)
      }
    })()
  }, [sessionId, setActive])

  const storeSession = useSessionStore((s) => s.sessions.find((x) => x.id === sessionId) ?? null)
  const active = storeSession ?? session

  return (
    <div style={popoutStyles.root}>
      <CommandPalette />
      <div style={popoutStyles.titlebar}>
        <span style={popoutStyles.title}>{active?.title ?? 'Loading…'}</span>
        <button
          type="button"
          style={popoutStyles.panelToggle}
          onClick={toggleRightSidebar}
          title={rightSidebarCollapsed ? 'Show context panel' : 'Hide context panel'}
        >
          <Icon name="sidebar" size={14} style={{ transform: 'scaleX(-1)' }} />
        </button>
      </div>
      <div className="sess-wrap" style={popoutStyles.wrap}>
        <div className="sess-main">
          <div className="sess-body-wrap">
            <Conversation key={sessionId} session={active ?? null} />
          </div>
          <Composer
            session={active ?? null}
            onSend={(text, atts) => void send(sessionId, text, atts)}
            onCancel={() => void cancel(sessionId)}
          />
        </div>
        {viewerFilePath ? (
          <FileViewer path={viewerFilePath} />
        ) : (
          !rightSidebarCollapsed && <TodoPanel session={active ?? null} />
        )}
      </div>
    </div>
  )
}
