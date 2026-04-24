import { useEffect } from 'react'
import { useSessionStore } from '../stores/useSessionStore'
import type { SessionConfig } from '@shared/types'

export function useSessions() {
  const { sessions, activeId, setSessions, upsertSession, removeSession, setActive } =
    useSessionStore()

  useEffect(() => {
    void window.folk.sessions.list().then(setSessions)
  }, [setSessions])

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
    async send(sessionId: string, text: string) {
      useSessionStore.getState().pushUserMessage(sessionId, text)
      await window.folk.agent.sendMessage(sessionId, text)
    },
    async cancel(sessionId: string) {
      await window.folk.agent.cancel(sessionId)
    }
  }
}
