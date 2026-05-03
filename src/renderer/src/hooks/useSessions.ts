import { useEffect } from 'react'
import { useSessionStore } from '../stores/useSessionStore'
import { useUIStore } from '../stores/useUIStore'
import { INITIAL_SKILLS } from '../data'
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
    async send(
      sessionId: string,
      text: string,
      attachments?: Attachment[],
      opts?: { silent?: boolean }
    ) {
      const st = useSessionStore.getState()
      // Mirror the user message the model will see: append image thumbnails
      // (data URI) and a list of non-image attachment names so the timeline
      // bubble shows them immediately. Once the SDK persists the turn, the
      // jsonl-backed copy uses the on-disk folk-file:// path instead — both
      // render identically through the markdown image component.
      const optimisticText =
        attachments && attachments.length > 0
          ? `${text}\n\n${attachments
              .map((a) =>
                a.kind === 'image'
                  ? `![${a.name}](data:${a.mimeType};base64,${a.dataBase64})`
                  : `- ${a.name}`
              )
              .join('\n')}`.trim()
          : text
      if (!opts?.silent) st.pushUserMessage(sessionId, optimisticText)
      st.pushPendingAssistant(sessionId)
      st.markStreaming(sessionId)
      const { folkSkillsEnabled } = useUIStore.getState()
      const skillPrompts = INITIAL_SKILLS
        .filter((s) => s.prompt && folkSkillsEnabled[s.id])
        .map((s) => s.prompt!)
      await window.folk.agent.sendMessage(sessionId, text, attachments, skillPrompts)
      // Main may have auto-titled the session on first turn; sync the record
      // so the sidebar updates without requiring a refresh.
      const fresh = await window.folk.sessions.get(sessionId)
      if (fresh) upsertSession(fresh)
    },
    async clear(sessionId: string) {
      // Optimistic local wipe — drop messages immediately so the UI feels
      // instantaneous. Main re-emits the cleared session via upsertSession
      // once it's flipped claudeStarted/status on disk.
      const st = useSessionStore.getState()
      st.markIdle(sessionId)
      st.clearMessages(sessionId)
      const fresh = await window.folk.sessions.clear(sessionId)
      upsertSession(fresh)
    },
    async cancel(sessionId: string) {
      // Optimistic local flip — main also flips DB + emits a synthetic
      // 'cancelled' error, but the renderer's session.status feeds the
      // composer's Stop button directly. Patch immediately so the UI is
      // responsive even if the SDK is mid-tool and slow to unwind.
      const st = useSessionStore.getState()
      const cur = st.sessions.find((s) => s.id === sessionId)
      if (cur && cur.status === 'running') {
        st.upsertSession({ ...cur, status: 'cancelled' })
      }
      st.markIdle(sessionId)
      await window.folk.agent.cancel(sessionId)
    }
  }
}
