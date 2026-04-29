import { useState } from 'react'
import { useSessions } from '../hooks/useSessions'
import { HistoryRail } from './sessions/HistoryRail'
import { Conversation } from './sessions/Conversation'
import { Composer } from './sessions/Composer'
import { TodoPanel } from './sessions/TodoPanel'
import { SessionsEmpty } from './sessions/SessionsEmpty'
import { SessionSetup } from '../onboarding/SessionSetup'
import { loadDefaultSessionConfig } from '../lib/defaultSessionConfig'
import type { SessionConfig } from '@shared/types'

export function SessionsPage() {
  const { sessions, activeId, setActive, create, delete: del, rename, send, cancel } = useSessions()
  const active = sessions.find((s) => s.id === activeId) ?? null
  const [needsSetup, setNeedsSetup] = useState(false)

  async function handleLaunch(config: SessionConfig) {
    await create(config)
    setNeedsSetup(false)
  }

  async function handleNew() {
    const def = loadDefaultSessionConfig()
    if (def && def.modelId && def.workingDir) {
      await create({
        modelId: def.modelId,
        workingDir: def.workingDir,
        flags: def.flags,
        permissionMode: def.permissionMode,
        incognito: def.incognito,
        enabledMcpIds: def.enabledMcpIds ?? null
      })
      setNeedsSetup(false)
      return
    }
    setActive(null)
    setNeedsSetup(true)
  }

  function handleConfigureNew() {
    setActive(null)
    setNeedsSetup(true)
  }

  return (
    <div className="sess-wrap">
      <HistoryRail
        sessions={sessions}
        activeId={activeId}
        onPick={(id) => { setActive(id); setNeedsSetup(false) }}
        onDelete={del}
        onRename={async (id, title) => { await rename(id, title) }}
        onNew={handleNew}
        onConfigureNew={handleConfigureNew}
      />
      <div className="sess-main">
        {needsSetup ? (
          <SessionSetup
            onLaunch={handleLaunch}
            onCancel={() => setNeedsSetup(false)}
          />
        ) : active ? (
          <>
            <div className="sess-body-wrap">
              <Conversation key={active.id} session={active} />
            </div>
            <Composer
              session={active}
              onSend={(text, atts) => send(active.id, text, atts)}
              onCancel={() => cancel(active.id)}
            />
          </>
        ) : (
          <SessionsEmpty
            hasSessions={sessions.length > 0}
            onNew={handleNew}
          />
        )}
      </div>
      {!needsSetup && <TodoPanel session={active} />}
    </div>
  )
}
