import { EventEmitter } from 'node:events'
import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { query, AbortError, getSessionMessages } from '@anthropic-ai/claude-agent-sdk'
import type {
  ElicitationRequest as SDKElicitationRequest,
  ElicitationResult,
  McpServerConfig,
  PermissionResult,
  PermissionUpdate,
  SDKUserMessage
} from '@anthropic-ai/claude-agent-sdk'
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
  AgentNotice,
  AgentUsage,
  AgentToolProgress,
  AgentPromptSuggestion,
  PermissionRequest,
  PermissionResponse,
  MCPElicitationRequest,
  MCPElicitationResponse,
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
  raw: Array<{
    type: 'user' | 'assistant' | 'system'
    uuid: string
    message: unknown
    parentUuid?: string | null
    parent_tool_use_id?: string | null
  }>
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
    const parentToolUseId =
      (entry as { parent_tool_use_id?: string | null }).parent_tool_use_id ?? null

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
            // Nest under parent Task tool if the envelope says so.
            if (parentToolUseId) {
              const parent = callIndex.get(parentToolUseId)
              if (parent) {
                parent.children = [...(parent.children ?? []), call]
                callIndex.set(b.id, call)
                continue
              }
            }
            blocks.push({ kind: 'tool', call })
            callIndex.set(b.id, call)
          }
        }
      }
      // Skip empty assistant entries created by subagent dispatch (all blocks
      // were nested into the parent's children list).
      if (parentToolUseId && blocks.length === 0) continue
      // Coalesce consecutive assistant entries (the SDK splits one logical
      // turn into many raw assistant messages — text, thinking, tool_use can
      // arrive in separate envelopes). Live streaming already merges into one
      // pending-assistant; mirror that here so the timeline rail isn't broken
      // into N disconnected segments per turn.
      const prev = out[out.length - 1]
      if (prev && prev.role === 'assistant') {
        prev.blocks.push(...blocks)
        continue
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

function deriveTitle(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (!flat) return ''
  const trimmed = flat.length > 60 ? flat.slice(0, 57).trimEnd() + '…' : flat
  return trimmed
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
  notice: (e: AgentNotice) => void
  usage: (e: AgentUsage) => void
  toolProgress: (e: AgentToolProgress) => void
  promptSuggestion: (e: AgentPromptSuggestion) => void
  permissionRequest: (e: PermissionRequest) => void
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

interface PendingPermission {
  resolve: (r: PermissionResult) => void
  suggestions: PermissionUpdate[] | undefined
  input: Record<string, unknown>
}

// AskUserQuestion holds canUseTool open until the user picks an option,
// otherwise the SDK proceeds with an empty tool result and the model never
// sees the answer. respondToolUse resolves the awaited promise.
interface PendingAsk {
  sessionId: string
  toolUseId: string
  resolve: (answer: string) => void
  input: Record<string, unknown>
}

interface PendingElicitation {
  sessionId: string
  resolve: (result: ElicitationResult) => void
}

export class AgentManager extends EventEmitter {
  #live = new Map<string, LiveSession>()
  #pendingPermissions = new Map<string, PendingPermission>()
  #pendingAsks = new Map<string, PendingAsk>()
  #pendingElicitations = new Map<string, PendingElicitation>()
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
        stderr: (data: string) => {
          // Surface SDK CLI stderr to the electron main log so failures like
          // "process exited with code 1" stop being opaque. Trim trailing
          // newlines so each chunk is one log line.
          const t = data.replace(/\s+$/, '')
          if (t) console.error(`[claude-cli ${session.id}] ${t}`)
        },
        systemPrompt: {
          type: 'preset',
          preset: 'claude_code',
          append: FOLK_PRESENTATION_PROMPT
        },
        extraArgs: this.#parseExtraArgs(session.flags),
        permissionMode: session.permissionMode ?? 'default',
        // SDK refuses bypassPermissions without this acknowledgement flag.
        allowDangerouslySkipPermissions:
          session.permissionMode === 'bypassPermissions' ? true : undefined,
        canUseTool: async (toolName, input, opts) => {
          // AskUserQuestion is a client-side elicitation tool — its result is
          // the user's selected option. Hold canUseTool open until the user
          // actually picks one, then resolve with allow so the SDK proceeds
          // with the tool_result we pushed via respondToolUse.
          if (toolName === 'AskUserQuestion') {
            const safeInput = (input ?? {}) as Record<string, unknown>
            const answer = await new Promise<string>((resolve) => {
              this.#pendingAsks.set(opts.toolUseID, {
                sessionId: session.id,
                toolUseId: opts.toolUseID,
                resolve,
                input: safeInput
              })
              const onAbort = () => {
                if (this.#pendingAsks.delete(opts.toolUseID)) {
                  resolve('')
                }
              }
              opts.signal.addEventListener('abort', onAbort, { once: true })
            })
            // Returning `deny` here is the load-bearing trick: the SDK's
            // built-in AskUserQuestion handler echoes the question structure
            // (no answer field), so allow → tool runs → empty result → model
            // is blind. Resolve with deny instead, embedding the user's
            // answer in `message`; the SDK pipes that string to the model as
            // the tool's content. We phrase it as a neutral statement so the
            // model reads it as the user's answer, not a refusal.
            if (!answer) {
              return { behavior: 'deny', message: 'User cancelled the question.' }
            }
            return { behavior: 'deny', message: `User answered: ${answer}` }
          }
          const requestId = randomUUID()
          const safeInput = (input ?? {}) as Record<string, unknown>
          this.#pendingPermissions.set(requestId, {
            resolve: () => {},
            suggestions: opts.suggestions,
            input: safeInput
          })
          // Replace the placeholder resolve with the real Promise resolver.
          const result = await new Promise<PermissionResult>((resolve) => {
            this.#pendingPermissions.set(requestId, {
              resolve,
              suggestions: opts.suggestions,
              input: safeInput
            })
            const onAbort = () => {
              if (this.#pendingPermissions.delete(requestId)) {
                resolve({ behavior: 'deny', message: 'aborted' })
              }
            }
            opts.signal.addEventListener('abort', onAbort, { once: true })
            this.emit('permissionRequest', {
              sessionId: session.id,
              requestId,
              toolName,
              toolUseID: opts.toolUseID,
              input,
              title: opts.title,
              description: opts.description,
              displayName: opts.displayName,
              blockedPath: opts.blockedPath,
              decisionReason: opts.decisionReason
            })
          })
          return result
        },
        onElicitation: async (request: SDKElicitationRequest, opts) => {
          const requestId = randomUUID()
          return await new Promise<ElicitationResult>((resolve) => {
            this.#pendingElicitations.set(requestId, { sessionId: session.id, resolve })
            const onAbort = () => {
              if (this.#pendingElicitations.delete(requestId)) {
                resolve({ action: 'cancel' })
              }
            }
            opts.signal.addEventListener('abort', onAbort, { once: true })
            const event: MCPElicitationRequest = {
              sessionId: session.id,
              requestId,
              serverName: request.serverName,
              message: request.message,
              mode: request.mode ?? 'form',
              url: request.url,
              elicitationId: request.elicitationId,
              requestedSchema: request.requestedSchema,
              title: request.title,
              displayName: request.displayName,
              description: request.description
            }
            this.emit('mcpElicitation', event)
          })
        },
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
    // Resolve any in-flight AskUserQuestion with empty answer so the canUseTool
    // promise unblocks; the abort below will tear down the SDK side.
    for (const [toolUseId, ask] of this.#pendingAsks) {
      if (ask.sessionId === sessionId) {
        this.#pendingAsks.delete(toolUseId)
        ask.resolve('')
      }
    }
    // Same for in-flight MCP elicitations — resolve with cancel so the SDK
    // can finish its onElicitation await before we abort.
    for (const [reqId, pending] of this.#pendingElicitations) {
      if (pending.sessionId === sessionId) {
        this.#pendingElicitations.delete(reqId)
        pending.resolve({ action: 'cancel' })
      }
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

  // Backfill a session's title from the first user message in its on-disk
  // transcript. No-op when the title was already customized, when there's no
  // transcript, or when no user text is found.
  async backfillTitle(id: string): Promise<Session | null> {
    const session = this.db.getSession(id)
    if (!session) return null
    if (session.title !== 'Untitled session') return session
    if (!session.claudeStarted) return session
    let raw: Awaited<ReturnType<typeof getSessionMessages>>
    try {
      raw = await getSessionMessages(id, { dir: session.workingDir })
    } catch {
      return session
    }
    for (const entry of raw) {
      if (entry.type !== 'user') continue
      const m = (entry.message as { content?: unknown }).content
      let text = ''
      if (typeof m === 'string') text = m
      else if (Array.isArray(m)) {
        for (const blk of m) {
          const b = blk as { type?: string; text?: string }
          if (b.type === 'text' && b.text) text += b.text
        }
      }
      const derived = deriveTitle(text)
      if (derived) {
        this.db.updateSession(id, { title: derived })
        return this.db.getSession(id)
      }
    }
    return session
  }

  async deleteSession(id: string): Promise<void> {
    await this.#teardown(id, 'delete')
    this.db.deleteSession(id)
  }

  // Update the persisted permissionMode and tear down the live SDK session so
  // the next turn picks up the new mode (the SDK reads it at session init).
  renameSession(id: string, title: string): Session {
    const existing = this.db.getSession(id)
    if (!existing) throw new Error(`session ${id} not found`)
    const trimmed = title.trim()
    if (!trimmed) throw new Error('title cannot be empty')
    this.db.updateSession(id, { title: trimmed })
    return this.db.getSession(id)!
  }

  async setPermissionMode(
    id: string,
    mode: import('@shared/types').PermissionMode
  ): Promise<Session> {
    const existing = this.db.getSession(id)
    if (!existing) throw new Error(`session ${id} not found`)
    if (this.#live.has(id)) {
      await this.#teardown(id, 'cancel')
    }
    this.db.updateSession(id, { permissionMode: mode })
    return this.db.getSession(id)!
  }

  async setModel(id: string, modelId: string): Promise<Session> {
    const existing = this.db.getSession(id)
    if (!existing) throw new Error(`session ${id} not found`)
    // Validate provider exists for the new model — bail before tearing down.
    this.#resolveProvider(modelId)
    if (this.#live.has(id)) {
      await this.#teardown(id, 'cancel')
    }
    this.db.updateSession(id, { modelId })
    return this.db.getSession(id)!
  }

  dispose(): void {
    const ids = [...this.#live.keys()]
    void Promise.all(ids.map((id) => this.#teardown(id, 'dispose')))
  }

  respondElicitation(response: MCPElicitationResponse): void {
    const pending = this.#pendingElicitations.get(response.requestId)
    if (!pending) return
    this.#pendingElicitations.delete(response.requestId)
    if (response.action === 'accept') {
      pending.resolve({ action: 'accept', content: response.content })
    } else {
      pending.resolve({ action: response.action })
    }
  }

  respondPermission(response: PermissionResponse): void {
    const pending = this.#pendingPermissions.get(response.requestId)
    if (!pending) return
    this.#pendingPermissions.delete(response.requestId)
    if (response.behavior === 'allow') {
      // SDK Zod schema requires `updatedInput` (record). We're not modifying
      // the tool input — pass the original through unchanged.
      pending.resolve({
        behavior: 'allow',
        updatedInput: pending.input,
        updatedPermissions:
          response.allowAlways && pending.suggestions ? pending.suggestions : undefined
      })
    } else {
      pending.resolve({
        behavior: 'deny',
        message: response.message ?? 'Denied by user.'
      })
    }
  }

  // Reply to a client-side elicitation tool (currently AskUserQuestion). The
  // user picked an option in the renderer; resolve the canUseTool promise
  // (which has been blocking the SDK from proceeding), then let the SDK
  // invoke the tool with the user's choice as the result. We also patch the
  // local tool block so the UI flips to 'done' immediately.
  respondToolUse(sessionId: string, toolUseId: string, answer: string): void {
    // Resolve the canUseTool promise so the SDK proceeds. SDK gets the answer
    // back as the tool's output via the queued tool_result push below.
    const ask = this.#pendingAsks.get(toolUseId)
    if (ask) {
      this.#pendingAsks.delete(toolUseId)
      ask.resolve(answer)
    }
    const live = this.#live.get(sessionId)
    if (!live) return
    // Drop any stray permission request for the same tool — AskUserQuestion
    // is never gated by Allow/Deny.
    for (const [reqId, pending] of this.#pendingPermissions) {
      if ((pending as { toolUseId?: string }).toolUseId === toolUseId) {
        this.#pendingPermissions.delete(reqId)
      }
    }
    // The user's answer flows back to the model via canUseTool's deny.message
    // (see #pendingAsks resolution above). We don't push an extra user text
    // here because the deny message already lands in tool_result content.
    void live
    this.emit('toolResult', {
      sessionId,
      callId: toolUseId,
      output: answer,
      isError: false
    })
  }

  async cancel(sessionId: string): Promise<void> {
    const session = this.db.getSession(sessionId)
    await this.#teardown(sessionId, 'cancel')
    this.db.updateSession(sessionId, { status: 'cancelled' })
    // Aborting mid-tool can leave assistant tool_use blocks without matching
    // user tool_result blocks in the on-disk transcript — Anthropic's API then
    // 400s on the next resume turn, surfacing as "Process exited with code 1".
    // Scrub by appending synthetic cancelled-tool_results so the transcript is
    // balanced before the next resume.
    if (session) await this.#balanceCancelledToolUses(session).catch(() => {})
  }

  async #balanceCancelledToolUses(session: Session): Promise<void> {
    const projDir = session.workingDir.replace(/\//g, '-')
    const file = join(homedir(), '.claude', 'projects', projDir, `${session.id}.jsonl`)
    let raw: string
    try {
      raw = await fs.readFile(file, 'utf-8')
    } catch {
      return
    }
    const lines = raw.split('\n').filter((l) => l.trim().length > 0)
    const pending = new Map<string, string | null>() // tool_use_id → parent uuid
    let lastUuid: string | null = null
    for (const line of lines) {
      let obj: Record<string, unknown>
      try {
        obj = JSON.parse(line)
      } catch {
        continue
      }
      const uuid = typeof obj.uuid === 'string' ? obj.uuid : null
      if (uuid) lastUuid = uuid
      const message = obj.message as { content?: unknown } | undefined
      const content = message?.content
      if (!Array.isArray(content)) continue
      if (obj.type === 'assistant') {
        for (const blk of content) {
          const b = blk as { type?: string; id?: string }
          if (b?.type === 'tool_use' && typeof b.id === 'string') {
            pending.set(b.id, uuid)
          }
        }
      } else if (obj.type === 'user') {
        for (const blk of content) {
          const b = blk as { type?: string; tool_use_id?: string }
          if (b?.type === 'tool_result' && typeof b.tool_use_id === 'string') {
            pending.delete(b.tool_use_id)
          }
        }
      }
    }
    if (pending.size === 0) return
    const ts = new Date().toISOString()
    const appends: string[] = []
    let parentUuid = lastUuid
    for (const [toolUseId, originUuid] of pending) {
      const uuid = randomUUID()
      const entry = {
        parentUuid,
        isSidechain: false,
        type: 'user',
        message: {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: toolUseId,
              content: 'Cancelled by user.',
              is_error: true
            }
          ]
        },
        uuid,
        timestamp: ts,
        sourceToolAssistantUUID: originUuid ?? undefined,
        userType: 'external',
        entrypoint: 'cli',
        cwd: session.workingDir,
        sessionId: session.id
      }
      appends.push(JSON.stringify(entry))
      parentUuid = uuid
    }
    await fs.appendFile(file, appends.join('\n') + '\n', 'utf-8')
  }

  async sendMessage(
    sessionId: string,
    text: string,
    _attachments?: Attachment[]
  ): Promise<void> {
    const session = this.db.getSession(sessionId)
    if (!session) throw new Error(`session ${sessionId} not found`)

    // Auto-title from first user message when the session is still using the
    // placeholder. Trim to a single line and ~60 chars so the sidebar stays
    // tidy. Sentence-case nothing — keep the user's casing.
    if (session.title === 'Untitled session' && text.trim()) {
      const derived = deriveTitle(text)
      if (derived) {
        this.db.updateSession(sessionId, { title: derived })
        session.title = derived
      }
    }

    // Resolve provider here so config errors surface before we touch the
    // child process. #ensureLive resolves it again internally for env build.
    this.#resolveProvider(session.modelId)

    try {
      await this.#sendOnce(session, text)
    } catch (err) {
      const msg = (err as Error)?.message ?? ''
      // The bundled Claude Code CLI keeps a per-session lock; if the prior
      // process hadn't fully released it (common right after a cancel), the
      // new spawn dies with this exact line on stderr and exits code 1.
      // Recover transparently: tear down any live state, wait for the lock
      // to clear, retry once.
      const lockTaken = /is already in use/i.test(msg)
      const exit1 = /exited with code 1/i.test(msg)
      if (!(lockTaken || exit1)) throw err
      if (this.#live.has(sessionId)) await this.#teardown(sessionId, 'cancel')
      await new Promise((r) => setTimeout(r, 600))
      const refreshed = this.db.getSession(sessionId)
      if (!refreshed) throw err
      await this.#sendOnce(refreshed, text)
    }
  }

  async #sendOnce(session: Session, text: string): Promise<void> {
    // LRU eviction: if we're at the cap and this session isn't already live,
    // evict the oldest live session. Fire-and-forget — the dying session
    // tears down in the background while we lazy-start the new one.
    if (!this.#live.has(session.id) && this.#live.size >= MAX_LIVE) {
      let lruId: string | null = null
      let lruAt = Infinity
      for (const [id, ls] of this.#live) {
        if (ls.lastUsedAt < lruAt) {
          lruAt = ls.lastUsedAt
          lruId = id
        }
      }
      if (lruId) void this.#teardown(lruId, 'lru')
    }

    const live = this.#ensureLive(session)
    live.lastUsedAt = Date.now()

    if (live.idleTimer) {
      clearTimeout(live.idleTimer)
      live.idleTimer = null
    }
    this.db.updateSession(session.id, { status: 'running' })

    return new Promise<void>((resolve, reject) => {
      live.turnDone = () => {
        live.turnDone = null
        live.turnError = null
        resolve()
      }
      live.turnError = (e) => {
        live.turnDone = null
        live.turnError = null
        reject(e)
      }
      live.push({
        type: 'user',
        session_id: session.id,
        parent_tool_use_id: null,
        message: { role: 'user', content: text }
      })
    })
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
      parent_tool_use_id?: string | null
    }
    const parentCallId = m.parent_tool_use_id ?? null

    // Incremental deltas when includePartialMessages is on.
    if (m.type === 'stream_event' && m.event) {
      const ev = m.event as {
        type: string
        message?: { id?: string }
        delta?: { type?: string; text?: string; thinking?: string }
      }
      if (ev.type === 'message_start' && ev.message?.id) {
        this.#live.get(sessionId)?.streamedMessages.add(ev.message.id)
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
      const liveForDedup = this.#live.get(sessionId)
      const wasStreamed =
        m.message.id && liveForDedup?.streamedMessages.has(m.message.id)
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
            input: b.input,
            parentCallId
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
            isError: !!b.is_error,
            parentCallId
          })
        }
      }
    } else if (m.type === 'result') {
      if (m.subtype === 'error' || m.is_error) {
        this.emit('error', mapError(sessionId, new Error(m.result ?? 'agent error')))
      }
      const r = msg as {
        total_cost_usd?: number
        duration_ms?: number
        num_turns?: number
        usage?: {
          input_tokens?: number
          output_tokens?: number
          cache_read_input_tokens?: number
          cache_creation_input_tokens?: number
        }
      }
      this.emit('usage', {
        sessionId,
        totalCostUsd: r.total_cost_usd ?? 0,
        durationMs: r.duration_ms ?? 0,
        numTurns: r.num_turns ?? 0,
        inputTokens: r.usage?.input_tokens ?? 0,
        outputTokens: r.usage?.output_tokens ?? 0,
        cacheReadTokens: r.usage?.cache_read_input_tokens ?? 0,
        cacheCreateTokens: r.usage?.cache_creation_input_tokens ?? 0
      })
      const live = this.#live.get(sessionId)
      if (live) {
        live.streamedMessages.clear()
        this.db.updateSession(sessionId, {
          status: 'idle',
          claudeStarted: true
        })
        this.#armIdleTimer(sessionId)
        const done = live.turnDone
        live.turnDone = null
        live.turnError = null
        done?.()
      }
      this.emit('done', { sessionId })
    } else if (m.type === 'tool_progress') {
      const r = msg as { tool_use_id?: string; elapsed_time_seconds?: number }
      if (r.tool_use_id) {
        this.emit('toolProgress', {
          sessionId,
          callId: r.tool_use_id,
          elapsedSeconds: r.elapsed_time_seconds ?? 0
        })
      }
    } else if (m.type === 'prompt_suggestion') {
      const r = msg as { suggestion?: string }
      if (r.suggestion) {
        this.emit('promptSuggestion', { sessionId, suggestion: r.suggestion })
      }
    } else if (m.type === 'rate_limit_event') {
      const r = msg as {
        rate_limit_info?: { status?: string; resetsAt?: number; rateLimitType?: string }
      }
      const info = r.rate_limit_info
      const status = info?.status ?? 'allowed'
      if (status !== 'allowed') {
        const reset = info?.resetsAt
          ? ` until ${new Date(info.resetsAt).toLocaleTimeString()}`
          : ''
        const tier = info?.rateLimitType ? ` (${info.rateLimitType})` : ''
        this.emit('notice', {
          sessionId,
          kind: 'rate_limit',
          text: `Rate limit ${status}${tier}${reset}`
        })
      }
    } else if (m.type === 'system') {
      this.#dispatchSystem(sessionId, msg)
    } else if (m.type === 'tool_use_summary') {
      const r = msg as { summary?: string }
      if (r.summary) {
        this.emit('notice', {
          sessionId,
          kind: 'info',
          text: `Summary: ${r.summary}`
        })
      }
    }
    // Other unhandled wire types (e.g. user message replays) intentionally
    // drop — they don't change folk's view of the transcript.
  }

  // Fan-out for `type: 'system'` envelopes, which the SDK uses for everything
  // from `init` to per-hook lifecycle events. Each subtype is mapped to either
  // an `info` notice (rendered as a transcript divider) or, for events that
  // affect session state, a status update.
  #dispatchSystem(sessionId: string, msg: unknown): void {
    const r = msg as Record<string, unknown> & { subtype?: string }
    const sub = r.subtype
    if (!sub) return
    switch (sub) {
      case 'compact_boundary': {
        const trigger = (
          r as { compact_metadata?: { trigger?: string } }
        ).compact_metadata?.trigger
        this.emit('notice', {
          sessionId,
          kind: 'compact_boundary',
          text: trigger === 'manual' ? 'Context compacted (manual)' : 'Context compacted'
        })
        return
      }
      case 'api_retry': {
        const x = r as {
          attempt?: number
          max_retries?: number
          retry_delay_ms?: number
          error?: string
        }
        const delay =
          x.retry_delay_ms != null ? `${Math.round(x.retry_delay_ms / 100) / 10}s` : '?'
        this.emit('notice', {
          sessionId,
          kind: 'api_retry',
          text: `API retry ${x.attempt ?? '?'}/${x.max_retries ?? '?'} in ${delay}${
            x.error ? ` — ${x.error}` : ''
          }`
        })
        return
      }
      case 'init': {
        const x = r as { tools?: string[]; mcp_servers?: { name: string }[]; model?: string }
        const tools = (x.tools ?? []).length
        const mcps = (x.mcp_servers ?? []).length
        this.emit('notice', {
          sessionId,
          kind: 'lifecycle',
          text: `Session ready · model ${x.model ?? '?'} · ${tools} tools · ${mcps} MCP server(s)`
        })
        return
      }
      case 'status': {
        const x = r as {
          status?: string | null
          compact_result?: string
          compact_error?: string
        }
        if (!x.status) return
        const extra = x.compact_result
          ? ` · ${x.compact_result}${x.compact_error ? ` (${x.compact_error})` : ''}`
          : ''
        this.emit('notice', {
          sessionId,
          kind: 'lifecycle',
          text: `Status: ${x.status}${extra}`
        })
        return
      }
      case 'auth_status': {
        const x = r as { isAuthenticating?: boolean; error?: string }
        this.emit('notice', {
          sessionId,
          kind: 'lifecycle',
          text: `Auth ${x.isAuthenticating ? 'in progress' : 'updated'}${
            x.error ? ` · ${x.error}` : ''
          }`
        })
        return
      }
      case 'elicitation_complete': {
        const x = r as { mcp_server_name?: string }
        this.emit('notice', {
          sessionId,
          kind: 'lifecycle',
          text: `Elicitation complete${x.mcp_server_name ? ` (${x.mcp_server_name})` : ''}`
        })
        return
      }
      case 'files_persisted': {
        const x = r as {
          files?: { filename: string }[]
          failed?: { filename: string; error: string }[]
        }
        const ok = (x.files ?? []).length
        const failed = (x.failed ?? []).length
        if (ok === 0 && failed === 0) return
        this.emit('notice', {
          sessionId,
          kind: 'lifecycle',
          text: `Persisted ${ok} file(s)${failed ? `, ${failed} failed` : ''}`
        })
        return
      }
      case 'hook_started': {
        const x = r as { hook_name?: string; hook_event?: string }
        this.emit('notice', {
          sessionId,
          kind: 'lifecycle',
          text: `Hook ${x.hook_name ?? '?'} started (${x.hook_event ?? '?'})`
        })
        return
      }
      case 'hook_progress': {
        const x = r as { hook_name?: string }
        this.emit('notice', {
          sessionId,
          kind: 'lifecycle',
          text: `Hook ${x.hook_name ?? '?'} progress`
        })
        return
      }
      case 'hook_response': {
        const x = r as {
          hook_name?: string
          outcome?: string
          exit_code?: number
        }
        this.emit('notice', {
          sessionId,
          kind: 'lifecycle',
          text: `Hook ${x.hook_name ?? '?'} ${x.outcome ?? 'done'}${
            x.exit_code != null ? ` (exit ${x.exit_code})` : ''
          }`
        })
        return
      }
      case 'local_command_output': {
        // Shaped by the SDK to be displayed inline as assistant text — pipe
        // straight through the chunk channel.
        const x = r as { content?: string }
        if (x.content) this.emit('chunk', { sessionId, text: x.content + '\n' })
        return
      }
      case 'memory_recall': {
        const x = r as {
          memories?: { path: string }[]
          mode?: 'select' | 'synthesize'
        }
        const n = (x.memories ?? []).length
        if (n === 0) return
        this.emit('notice', {
          sessionId,
          kind: 'lifecycle',
          text: `Recalled ${n} ${x.mode === 'synthesize' ? 'memory synthesis' : 'memories'}`
        })
        return
      }
      case 'mirror_error': {
        const x = r as { error?: string }
        this.emit('notice', {
          sessionId,
          kind: 'lifecycle',
          text: `Mirror error: ${x.error ?? 'unknown'}`
        })
        return
      }
      case 'notification': {
        const x = r as { text?: string; priority?: string }
        if (!x.text) return
        this.emit('notice', {
          sessionId,
          kind: 'lifecycle',
          text: x.priority && x.priority !== 'low' ? `[${x.priority}] ${x.text}` : x.text
        })
        return
      }
      case 'plugin_install': {
        const x = r as { status?: string; name?: string; error?: string }
        this.emit('notice', {
          sessionId,
          kind: 'lifecycle',
          text: `Plugin install: ${x.status ?? '?'}${x.name ? ` ${x.name}` : ''}${
            x.error ? ` — ${x.error}` : ''
          }`
        })
        return
      }
      case 'session_state_changed': {
        const x = r as { state?: 'idle' | 'running' | 'requires_action' }
        if (!x.state) return
        const next = x.state === 'running' ? 'running' : 'idle'
        try {
          this.db.updateSession(sessionId, { status: next })
        } catch {
          // session might be gone (e.g., teardown raced) — ignore.
        }
        return
      }
      // Subagent activity is already conveyed via parent_tool_use_id-nested
      // tool calls (§ 3) — these duplicate that signal at a coarser level.
      case 'task_started':
      case 'task_updated':
      case 'task_progress':
      case 'task_notification':
        return
      default:
        // Unknown subtype — surface a low-noise debug notice so we see new
        // SDK additions without crashing.
        this.emit('notice', {
          sessionId,
          kind: 'lifecycle',
          text: `Event: system/${sub}`
        })
        return
    }
  }
}
