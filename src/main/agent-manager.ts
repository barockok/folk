import { EventEmitter } from 'node:events'
import { createAgent, Agent } from '@anthropic-ai/claude-agent-sdk'
import { Database } from './database'
import type {
  Session,
  SessionConfig,
  AgentChunk,
  AgentToolCall,
  AgentToolResult,
  AgentError,
  Attachment
} from '@shared/types'

export interface AgentManagerEvents {
  chunk: (e: AgentChunk) => void
  thinking: (e: AgentChunk) => void
  toolCall: (e: AgentToolCall) => void
  toolResult: (e: AgentToolResult) => void
  done: (e: { sessionId: string }) => void
  error: (e: AgentError) => void
}

export class AgentManager extends EventEmitter {
  #agents = new Map<string, Agent>()
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
    const a = this.#agents.get(id)
    if (a) {
      await a.cancel().catch(() => undefined)
      await a.dispose().catch(() => undefined)
      this.#agents.delete(id)
    }
    this.db.deleteSession(id)
  }

  async sendMessage(sessionId: string, text: string, attachments?: Attachment[]): Promise<void> {
    const session = this.db.getSession(sessionId)
    if (!session) throw new Error(`session ${sessionId} not found`)
    this.db.updateSession(sessionId, { status: 'running' })
    const agent = this.ensureAgent(session)

    const cleanup = (): void => {
      this.db.updateSession(sessionId, { status: 'idle' })
    }
    const onDone = (): void => {
      cleanup()
      agent.off('done', onDone)
      agent.off('error', onError)
    }
    const onError = (): void => {
      this.db.updateSession(sessionId, { status: 'error' })
      agent.off('done', onDone)
      agent.off('error', onError)
    }
    agent.once('done', onDone)
    agent.once('error', onError)

    await agent.sendMessage(text, attachments)
  }

  dispose(): void {
    for (const a of this.#agents.values()) {
      void a.dispose().catch(() => undefined)
    }
    this.#agents.clear()
  }

  // exposed so Task 13 can augment
  protected ensureAgent(session: Session): Agent {
    const existing = this.#agents.get(session.id)
    if (existing) return existing
    const provider = this.#resolveProvider(session.modelId)
    const agent = createAgent({
      model: session.modelId,
      workingDirectory: session.workingDir,
      apiKey: provider.apiKey,
      baseUrl: provider.baseUrl ?? undefined,
      mcpServers: this.db.listMCPs().filter((m) => m.isEnabled),
      extraFlags: session.flags ?? ''
    })
    this.#wire(session.id, agent)
    this.#agents.set(session.id, agent)
    return agent
  }

  #resolveProvider(modelId: string) {
    const providers = this.db.listProviders()
    const match = providers.find((p) => p.models.some((m) => m.id === modelId))
    if (!match) throw new Error(`no provider configured for model ${modelId}`)
    return match
  }

  #wire(sessionId: string, agent: Agent): void {
    agent.on('chunk', (e: { text: string }) => this.emit('chunk', { sessionId, text: e.text }))
    agent.on('thinking', (e: { text: string }) =>
      this.emit('thinking', { sessionId, text: e.text })
    )
    agent.on('toolCall', (e: { callId: string; tool: string; input: unknown }) =>
      this.emit('toolCall', { sessionId, ...e })
    )
    agent.on('toolResult', (e: { callId: string; tool: string; output: unknown }) =>
      this.emit('toolResult', { sessionId, ...e })
    )
    agent.on('done', () => this.emit('done', { sessionId }))
    agent.on('error', (err: Error) =>
      this.emit('error', {
        sessionId,
        code: 'crash',
        message: err.message,
        retryable: true
      })
    )
  }
}
