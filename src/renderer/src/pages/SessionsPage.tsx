import { useSessions } from '../hooks/useSessions'
import { HistoryRail } from './sessions/HistoryRail'
import { Conversation } from './sessions/Conversation'
import { Composer } from './sessions/Composer'

export function SessionsPage() {
  const { sessions, activeId, setActive, delete: del, send, cancel } = useSessions()
  const active = sessions.find((s) => s.id === activeId) ?? null

  return (
    <div className="sess-wrap">
      <HistoryRail
        sessions={sessions}
        activeId={activeId}
        onPick={setActive}
        onDelete={del}
        onNew={() => setActive(null)}
      />
      <div className="sess-main">
        <div className="sess-body-wrap">
          <Conversation session={active} />
        </div>
        <Composer
          session={active}
          onSend={(text, atts) => active && send(active.id, text, atts)}
          onCancel={() => active && cancel(active.id)}
        />
      </div>
    </div>
  )
}
