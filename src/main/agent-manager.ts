import { EventEmitter } from 'events'
import Anthropic from '@anthropic-ai/sdk'
import {
  unstable_v2_createSession,
  unstable_v2_resumeSession,
  type SDKSessionOptions,
  type SDKSession,
  type SDKMessage,
} from '@anthropic-ai/claude-agent-sdk'
import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { mkdirSync, existsSync } from 'fs'
import type { DatabaseManager } from './database'
import type { ContentBlock } from '../shared/types'

interface AgentManagerConfig {
  db: DatabaseManager
  getMainWindow: () => BrowserWindow | null
}

type AgentMode = 'local' | 'claude'

/**
 * Dual-mode AgentManager:
 *
 * LOCAL mode (default): Custom agent loop using @anthropic-ai/sdk talking
 * directly to llama-server on port 8847. Simple tool set. Works offline.
 *
 * CLAUDE mode: Full Claude Code sessions via Agent SDK. Requires Anthropic
 * API key. Gets all Claude Code tools (Bash, Read, Write, Edit, etc.)
 */
export class AgentManager extends EventEmitter {
  private db: DatabaseManager
  private getMainWindow: () => BrowserWindow | null
  private sandboxBaseDir: string

  // Local mode state
  private localClient: Anthropic | null = null
  private localAbortControllers: Map<string, AbortController> = new Map()

  // Claude mode state
  private sessions: Map<string, SDKSession> = new Map()
  private sessionIds: Map<string, string> = new Map()

  constructor(config: AgentManagerConfig) {
    super()
    this.db = config.db
    this.getMainWindow = config.getMainWindow
    this.sandboxBaseDir = join(app.getPath('userData'), 'sessions')
    if (!existsSync(this.sandboxBaseDir)) {
      mkdirSync(this.sandboxBaseDir, { recursive: true })
    }
  }

  private getMode(): AgentMode {
    // Always use Claude mode (Agent SDK) — it works with llama-server
    // via ANTHROPIC_BASE_URL. Local mode is fallback for basic chat only.
    const mode = (this.db.getSetting('agentMode') as string) || 'claude'
    return mode as AgentMode
  }

  async handleMessage(conversationId: string, userContent: string): Promise<void> {
    console.log(`[AgentManager] handleMessage conv=${conversationId} mode=${this.getMode()} content="${userContent.slice(0, 80)}"`)

    const win = this.getMainWindow()

    // Save user message to DB
    this.db.addMessage(conversationId, 'user', [{ type: 'text', text: userContent }])
    this.db.updateConversationTimestamp(conversationId)

    // Auto-title on first message
    const allMessages = this.db.getMessages(conversationId)
    if (allMessages.length === 1) {
      const title = userContent.length > 50 ? userContent.slice(0, 47) + '...' : userContent
      this.db.renameConversation(conversationId, title)
    }

    const mode = this.getMode()
    if (mode === 'claude') {
      await this.handleClaudeMode(conversationId, userContent, win)
    } else {
      await this.handleLocalMode(conversationId, userContent, win)
    }
  }

  stop(conversationId: string): void {
    // Stop local mode
    const controller = this.localAbortControllers.get(conversationId)
    if (controller) {
      controller.abort()
      this.localAbortControllers.delete(conversationId)
    }
    // Stop claude mode
    const session = this.sessions.get(conversationId)
    if (session) {
      session.close()
      this.sessions.delete(conversationId)
    }
  }

  async closeAll(): Promise<void> {
    for (const [, session] of this.sessions) {
      session.close()
    }
    this.sessions.clear()
    for (const [, controller] of this.localAbortControllers) {
      controller.abort()
    }
    this.localAbortControllers.clear()
  }

  // =========================================================================
  // LOCAL MODE — Custom agent loop with llama-server
  // =========================================================================

  private getLocalClient(): Anthropic {
    if (!this.localClient) {
      const baseUrl = (this.db.getSetting('anthropicBaseUrl') as string) || 'http://127.0.0.1:8847'
      this.localClient = new Anthropic({
        baseURL: baseUrl,
        apiKey: 'local-no-key-needed',
      })
    }
    return this.localClient
  }

