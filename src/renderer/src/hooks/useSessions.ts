import { useEffect } from 'react'
import { useSessionStore } from '../stores/useSessionStore'
import type { Attachment, SessionConfig } from '@shared/types'

export function useSessions() {
  const {
    sessions,
    activeId,
    setSessions,
    upsertSession,
    removeSession,
    setActive,
    hydrateMessages
  } = useSessionStore()

  useEffect(() => {
    void (async () => {
      const list = await window.folk.sessions.list()
      setSessions(list)
      // Backfill placeholder titles from transcript first user message.
      // Run in parallel; reflect updates as they finish.
      const stale = list.filter((s) => s.title === 'Untitled session' && s.claudeStarted)
      for (const s of stale) {
        void window.folk.sessions.backfillTitle(s.id).then((updated) => {
          if (updated) upsertSession(updated)
        })
      }
    })()
  }, [setSessions, upsertSession])

  // Rehydrate the transcript from the SDK's on-disk store whenever the active
  // session changes. Idempotent — hydrateMessages skips if state is non-empty.
  useEffect(() => {
    if (!activeId) return
    void hydrateMessages(activeId)
  }, [activeId, hydrateMessages])

  return {
    sessions,
    activeId,
    setActive,
    async create(config: SessionConfig) {
      const s = await window.folk.sessions.create(config)
      upsertSession(s)
      setActive(s.id)
      return s
    },
    async delete(id: string) {
      await window.folk.sessions.delete(id)
      removeSession(id)
    },
    async rename(id: string, title: string) {
      const updated = await window.folk.sessions.rename(id, title)
      upsertSession(updated)
      return updated
    },
    async send(sessionId: string, text: string, attachments?: Attachment[]) {
      const st = useSessionStore.getState()
      st.pushUserMessage(sessionId, text)
      st.pushPendingAssistant(sessionId)
      st.markStreaming(sessionId)
      await window.folk.agent.sendMessage(sessionId, text, attachments)
      // Main may have auto-titled the session on first turn; sync the record
      // so the sidebar updates without requiring a refresh.
      const fresh = await window.folk.sessions.get(sessionId)
      if (fresh) upsertSession(fresh)
    },
    async cancel(sessionId: string) {
      await window.folk.agent.cancel(sessionId)
    }
  }
}
