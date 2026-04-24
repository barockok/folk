import { create } from 'zustand'
import type {
  Session,
  AgentChunk,
  AgentToolCall,
  AgentToolResult,
  AgentError
} from '@shared/types'

export type MessageRole = 'user' | 'assistant' | 'system'

export interface ChatMessage {
  id: string
  role: MessageRole
  text: string
  toolCalls: Array<{ callId: string; tool: string; input: unknown; output?: unknown; isError?: boolean }>
  thinking: string
  error?: AgentError
  createdAt: number
}

interface SessionState {
  sessions: Session[]
  activeId: string | null
  messages: Record<string, ChatMessage[]>
  setSessions: (s: Session[]) => void
  upsertSession: (s: Session) => void
  removeSession: (id: string) => void
  setActive: (id: string | null) => void
  pushUserMessage: (sessionId: string, text: string) => string
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
      text: '',
      toolCalls: [],
      thinking: '',
      createdAt: Date.now()
    }
  ]
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  activeId: null,
  messages: {},
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
            text,
            toolCalls: [],
            thinking: '',
            createdAt: Date.now()
          }
        ]
      }
    }))
    return id
  },
  appendChunk: ({ sessionId, text }) =>
    set((st) => {
      const cur = ensureAssistant(st.messages[sessionId] ?? [])
      const next = [...cur]
      next[next.length - 1] = { ...next[next.length - 1], text: next[next.length - 1].text + text }
      return { messages: { ...st.messages, [sessionId]: next } }
    }),
  appendThinking: ({ sessionId, text }) =>
    set((st) => {
      const cur = ensureAssistant(st.messages[sessionId] ?? [])
      const next = [...cur]
      next[next.length - 1] = {
        ...next[next.length - 1],
        thinking: next[next.length - 1].thinking + text
      }
      return { messages: { ...st.messages, [sessionId]: next } }
    }),
  appendToolCall: ({ sessionId, callId, tool, input }) =>
    set((st) => {
      const cur = ensureAssistant(st.messages[sessionId] ?? [])
      const next = [...cur]
      next[next.length - 1] = {
        ...next[next.length - 1],
        toolCalls: [...next[next.length - 1].toolCalls, { callId, tool, input }]
      }
      return { messages: { ...st.messages, [sessionId]: next } }
    }),
  appendToolResult: ({ sessionId, callId, tool, output, isError }) =>
    set((st) => {
      const cur = st.messages[sessionId] ?? []
      const next = cur.map((m) => {
        if (m.role !== 'assistant') return m
        return {
          ...m,
          toolCalls: m.toolCalls.map((t) =>
            t.callId === callId ? { ...t, tool, output, isError } : t
          )
        }
      })
      return { messages: { ...st.messages, [sessionId]: next } }
    }),
  setError: (e) =>
    set((st) => {
      const cur = ensureAssistant(st.messages[e.sessionId] ?? [])
      const next = [...cur]
      next[next.length - 1] = { ...next[next.length - 1], error: e }
      return { messages: { ...st.messages, [e.sessionId]: next } }
    })
}))
