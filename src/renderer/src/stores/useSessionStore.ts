import { create } from 'zustand'
import type {
  Session,
  AgentChunk,
  AgentToolCall,
  AgentToolResult,
  AgentError,
  MessageBlock
} from '@shared/types'

export type MessageRole = 'user' | 'assistant' | 'system'

export interface ChatMessage {
  id: string
  role: MessageRole
  blocks: MessageBlock[]
  error?: AgentError
  createdAt: number
}

interface SessionState {
  sessions: Session[]
  activeId: string | null
  messages: Record<string, ChatMessage[]>
  // Sessions with an in-flight SDK turn — used to render a "still working"
  // indicator on the trailing assistant message even after the first deltas
  // have arrived (so the user knows more is coming).
  streamingSessions: Set<string>
  setSessions: (s: Session[]) => void
  upsertSession: (s: Session) => void
  removeSession: (id: string) => void
  setActive: (id: string | null) => void
  pushUserMessage: (sessionId: string, text: string) => string
  pushPendingAssistant: (sessionId: string) => string
  hydrateMessages: (sessionId: string) => Promise<void>
  markStreaming: (sessionId: string) => void
  markIdle: (sessionId: string) => void
  appendChunk: (e: AgentChunk) => void
  appendThinking: (e: AgentChunk) => void
  appendToolCall: (e: AgentToolCall) => void
  appendToolResult: (e: AgentToolResult) => void
  setError: (e: AgentError) => void
}

const ensureAssistant = (messages: ChatMessage[]): ChatMessage[] => {
  const last = messages[messages.length - 1]
  if (last && last.role === 'assistant') return messages
  return [
    ...messages,
    {
      id: crypto.randomUUID(),
      role: 'assistant',
      blocks: [],
      createdAt: Date.now()
    }
  ]
}

// Append text to the trailing assistant message — extending the last block if
// it's the same kind (so streaming deltas merge), otherwise opening a new one.
function pushTextDelta(
  msg: ChatMessage,
  kind: 'text' | 'thinking',
  text: string
): ChatMessage {
  const blocks = [...msg.blocks]
  const last = blocks[blocks.length - 1]
  if (last && last.kind === kind) {
    blocks[blocks.length - 1] = { kind, text: last.text + text }
  } else {
    blocks.push({ kind, text })
  }
  return { ...msg, blocks }
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  activeId: null,
  messages: {},
  streamingSessions: new Set<string>(),
  markStreaming: (sessionId) =>
    set((st) => {
      if (st.streamingSessions.has(sessionId)) return st
      const next = new Set(st.streamingSessions)
      next.add(sessionId)
      return { streamingSessions: next }
    }),
  markIdle: (sessionId) =>
    set((st) => {
      if (!st.streamingSessions.has(sessionId)) return st
      const next = new Set(st.streamingSessions)
      next.delete(sessionId)
      return { streamingSessions: next }
    }),
  setSessions: (sessions) => set({ sessions }),
  upsertSession: (s) =>
    set((st) => {
      const idx = st.sessions.findIndex((x) => x.id === s.id)
      const next = [...st.sessions]
      if (idx >= 0) next[idx] = s
      else next.unshift(s)
      return { sessions: next }
    }),
  removeSession: (id) =>
    set((st) => ({
      sessions: st.sessions.filter((x) => x.id !== id),
      activeId: st.activeId === id ? null : st.activeId
    })),
  setActive: (id) => set({ activeId: id }),
  pushUserMessage: (sessionId, text) => {
    const id = crypto.randomUUID()
    set((st) => ({
      messages: {
        ...st.messages,
        [sessionId]: [
          ...(st.messages[sessionId] ?? []),
          {
            id,
            role: 'user',
            blocks: [{ kind: 'text', text }],
            createdAt: Date.now()
          }
        ]
      }
    }))
    return id
  },
  // Optimistically create an empty assistant message so the UI shows a
  // "Thinking…" placeholder instantly. Subsequent streaming events merge in.
  pushPendingAssistant: (sessionId) => {
    const id = crypto.randomUUID()
    set((st) => ({
      messages: {
        ...st.messages,
        [sessionId]: [
          ...(st.messages[sessionId] ?? []),
          {
            id,
            role: 'assistant',
            blocks: [],
            createdAt: Date.now()
          }
        ]
      }
    }))
    return id
  },
  hydrateMessages: async (sessionId) => {
    if ((get().messages[sessionId] ?? []).length > 0) return
    const persisted = await window.folk.sessions.loadMessages(sessionId)
    if (persisted.length === 0) return
    set((st) => ({
      messages: {
        ...st.messages,
        [sessionId]: persisted.map((m) => ({
          id: m.id,
          role: m.role,
          blocks: m.blocks,
          createdAt: m.createdAt
        }))
      }
    }))
  },
  appendChunk: ({ sessionId, text }) =>
    set((st) => {
      const cur = ensureAssistant(st.messages[sessionId] ?? [])
      const next = [...cur]
      next[next.length - 1] = pushTextDelta(next[next.length - 1], 'text', text)
      return { messages: { ...st.messages, [sessionId]: next } }
    }),
  appendThinking: ({ sessionId, text }) =>
    set((st) => {
      const cur = ensureAssistant(st.messages[sessionId] ?? [])
      const next = [...cur]
      next[next.length - 1] = pushTextDelta(next[next.length - 1], 'thinking', text)
      return { messages: { ...st.messages, [sessionId]: next } }
    }),
  appendToolCall: ({ sessionId, callId, tool, input }) =>
    set((st) => {
      const cur = ensureAssistant(st.messages[sessionId] ?? [])
      const next = [...cur]
      const msg = next[next.length - 1]
      next[next.length - 1] = {
        ...msg,
        blocks: [...msg.blocks, { kind: 'tool', call: { callId, tool, input } }]
      }
      return { messages: { ...st.messages, [sessionId]: next } }
    }),
  appendToolResult: ({ sessionId, callId, tool, output, isError }) =>
    set((st) => {
      const cur = st.messages[sessionId] ?? []
      const next = cur.map((m) => {
        if (m.role !== 'assistant') return m
        let touched = false
        const blocks = m.blocks.map((b) => {
          if (b.kind !== 'tool' || b.call.callId !== callId) return b
          touched = true
          return {
            ...b,
            call: {
              ...b.call,
              // Preserve the tool name captured at toolCall time — tool_result
              // blocks don't carry the name, so the dispatch passes 'unknown'.
              tool:
                b.call.tool && b.call.tool !== 'unknown'
                  ? b.call.tool
                  : tool,
              output,
              isError
            }
          }
        })
        return touched ? { ...m, blocks } : m
      })
      return { messages: { ...st.messages, [sessionId]: next } }
    }),
  setError: (e) =>
    set((st) => {
      const cur = ensureAssistant(st.messages[e.sessionId] ?? [])
      const next = [...cur]
      next[next.length - 1] = { ...next[next.length - 1], error: e }
      // An errored turn is no longer streaming.
      const streaming = new Set(st.streamingSessions)
      streaming.delete(e.sessionId)
      return { messages: { ...st.messages, [e.sessionId]: next }, streamingSessions: streaming }
    })
}))
