import { EventEmitter } from 'node:events'
import { query, AbortError, getSessionMessages } from '@anthropic-ai/claude-agent-sdk'
import type { McpServerConfig, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import { randomUUID } from 'node:crypto'
import { Database } from './database'
import { FOLK_PRESENTATION_PROMPT } from './system-prompt'
import type {
  Session,
  SessionConfig,
  Attachment,
  AgentChunk,
  AgentToolCall,
  AgentToolResult,
  AgentError,
  PersistedMessage,
  PersistedToolCall,
  MessageBlock
} from '@shared/types'

// Walk the SDK's flat SessionMessage[] list and fold it into folk's chat
// shape: one PersistedMessage per turn, with `blocks` carrying text /
// thinking / tool entries in the same order they appear in the transcript.
// tool_result blocks (which arrive in subsequent user envelopes) are matched
// back to the originating tool block by callId.
function mapSessionMessages(
  raw: Array<{ type: 'user' | 'assistant' | 'system'; uuid: string; message: unknown }>
): PersistedMessage[] {
  const out: PersistedMessage[] = []
  // callId → reference to the tool block that the SDK tool_result should patch
  const callIndex = new Map<string, PersistedToolCall>()

  for (const entry of raw) {
    const m = entry.message as
      | { content?: Array<Record<string, unknown>> | string; id?: string }
      | undefined
    const content = m?.content
    const ts = Date.now()

    if (entry.type === 'assistant') {
      const blocks: MessageBlock[] = []
      if (Array.isArray(content)) {
        for (const blk of content) {
          const b = blk as {
            type: string
            text?: string
            thinking?: string
            id?: string
            name?: string
            input?: unknown
          }
          if (b.type === 'text' && b.text) {
            blocks.push({ kind: 'text', text: b.text })
          } else if (b.type === 'thinking' && b.thinking) {
            blocks.push({ kind: 'thinking', text: b.thinking })
          } else if (b.type === 'tool_use' && b.id && b.name) {
            const call: PersistedToolCall = { callId: b.id, tool: b.name, input: b.input }
            blocks.push({ kind: 'tool', call })
            callIndex.set(b.id, call)
          }
        }
      }
      out.push({
        id: (m?.id as string) ?? entry.uuid ?? randomUUID(),
        role: 'assistant',
        blocks,
        createdAt: ts
      })
    } else if (entry.type === 'user') {
      // tool_result blocks belong to the prior assistant turn — patch them in.
      let userText = ''
      if (typeof content === 'string') userText = content
      else if (Array.isArray(content)) {
        for (const blk of content) {
          const b = blk as {
            type: string
            text?: string
            tool_use_id?: string
            content?: unknown
            is_error?: boolean
          }
          if (b.type === 'text' && b.text) userText += b.text
          else if (b.type === 'tool_result' && b.tool_use_id) {
            const ref = callIndex.get(b.tool_use_id)
            if (ref) {
              ref.output = b.content
              ref.isError = !!b.is_error
            }
          }
        }
      }
      // Skip user entries that are pure tool_result envelopes — SDK plumbing.
      if (userText.trim()) {
        out.push({
          id: entry.uuid ?? randomUUID(),
          role: 'user',
          blocks: [{ kind: 'text', text: userText }],
          createdAt: ts
        })
      }
    }
  }

  return out
}

function mapError(sessionId: string, err: Error & { code?: string }): AgentError {
  if (err instanceof AbortError || err.name === 'AbortError') {
    return { sessionId, code: 'cancelled', message: err.message, retryable: false }
  }
  if (/model.*not.*found|invalid.*model/i.test(err.message)) {
    return { sessionId, code: 'invalid-model', message: err.message, retryable: false }
  }
  const code = err.code
  if (code === '401') return { sessionId, code: 'auth', message: err.message, retryable: false }
  if (code === '429') return { sessionId, code: 'quota', message: err.message, retryable: true }
  if (code === 'ECONNREFUSED' || code === 'ENETUNREACH') {
    return { sessionId, code: 'offline', message: err.message, retryable: true }
  }
  return { sessionId, code: 'crash', message: err.message, retryable: true }
}

export interface AgentManagerEvents {
  chunk: (e: AgentChunk) => void
  thinking: (e: AgentChunk) => void
  toolCall: (e: AgentToolCall) => void
  toolResult: (e: AgentToolResult) => void
  done: (e: { sessionId: string }) => void
  error: (e: AgentError) => void
}

const IDLE_MS = 5 * 60_000
const MAX_LIVE = 4
const TEARDOWN_GRACE_MS = 2_000

interface LiveSession {
  push: (msg: SDKUserMessage) => void
  close: () => void
  abort: AbortController
  pump: Promise<void>
  idleTimer: NodeJS.Timeout | null
  turnDone: (() => void) | null
  turnError: ((e: Error) => void) | null
  streamedMessages: Set<string>
  lastUsedAt: number
}

export class AgentManager extends EventEmitter {
  #live = new Map<string, LiveSession>()
  constructor(private db: Database) {
    super()
  }

  #createPromptIterable(): {
    iterable: AsyncIterable<SDKUserMessage>
    push: (msg: SDKUserMessage) => void
    close: () => void
  } {
    const queue: SDKUserMessage[] = []
    let resolveNext: (() => void) | null = null
    let closed = false
    async function* iterable(): AsyncIterable<SDKUserMessage> {
      while (!closed) {
        if (queue.length === 0) {
          await new Promise<void>((r) => (resolveNext = r))
        }
        while (queue.length) yield queue.shift()!
      }
    }
    const push = (m: SDKUserMessage) => {
      queue.push(m)
      const r = resolveNext
      resolveNext = null
      r?.()
    }
    const close = () => {
      closed = true
      const r = resolveNext
      resolveNext = null
      r?.()
    }
    return { iterable: iterable(), push, close }
  }

  #ensureLive(session: Session): LiveSession {
    const existing = this.#live.get(session.id)
    if (existing) {
      existing.lastUsedAt = Date.now()
      return existing
    }

    const provider = this.#resolveProvider(session.modelId)

    const envOverlay: Record<string, string | undefined> = { ...process.env }
    if (provider.authMode !== 'claude-code') {
      envOverlay.ANTHROPIC_API_KEY = provider.apiKey
    } else {
      delete envOverlay.ANTHROPIC_API_KEY
    }
    if (provider.baseUrl) envOverlay.ANTHROPIC_BASE_URL = provider.baseUrl

    const mcpMap: Record<string, McpServerConfig> = {}
    for (const m of this.db.listMCPs().filter((x) => x.isEnabled)) {
      if (m.transport === 'stdio' && m.command) {
        mcpMap[m.name] = {
          type: 'stdio',
          command: m.command,
          args: m.args ?? [],
          env: m.env ?? undefined
        }
      }
    }

    const continuity = session.claudeStarted
      ? { resume: session.id }
      : { sessionId: session.id }

    const abort = new AbortController()
    const { iterable, push, close } = this.#createPromptIterable()

    const q = query({
      prompt: iterable,
      options: {
        cwd: session.workingDir,
        model: session.modelId,
        env: envOverlay,
        mcpServers: mcpMap,
        abortController: abort,
        includePartialMessages: true,
        systemPrompt: {
          type: 'preset',
          preset: 'claude_code',
          append: FOLK_PRESENTATION_PROMPT
        },
        extraArgs: this.#parseExtraArgs(session.flags),
        ...continuity
      }
    })

    const live: LiveSession = {
      push,
      close,
      abort,
      pump: Promise.resolve(),
      idleTimer: null,
      turnDone: null,
      turnError: null,
      streamedMessages: new Set(),
      lastUsedAt: Date.now()
    }

    live.pump = (async () => {
      try {
        for await (const msg of q) {
          this.#dispatchMessage(session.id, msg as unknown)
        }
      } catch (err) {
        const agentErr = mapError(session.id, err as Error & { code?: string })
        live.turnError?.(err as Error)
        this.emit('error', agentErr)
        this.db.updateSession(session.id, {
          status: agentErr.code === 'cancelled' ? 'cancelled' : 'error'
        })
      } finally {
        if (live.idleTimer) clearTimeout(live.idleTimer)
        this.#live.delete(session.id)
      }
    })()

    this.#live.set(session.id, live)
    return live
  }

  #armIdleTimer(sessionId: string): void {
    const live = this.#live.get(sessionId)
    if (!live) return
    if (live.idleTimer) clearTimeout(live.idleTimer)
    live.idleTimer = setTimeout(() => {
      void this.#teardown(sessionId, 'idle')
    }, IDLE_MS)
  }

  async #teardown(
    sessionId: string,
    reason: 'idle' | 'cancel' | 'delete' | 'dispose' | 'lru'
  ): Promise<void> {
    const live = this.#live.get(sessionId)
    if (!live) return
    // Delete from the map BEFORE awaiting — a concurrent sendMessage that
    // arrives during teardown must not see the dying LiveSession; it should
    // lazy-start a fresh one.
    this.#live.delete(sessionId)
    if (live.idleTimer) {
      clearTimeout(live.idleTimer)
      live.idleTimer = null
    }

    if (reason === 'cancel' || reason === 'delete') {
      live.abort.abort()
    } else {
      live.close()
      const grace = new Promise<'timeout'>((r) =>
        setTimeout(() => r('timeout'), TEARDOWN_GRACE_MS)
      )
      const winner = await Promise.race([
        live.pump.then(() => 'done' as const),
        grace
      ])
      if (winner === 'timeout') live.abort.abort()
    }
    await live.pump.catch(() => {})
  }

  async createSession(config: SessionConfig): Promise<Session> {
    return this.db.createSession(config)
  }

  getSession(id: string): Session | null {
    return this.db.getSession(id)
  }

  listSessions(): Session[] {
    return this.db.listSessions()
  }

  // Load the persisted transcript from the SDK's on-disk session store
  // (~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl). Returns [] for
  // sessions that have never been started — those have no transcript yet.
  async loadMessages(sessionId: string): Promise<PersistedMessage[]> {
    const session = this.db.getSession(sessionId)
    if (!session || !session.claudeStarted) return []
    let raw: Awaited<ReturnType<typeof getSessionMessages>>
    try {
      raw = await getSessionMessages(sessionId, { dir: session.workingDir })
    } catch {
      return []
    }
    return mapSessionMessages(raw)
  }

  async deleteSession(id: string): Promise<void> {
    const stream = this.#streams.get(id)
    if (stream) {
      stream.abort.abort()
      this.#streams.delete(id)
    }
    this.db.deleteSession(id)
  }

  dispose(): void {
    for (const { abort } of this.#streams.values()) abort.abort()
    this.#streams.clear()
  }

  async cancel(sessionId: string): Promise<void> {
    const stream = this.#streams.get(sessionId)
    if (stream) {
      stream.abort.abort()
      this.#streams.delete(sessionId)
    }
    this.db.updateSession(sessionId, { status: 'cancelled' })
  }

  async sendMessage(
    sessionId: string,
    text: string,
    _attachments?: Attachment[]
  ): Promise<void> {
    const session = this.db.getSession(sessionId)
    if (!session) throw new Error(`session ${sessionId} not found`)
    const provider = this.#resolveProvider(session.modelId)

    this.db.updateSession(sessionId, { status: 'running' })

    const abort = new AbortController()
    this.#streams.set(sessionId, { abort })

    // Start from the main process env so PATH, HOME, and Keychain access work.
    // The SDK spawns `node cli.js` — without PATH the spawn fails with ENOENT
    // and the SDK reports it as "Claude Code executable not found at cli.js".
    const envOverlay: Record<string, string | undefined> = { ...process.env }
    // When authMode is 'claude-code', let the SDK resolve auth from
    // ~/.claude/.credentials.json (Linux) or macOS Keychain (service
    // "Claude Code-credentials"). Setting ANTHROPIC_API_KEY would override it.
    if (provider.authMode !== 'claude-code') {
      envOverlay.ANTHROPIC_API_KEY = provider.apiKey
    } else {
      delete envOverlay.ANTHROPIC_API_KEY
    }
    if (provider.baseUrl) envOverlay.ANTHROPIC_BASE_URL = provider.baseUrl

    const mcpMap: Record<string, McpServerConfig> = {}
    for (const m of this.db.listMCPs().filter((x) => x.isEnabled)) {
      if (m.transport === 'stdio' && m.command) {
        mcpMap[m.name] = {
          type: 'stdio',
          command: m.command,
          args: m.args ?? [],
          env: m.env ?? undefined
        }
      }
    }

    // First turn → use our Session.id as the SDK sessionId so it persists at
    // ~/.claude/projects/<cwd>/<id>.jsonl. Subsequent turns → resume that
    // session so the model keeps full conversation memory across turns.
    const continuity = session.claudeStarted
      ? { resume: session.id }
      : { sessionId: session.id }

    const q = query({
      prompt: text,
      options: {
        cwd: session.workingDir,
        model: session.modelId,
        env: envOverlay,
        mcpServers: mcpMap,
        abortController: abort,
        includePartialMessages: true,
        // Keep the Claude Code default behavior, append folk's presentation rules
        // so the model formats output for folk's rich markdown renderer.
        systemPrompt: {
          type: 'preset',
          preset: 'claude_code',
          append: FOLK_PRESENTATION_PROMPT
        },
        extraArgs: this.#parseExtraArgs(session.flags),
        ...continuity
      }
    })

    try {
      for await (const msg of q) {
        this.#dispatchMessage(sessionId, msg as unknown)
      }
      this.db.updateSession(sessionId, { status: 'idle', claudeStarted: true })
    } catch (err) {
      const agentErr = mapError(sessionId, err as Error & { code?: string })
      this.emit('error', agentErr)
      this.db.updateSession(sessionId, {
        status: agentErr.code === 'cancelled' ? 'cancelled' : 'error'
      })
    } finally {
      this.#streams.delete(sessionId)
    }
  }

  #resolveProvider(modelId: string) {
    const providers = this.db.listProviders()
    const match = providers.find((p) => p.models.some((m) => m.id === modelId))
    if (!match) throw new Error(`no provider configured for model ${modelId}`)
    return match
  }

  #parseExtraArgs(flags: string | null): Record<string, string | null> | undefined {
    if (!flags) return undefined
    const out: Record<string, string | null> = {}
    for (const part of flags.split(/\s+/)) {
      if (!part) continue
      const m = part.match(/^--([^=]+)(?:=(.*))?$/)
      if (!m) continue
      out[m[1]!] = m[2] ?? null
    }
    return out
  }


  #dispatchMessage(sessionId: string, msg: unknown): void {
    const m = msg as {
      type: string
      message?: { id?: string; content?: Array<Record<string, unknown>> }
      event?: Record<string, unknown>
      subtype?: string
      is_error?: boolean
      result?: string
    }

    // Incremental deltas when includePartialMessages is on.
    if (m.type === 'stream_event' && m.event) {
      const ev = m.event as {
        type: string
        message?: { id?: string }
        delta?: { type?: string; text?: string; thinking?: string }
      }
      if (ev.type === 'message_start' && ev.message?.id) {
        this.#streamedMessages.add(ev.message.id)
      } else if (ev.type === 'content_block_delta' && ev.delta) {
        if (ev.delta.type === 'text_delta' && ev.delta.text) {
          this.emit('chunk', { sessionId, text: ev.delta.text })
        } else if (ev.delta.type === 'thinking_delta' && ev.delta.thinking) {
          this.emit('thinking', { sessionId, text: ev.delta.thinking })
        }
      }
      return
    }

    if (m.type === 'assistant' && m.message?.content) {
      // If we already streamed this message via stream_event, don't replay.
      const wasStreamed = m.message.id && this.#streamedMessages.has(m.message.id)
      for (const block of m.message.content) {
        const b = block as {
          type: string
          text?: string
          thinking?: string
          id?: string
          name?: string
          input?: unknown
        }
        if (!wasStreamed && b.type === 'text' && b.text != null) {
          this.emit('chunk', { sessionId, text: b.text })
        } else if (!wasStreamed && b.type === 'thinking' && b.thinking != null) {
          this.emit('thinking', { sessionId, text: b.thinking })
        } else if (b.type === 'tool_use' && b.id && b.name) {
          // Tool-use blocks aren't emitted as deltas, so always dispatch.
          this.emit('toolCall', {
            sessionId,
            callId: b.id,
            tool: b.name,
            input: b.input
          })
        }
      }
    } else if (m.type === 'user' && m.message?.content) {
      for (const block of m.message.content) {
        const b = block as {
          type: string
          tool_use_id?: string
          content?: unknown
          is_error?: boolean
        }
        if (b.type === 'tool_result' && b.tool_use_id) {
          this.emit('toolResult', {
            sessionId,
            callId: b.tool_use_id,
            tool: 'unknown',
            output: b.content,
            isError: !!b.is_error
          })
        }
      }
    } else if (m.type === 'result') {
      if (m.subtype === 'error' || m.is_error) {
        this.emit('error', mapError(sessionId, new Error(m.result ?? 'agent error')))
      }
      this.#streamedMessages.clear()
      this.emit('done', { sessionId })
    }
    // Ignore system, compact_boundary, stream_event, and all other message types for v0.
  }
}
