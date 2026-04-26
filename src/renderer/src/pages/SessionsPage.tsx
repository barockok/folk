import { useState } from 'react'
import { useSessions } from '../hooks/useSessions'
import { HistoryRail } from './sessions/HistoryRail'
import { Conversation } from './sessions/Conversation'
import { Composer } from './sessions/Composer'
import { SessionSetup } from '../onboarding/SessionSetup'
import type { SessionConfig } from '@shared/types'

export function SessionsPage() {
  const { sessions, activeId, setActive, create, delete: del, rename, send, cancel } = useSessions()
  const active = sessions.find((s) => s.id === activeId) ?? null
  const [needsSetup, setNeedsSetup] = useState(false)

  async function handleLaunch(config: SessionConfig) {
    await create(config)
    setNeedsSetup(false)
  }

  return (
    <div className="sess-wrap">
      <HistoryRail
        sessions={sessions}
        activeId={activeId}
        onPick={(id) => { setActive(id); setNeedsSetup(false) }}
        onDelete={del}
        onRename={async (id, title) => { await rename(id, title) }}
        onNew={() => { setActive(null); setNeedsSetup(true) }}
      />
      <div className="sess-main">
        {needsSetup ? (
          <SessionSetup
            onLaunch={handleLaunch}
            onCancel={() => setNeedsSetup(false)}
          />
        ) : (
          <>
            <div className="sess-body-wrap">
              <Conversation key={active?.id ?? 'none'} session={active} />
            </div>
            <Composer
              session={active}
              onSend={(text, atts) => active && send(active.id, text, atts)}
              onCancel={() => active && cancel(active.id)}
            />
          </>
        )}
      </div>
    </div>
  )
}
