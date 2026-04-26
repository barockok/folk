import { create } from 'zustand'
import type {
  Session,
  AgentChunk,
  AgentToolCall,
  AgentToolResult,
  AgentError,
  AgentNotice,
  AgentUsage,
  AgentToolProgress,
  AgentPromptSuggestion,
  MessageBlock,
  PermissionRequest
} from '@shared/types'

export type MessageRole = 'user' | 'assistant' | 'system'

export interface ChatMessage {
  id: string
  role: MessageRole
  blocks: MessageBlock[]
  error?: AgentError
  notice?: AgentNotice['kind']
  createdAt: number
}

export interface SessionStats {
  // Cumulative across all turns we've observed in this app session — the SDK
  // reports per-turn numbers in `result`, we sum them.
  costUsd: number
  durationMs: number
  numTurns: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreateTokens: number
  // Latest turn snapshot (handy for /status).
  lastCostUsd: number
  lastDurationMs: number
  lastInputTokens: number
  lastOutputTokens: number
}

interface SessionState {
  sessions: Session[]
  activeId: string | null
  messages: Record<string, ChatMessage[]>
  stats: Record<string, SessionStats>
  // Pending permission requests keyed by sessionId. Each entry includes the
  // toolUseID so the UI can attach an approval card to the matching tool block.
  pendingPermissions: Record<string, PermissionRequest[]>
  // Suggested next prompts emitted by the SDK, per session. Cleared when the
  // user sends a turn or accepts a suggestion.
  promptSuggestions: Record<string, string[]>
  // Sessions with an in-flight SDK turn — used to render a "still working"
  // indicator on the trailing assistant message even after the first deltas
  // have arrived (so the user knows more is coming).
  streamingSessions: Set<string>
  // Latest lifecycle ticker per session (hook started, status: requesting,
  // session ready, …). Updated as lifecycle notices arrive during a turn,
  // cleared when the turn ends. Surfaced as a faint inline string under the
  // live thinking dots — gives users a peek at *what* the agent is doing
  // without taking a full divider row each time.
  lifecycleTicker: Record<string, string>
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
  appendNotice: (e: AgentNotice) => void
  appendUsage: (e: AgentUsage) => void
  applyToolProgress: (e: AgentToolProgress) => void
  addPromptSuggestion: (e: AgentPromptSuggestion) => void
  clearPromptSuggestions: (sessionId: string) => void
  addPermissionRequest: (e: PermissionRequest) => void
  removePermissionRequest: (sessionId: string, requestId: string) => void
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

// Recursively walk a tool call tree looking for `parentId`; when found,
// return a new tree with `child` appended. Returns the original ref when no
// match is found so callers can detect "nothing changed" with `===`.
import type { PersistedToolCall } from '@shared/types'
function nestChild(
  call: PersistedToolCall,
  parentId: string,
  child: PersistedToolCall
): PersistedToolCall {
  if (call.callId === parentId) {
    return { ...call, children: [...(call.children ?? []), child] }
  }
  if (!call.children) return call
  let touched = false
  const nextChildren = call.children.map((c) => {
    const upd = nestChild(c, parentId, child)
    if (upd !== c) touched = true
    return upd
  })
  return touched ? { ...call, children: nextChildren } : call
}

// Recursively patch a tool call tree to fill in output/isError on the call
// matching `callId`. Used by tool_result events that may target nested
// children of a Task tool dispatch.
function patchResult(
  call: PersistedToolCall,
  callId: string,
  tool: string,
  output: unknown,
  isError: boolean | undefined
): PersistedToolCall {
  if (call.callId === callId) {
    return {
      ...call,
      tool: call.tool && call.tool !== 'unknown' ? call.tool : tool,
      output,
      isError
    }
  }
  if (!call.children) return call
  let touched = false
  const nextChildren = call.children.map((c) => {
    const upd = patchResult(c, callId, tool, output, isError)
    if (upd !== c) touched = true
    return upd
  })
  return touched ? { ...call, children: nextChildren } : call
}

function patchProgress(
  call: PersistedToolCall,
  callId: string,
  elapsedSeconds: number
): PersistedToolCall {
  if (call.callId === callId && call.output === undefined) {
    return { ...call, elapsedSeconds }
  }
  if (!call.children) return call
  let touched = false
  const nextChildren = call.children.map((c) => {
    const upd = patchProgress(c, callId, elapsedSeconds)
    if (upd !== c) touched = true
    return upd
  })
  return touched ? { ...call, children: nextChildren } : call
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
  stats: {},
  pendingPermissions: {},
  promptSuggestions: {},
  streamingSessions: new Set<string>(),
  lifecycleTicker: {},
  markStreaming: (sessionId) =>
    set((st) => {
      if (st.streamingSessions.has(sessionId)) return st
      const next = new Set(st.streamingSessions)
      next.add(sessionId)
      return { streamingSessions: next }
    }),
  markIdle: (sessionId) =>
    set((st) => {
      const ticker = { ...st.lifecycleTicker }
      delete ticker[sessionId]
      if (!st.streamingSessions.has(sessionId)) {
        return { lifecycleTicker: ticker }
      }
      const next = new Set(st.streamingSessions)
      next.delete(sessionId)
      return { streamingSessions: next, lifecycleTicker: ticker }
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
  appendToolCall: ({ sessionId, callId, tool, input, parentCallId }) =>
    set((st) => {
      const cur = ensureAssistant(st.messages[sessionId] ?? [])
      const newCall = { callId, tool, input }
      // Nested under a parent Task tool: walk all messages, find the parent
      // call (it may live on an earlier assistant message), append as child.
      if (parentCallId) {
        const next = cur.map((m) => {
          if (m.role !== 'assistant') return m
          let touched = false
          const blocks = m.blocks.map((b) => {
            if (b.kind !== 'tool') return b
            const updated = nestChild(b.call, parentCallId, newCall)
            if (updated !== b.call) {
              touched = true
              return { ...b, call: updated }
            }
            return b
          })
          return touched ? { ...m, blocks } : m
        })
        return { messages: { ...st.messages, [sessionId]: next } }
      }
      const next = [...cur]
      const msg = next[next.length - 1]
      next[next.length - 1] = {
        ...msg,
        blocks: [...msg.blocks, { kind: 'tool', call: newCall }]
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
          if (b.kind !== 'tool') return b
          const updated = patchResult(b.call, callId, tool, output, isError)
          if (updated !== b.call) {
            touched = true
            return { ...b, call: updated }
          }
          return b
        })
        return touched ? { ...m, blocks } : m
      })
      return { messages: { ...st.messages, [sessionId]: next } }
    }),
  appendNotice: ({ sessionId, kind, text }) =>
    set((st) => {
      const cur = st.messages[sessionId] ?? []
      const notice: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'system',
        blocks: text ? [{ kind: 'text', text }] : [],
        notice: kind,
        createdAt: Date.now()
      }
      // Coalesce successive api_retry / rate_limit notices: replace the most
      // recent same-kind system notice instead of stacking, so the timeline
      // shows a single "API RETRY 6/10..." row that updates in place.
      let nextMessages: ChatMessage[]
      const coalesce = kind === 'api_retry' || kind === 'rate_limit'
      const last = cur[cur.length - 1]
      if (coalesce && last && last.role === 'system' && last.notice === kind) {
        nextMessages = [...cur.slice(0, -1), { ...notice, id: last.id }]
      } else {
        nextMessages = [...cur, notice]
      }
      const patch: Partial<SessionState> = {
        messages: { ...st.messages, [sessionId]: nextMessages }
      }
      // While a turn is streaming, mirror the latest lifecycle text into the
      // ticker so the live thinking row can show "what's happening" without
      // requiring the user to expand the lifecycle group.
      if (kind === 'lifecycle' && text && st.streamingSessions.has(sessionId)) {
        patch.lifecycleTicker = { ...st.lifecycleTicker, [sessionId]: text }
      }
      return patch as SessionState
    }),
  appendUsage: (u) =>
    set((st) => {
      const prev = st.stats[u.sessionId] ?? {
        costUsd: 0,
        durationMs: 0,
        numTurns: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreateTokens: 0,
        lastCostUsd: 0,
        lastDurationMs: 0,
        lastInputTokens: 0,
        lastOutputTokens: 0
      }
      const next: SessionStats = {
        costUsd: prev.costUsd + u.totalCostUsd,
        durationMs: prev.durationMs + u.durationMs,
        numTurns: prev.numTurns + u.numTurns,
        inputTokens: prev.inputTokens + u.inputTokens,
        outputTokens: prev.outputTokens + u.outputTokens,
        cacheReadTokens: prev.cacheReadTokens + u.cacheReadTokens,
        cacheCreateTokens: prev.cacheCreateTokens + u.cacheCreateTokens,
        lastCostUsd: u.totalCostUsd,
        lastDurationMs: u.durationMs,
        lastInputTokens: u.inputTokens,
        lastOutputTokens: u.outputTokens
      }
      return { stats: { ...st.stats, [u.sessionId]: next } }
    }),
  applyToolProgress: ({ sessionId, callId, elapsedSeconds }) =>
    set((st) => {
      const cur = st.messages[sessionId]
      if (!cur) return st
      const next = cur.map((m) => {
        if (m.role !== 'assistant') return m
        let touched = false
        const blocks = m.blocks.map((b) => {
          if (b.kind !== 'tool') return b
          const updated = patchProgress(b.call, callId, elapsedSeconds)
          if (updated !== b.call) {
            touched = true
            return { ...b, call: updated }
          }
          return b
        })
        return touched ? { ...m, blocks } : m
      })
      return { messages: { ...st.messages, [sessionId]: next } }
    }),
  addPromptSuggestion: ({ sessionId, suggestion }) =>
    set((st) => {
      const cur = st.promptSuggestions[sessionId] ?? []
      if (cur.includes(suggestion)) return st
      return {
        promptSuggestions: {
          ...st.promptSuggestions,
          [sessionId]: [...cur, suggestion]
        }
      }
    }),
  clearPromptSuggestions: (sessionId) =>
    set((st) => ({
      promptSuggestions: { ...st.promptSuggestions, [sessionId]: [] }
    })),
  addPermissionRequest: (req) =>
    set((st) => {
      const cur = st.pendingPermissions[req.sessionId] ?? []
      return {
        pendingPermissions: {
          ...st.pendingPermissions,
          [req.sessionId]: [...cur, req]
        }
      }
    }),
  removePermissionRequest: (sessionId, requestId) =>
    set((st) => {
      const cur = st.pendingPermissions[sessionId] ?? []
      const next = cur.filter((r) => r.requestId !== requestId)
      return {
        pendingPermissions: {
          ...st.pendingPermissions,
          [sessionId]: next
        }
      }
    }),
  setError: (e) =>
    set((st) => {
      const cur = ensureAssistant(st.messages[e.sessionId] ?? [])
      const next = [...cur]
      next[next.length - 1] = { ...next[next.length - 1], error: e }
      // An errored turn is no longer streaming.
      const streaming = new Set(st.streamingSessions)
      streaming.delete(e.sessionId)
      const ticker = { ...st.lifecycleTicker }
      delete ticker[e.sessionId]
      return {
        messages: { ...st.messages, [e.sessionId]: next },
        streamingSessions: streaming,
        lifecycleTicker: ticker
      }
    })
}))
