import { useEffect } from 'react'
import { useSessionStore } from '../stores/useSessionStore'
import type { Attachment, SessionConfig } from '@shared/types'

export function useSessions() {
  const { sessions, activeId, setSessions, upsertSession, removeSession, setActive, hydrateMessages } =
    useSessionStore()

  useEffect(() => {
    void window.folk.sessions.list().then(setSessions)
  }, [setSessions])

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
    async send(sessionId: string, text: string, attachments?: Attachment[]) {
      const st = useSessionStore.getState()
      st.pushUserMessage(sessionId, text)
      st.pushPendingAssistant(sessionId)
      st.markStreaming(sessionId)
      await window.folk.agent.sendMessage(sessionId, text, attachments)
    },
    async cancel(sessionId: string) {
      await window.folk.agent.cancel(sessionId)
    }
  }
}
