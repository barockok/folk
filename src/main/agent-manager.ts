import { EventEmitter } from 'node:events'
import { query, AbortError } from '@anthropic-ai/claude-agent-sdk'
import type { McpServerConfig } from '@anthropic-ai/claude-agent-sdk'
import { Database } from './database'
import type {
  Session,
  SessionConfig,
  Attachment,
  AgentChunk,
  AgentToolCall,
  AgentToolResult,
  AgentError
} from '@shared/types'

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

export class AgentManager extends EventEmitter {
  #streams = new Map<string, { abort: AbortController }>()
  constructor(private db: Database) {
    super()
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

    const envOverlay: Record<string, string | undefined> = {
      ANTHROPIC_API_KEY: provider.apiKey
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

    const q = query({
      prompt: text,
      options: {
        cwd: session.workingDir,
        model: session.modelId,
        env: envOverlay,
        mcpServers: mcpMap,
        abortController: abort,
        extraArgs: this.#parseExtraArgs(session.flags)
      }
    })

    try {
      for await (const msg of q) {
        this.#dispatchMessage(sessionId, msg as unknown)
      }
      this.db.updateSession(sessionId, { status: 'idle' })
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
      message?: { content?: Array<Record<string, unknown>> }
      subtype?: string
      is_error?: boolean
      result?: string
    }
    if (m.type === 'assistant' && m.message?.content) {
      for (const block of m.message.content) {
        const b = block as {
          type: string
          text?: string
          thinking?: string
          id?: string
          name?: string
          input?: unknown
        }
        if (b.type === 'text' && b.text != null) {
          this.emit('chunk', { sessionId, text: b.text })
        } else if (b.type === 'thinking' && b.thinking != null) {
          this.emit('thinking', { sessionId, text: b.thinking })
        } else if (b.type === 'tool_use' && b.id && b.name) {
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
      this.emit('done', { sessionId })
    }
    // Ignore system, compact_boundary, stream_event, and all other message types for v0.
  }
}