  private async handleLocalMode(
    conversationId: string,
    userContent: string,
    win: BrowserWindow | null
  ): Promise<void> {
    const client = this.getLocalClient()
    const abortController = new AbortController()
    this.localAbortControllers.set(conversationId, abortController)

    // Load conversation history
    const history = this.db.getMessages(conversationId)
    const messages = history.map((msg) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content.map((b) => {
        if (b.type === 'text') return { type: 'text' as const, text: b.text }
        if (b.type === 'tool_use') return { type: 'tool_use' as const, id: b.id, name: b.name, input: b.input }
        if (b.type === 'tool_result') return { type: 'tool_result' as const, tool_use_id: b.toolUseId, content: b.content }
        return { type: 'text' as const, text: '' }
      }),
    }))

    try {
      const model = (this.db.getSetting('model') as string) || 'gemma-4-e4b'

      console.log(`[AgentManager:Local] Calling model=${model} messages=${messages.length}`)

      const stream = client.messages.stream({
        model,
        max_tokens: 4096,
        system: 'You are Folk, a helpful AI assistant running locally on the user\'s machine. Be concise and helpful.',
        messages: messages as Anthropic.MessageParam[],
      })

      stream.on('text', (text) => {
        if (!abortController.signal.aborted) {
          win?.webContents.send('agent:token', { conversationId, token: text })
        }
      })

      const finalMessage = await stream.finalMessage()

      if (abortController.signal.aborted) return

      // Save assistant response
      const textContent = finalMessage.content
        .filter((b) => b.type === 'text')
        .map((b) => (b as any).text)
        .join('')

      if (textContent) {
        const contentBlocks: ContentBlock[] = [{ type: 'text', text: textContent }]
        const savedMsg = this.db.addMessage(conversationId, 'assistant', contentBlocks)
        win?.webContents.send('agent:complete', { conversationId, message: savedMsg })
      } else {
        win?.webContents.send('agent:complete', { conversationId, message: null })
      }

      console.log(`[AgentManager:Local] Response complete, tokens_in=${finalMessage.usage?.input_tokens}, tokens_out=${finalMessage.usage?.output_tokens}`)
    } catch (err: any) {
      console.error(`[AgentManager:Local] Error:`, err)
      if (err.name !== 'AbortError') {
        win?.webContents.send('agent:error', {
          conversationId,
          error: err.message || String(err),
        })
      }
    } finally {
      this.localAbortControllers.delete(conversationId)
    }
  }

  // =========================================================================
  // CLAUDE MODE — Full Claude Code sessions via Agent SDK
  // =========================================================================

  private async handleClaudeMode(
    conversationId: string,
    userContent: string,
    win: BrowserWindow | null
  ): Promise<void> {
    const conv = this.db.getConversation(conversationId)
    const workspacePath =
      conv?.workspacePath ||
      (this.db.getSetting('workspacePath') as string) ||
      app.getPath('home')

    const sessionDir = join(this.sandboxBaseDir, conversationId)
    if (!existsSync(sessionDir)) {
      mkdirSync(sessionDir, { recursive: true })
    }

    try {
      let session = this.sessions.get(conversationId)
      const existingSessionId = this.sessionIds.get(conversationId) ||
        (this.db.getSetting(`session:${conversationId}`) as string | null)

      const sessionOptions = this.buildClaudeSessionOptions(conversationId, sessionDir)

      if (session) {
        await session.send(userContent)
      } else if (existingSessionId) {
        console.log(`[AgentManager:Claude] Resuming session ${existingSessionId}`)
        session = unstable_v2_resumeSession(existingSessionId, sessionOptions)
        this.sessions.set(conversationId, session)
        await session.send(userContent)
      } else {
        console.log(`[AgentManager:Claude] Creating new session in workspace=${workspacePath}`)
        session = unstable_v2_createSession(sessionOptions)
        this.sessions.set(conversationId, session)
        await session.send(userContent)
      }

      this.streamClaudeSession(conversationId, session, win)
    } catch (err: any) {
      console.error(`[AgentManager:Claude] Error:`, err)
      win?.webContents.send('agent:error', {
        conversationId,
        error: err.message || String(err),
      })
    }
  }

  private buildClaudeSessionOptions(conversationId: string, sessionDir: string): SDKSessionOptions {
    const win = this.getMainWindow()
    const apiKey = (this.db.getSetting('anthropicApiKey') as string) ||
      'sk-ant-folk00000000000000000000000000000000000000000000000000'
    const baseUrl = (this.db.getSetting('anthropicBaseUrl') as string) || 'http://127.0.0.1:8847'
    const model = (this.db.getSetting('model') as string) || 'gemma-4-e4b'

    // Build MCP server configs from Folk's database
    const mcpServers: Record<string, any>[] = []
    const folkMcpServers = this.db.listMCPServers()
    for (const server of folkMcpServers) {
      if (!server.enabled) continue
      if (server.transport === 'stdio' && server.command) {
        mcpServers.push({ [server.name]: { type: 'stdio', command: server.command, args: server.args || [], env: server.env || {} } })
      } else if (server.transport === 'sse' && server.url) {
        const tokens = this.db.getOAuthTokens(server.id)
        const headers: Record<string, string> = {}
        if (tokens?.access_token) headers['Authorization'] = `${tokens.token_type || 'Bearer'} ${tokens.access_token}`
        mcpServers.push({ [server.name]: { type: 'sse', url: server.url, headers } })
      }
    }

    // Build a clean env — don't inherit personal Claude plugins/MCP from the host
    const cleanEnv: Record<string, string | undefined> = {
      PATH: process.env.PATH,
      HOME: sessionDir,  // Sandbox HOME so Claude Code doesn't load personal ~/.claude
      CLAUDE_CONFIG_DIR: sessionDir,
      ANTHROPIC_API_KEY: apiKey,
      ANTHROPIC_BASE_URL: baseUrl,
      CLAUDE_AGENT_SDK_CLIENT_APP: 'folk/0.1.0',
      // Preserve essential env vars
      TMPDIR: process.env.TMPDIR,
      LANG: process.env.LANG,
      TERM: process.env.TERM,
      SHELL: process.env.SHELL,
      USER: process.env.USER,
      LOGNAME: process.env.LOGNAME,
    }

    return {
      model,
      env: cleanEnv,
      mcpServers: mcpServers.length > 0 ? mcpServers : undefined,
      allowedTools: [
        'Read', 'Grep', 'Glob', 'LS', 'Bash',
        'Write', 'Edit', 'MultiEdit',
        'WebFetch', 'WebSearch',
        'TodoRead', 'TodoWrite',
        'Agent',
      ],
      permissionMode: 'bypassPermissions',
      hooks: {
        PreToolUse: [{
          hooks: [async (input) => {
            win?.webContents.send('agent:tool-start', {
              conversationId,
              toolCall: { id: input.tool_use_id, toolName: input.tool_name, input: input.tool_input },
            })
            return { hookEventName: 'PreToolUse' as const, permissionDecision: 'allow' as const }
          }],
        }],
        PostToolUse: [{
          hooks: [async (input) => {
            win?.webContents.send('agent:tool-result', {
              conversationId,
              toolCall: { id: input.tool_use_id, toolName: input.tool_name, output: input.tool_response, status: 'success', durationMs: 0 },
            })
            if (['Write', 'Edit', 'MultiEdit'].includes(input.tool_name)) {
              const filePath = ((input.tool_input as any)?.file_path || (input.tool_input as any)?.path || '') as string
              if (filePath) {
                win?.webContents.send('agent:artifact', {
                  conversationId,
                  artifact: { id: input.tool_use_id, conversationId, messageId: null, type: 'file', title: filePath.split('/').pop() || filePath, content: null, filePath, language: null, createdAt: Date.now() },
                })
              }
            }
            return { hookEventName: 'PostToolUse' as const }
          }],
        }],
      },
    }
  }

  private async streamClaudeSession(
    conversationId: string,
    session: SDKSession,
    win: BrowserWindow | null
  ): Promise<void> {
    try {
      try {
        const sid = session.sessionId
        this.sessionIds.set(conversationId, sid)
        this.db.setSetting(`session:${conversationId}`, sid)
      } catch { /* not available yet */ }

      for await (const message of session.stream()) {
        this.handleClaudeSDKMessage(conversationId, message, win)

        if (!this.sessionIds.has(conversationId)) {
          try {
            const sid = session.sessionId
            this.sessionIds.set(conversationId, sid)
            this.db.setSetting(`session:${conversationId}`, sid)
          } catch { /* ignore */ }
        }
      }

      this.sessions.delete(conversationId)
      win?.webContents.send('agent:complete', { conversationId, message: null })
    } catch (err: any) {
      console.error(`[AgentManager:Claude] Stream error:`, err)
      this.sessions.delete(conversationId)
      if (err.name !== 'AbortError') {
        win?.webContents.send('agent:error', { conversationId, error: err.message || String(err) })
      }
    }
  }

  private handleClaudeSDKMessage(conversationId: string, message: SDKMessage, win: BrowserWindow | null): void {
    switch (message.type) {
      case 'assistant': {
        if ((message as any).error) break
        const textParts = message.message.content.filter((b: any) => b.type === 'text').map((b: any) => b.text)
        if (textParts.length > 0) {
          const savedMsg = this.db.addMessage(conversationId, 'assistant', [{ type: 'text', text: textParts.join('') }])
          win?.webContents.send('agent:complete', { conversationId, message: savedMsg })
        }
        break
      }
      case 'stream_event': {
        const delta = (message.event as any)?.delta
        if (delta?.type === 'text_delta' && delta.text) {
          win?.webContents.send('agent:token', { conversationId, token: delta.text })
        }
        break
      }
      default:
        console.log(`[AgentManager:Claude] message type=${message.type}`)
        break
    }
  }
}
