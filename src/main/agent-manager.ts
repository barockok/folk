import { EventEmitter } from 'events'
import {
  unstable_v2_createSession,
  unstable_v2_resumeSession,
  type SDKSessionOptions,
  type SDKSession,
  type SDKMessage,
  type HookCallbackMatcher,
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

/**
 * AgentManager — each Folk conversation is a Claude Code session.
 *
 * Sessions are persistent and resumable:
 * - First message in a conversation → creates a new session
 * - Subsequent messages → resumes the existing session
 * - Session exits after agent completes, resumes when user sends next message
 * - Each session is sandboxed with its own CLAUDE_CONFIG_DIR
 *
 * Hooks provide real-time tool progress/output to the Folk UI.
 */
export class AgentManager extends EventEmitter {
  private db: DatabaseManager
  private getMainWindow: () => BrowserWindow | null
  private sessions: Map<string, SDKSession> = new Map()
  private sessionIds: Map<string, string> = new Map() // conversationId → Claude session ID
  private sandboxBaseDir: string

  constructor(config: AgentManagerConfig) {
    super()
    this.db = config.db
    this.getMainWindow = config.getMainWindow
    this.sandboxBaseDir = join(app.getPath('userData'), 'sessions')
    if (!existsSync(this.sandboxBaseDir)) {
      mkdirSync(this.sandboxBaseDir, { recursive: true })
    }
  }

  async handleMessage(conversationId: string, userContent: string): Promise<void> {
    console.log(`[AgentManager] handleMessage conv=${conversationId} content="${userContent.slice(0, 80)}"`)

    const win = this.getMainWindow()

    // Save user message to DB
    const userBlocks: ContentBlock[] = [{ type: 'text', text: userContent }]
    this.db.addMessage(conversationId, 'user', userBlocks)
    this.db.updateConversationTimestamp(conversationId)

    // Auto-title on first message
    const allMessages = this.db.getMessages(conversationId)
    if (allMessages.length === 1) {
      const title = userContent.length > 50 ? userContent.slice(0, 47) + '...' : userContent
      this.db.renameConversation(conversationId, title)
    }

    // Get workspace path
    const conv = this.db.getConversation(conversationId)
    const workspacePath =
      conv?.workspacePath ||
      (this.db.getSetting('workspacePath') as string) ||
      app.getPath('home')

    // Sandbox directory for this conversation
    const sessionDir = join(this.sandboxBaseDir, conversationId)
    if (!existsSync(sessionDir)) {
      mkdirSync(sessionDir, { recursive: true })
    }

    try {
      // Get or create the session
      let session = this.sessions.get(conversationId)
      const existingSessionId = this.sessionIds.get(conversationId) ||
        (this.db.getSetting(`session:${conversationId}`) as string | null)

      const sessionOptions = this.buildSessionOptions(conversationId, workspacePath, sessionDir)

      if (session) {
        // Session is still alive — send message directly
        console.log(`[AgentManager] Sending to active session for conv=${conversationId}`)
        await session.send(userContent)
      } else if (existingSessionId) {
        // Session existed before but was closed — resume it
        console.log(`[AgentManager] Resuming session ${existingSessionId} for conv=${conversationId}`)
        session = unstable_v2_resumeSession(existingSessionId, sessionOptions)
        this.sessions.set(conversationId, session)
        await session.send(userContent)
      } else {
        // Brand new conversation — create a new session
        console.log(`[AgentManager] Creating new session for conv=${conversationId} in workspace=${workspacePath}`)
        session = unstable_v2_createSession(sessionOptions)
        this.sessions.set(conversationId, session)
        await session.send(userContent)
      }

      // Stream messages from the session
      this.streamSession(conversationId, session, win)
    } catch (err: any) {
      console.error(`[AgentManager] Error:`, err)
      // If resume fails, try creating a fresh session
      if (err.message?.includes('resume') || err.message?.includes('session')) {
        console.log(`[AgentManager] Resume failed, creating fresh session`)
        this.sessionIds.delete(conversationId)
        this.db.setSetting(`session:${conversationId}`, null as any)
        const sessionOptions = this.buildSessionOptions(conversationId, workspacePath, sessionDir)
        const session = unstable_v2_createSession(sessionOptions)
        this.sessions.set(conversationId, session)
        await session.send(userContent)
        this.streamSession(conversationId, session, win)
      } else {
        win?.webContents.send('agent:error', {
          conversationId,
          error: err.message || String(err),
        })
      }
    }
  }

  stop(conversationId: string): void {
    const session = this.sessions.get(conversationId)
    if (session) {
      session.close()
      this.sessions.delete(conversationId)
    }
  }

  async closeAll(): Promise<void> {
    for (const [id, session] of this.sessions) {
      session.close()
    }
    this.sessions.clear()
  }

  private buildSessionOptions(
    conversationId: string,
    workspacePath: string,
    sessionDir: string
  ): SDKSessionOptions {
    const win = this.getMainWindow()

    // Build hooks for real-time tool updates
    const hooks: SDKSessionOptions['hooks'] = {
      PreToolUse: [
        {
          hooks: [
            async (input) => {
              // Notify UI that a tool is about to execute
              console.log(`[Hook:PreToolUse] tool=${input.tool_name} id=${input.tool_use_id}`)
              win?.webContents.send('agent:tool-start', {
                conversationId,
                toolCall: {
                  id: input.tool_use_id,
                  toolName: input.tool_name,
                  input: input.tool_input,
                },
              })
              // Allow all tools to proceed
              return { hookEventName: 'PreToolUse' as const, permissionDecision: 'allow' as const }
            },
          ],
        },
      ],
      PostToolUse: [
        {
          hooks: [
            async (input) => {
              // Notify UI with tool result
              console.log(`[Hook:PostToolUse] tool=${input.tool_name} id=${input.tool_use_id}`)
              win?.webContents.send('agent:tool-result', {
                conversationId,
                toolCall: {
                  id: input.tool_use_id,
                  toolName: input.tool_name,
                  output: input.tool_response,
                  status: 'success',
                  durationMs: 0,
                },
              })

              // If a file was written/edited, send as artifact
              if (['Write', 'Edit', 'MultiEdit'].includes(input.tool_name)) {
                const toolInput = input.tool_input as Record<string, unknown>
                const filePath = (toolInput.file_path || toolInput.path || '') as string
                if (filePath) {
                  win?.webContents.send('agent:artifact', {
                    conversationId,
                    artifact: {
                      id: input.tool_use_id,
                      conversationId,
                      messageId: null,
                      type: 'file',
                      title: filePath.split('/').pop() || filePath,
                      content: typeof input.tool_response === 'string' ? input.tool_response : JSON.stringify(input.tool_response),
                      filePath,
                      language: null,
                      createdAt: Date.now(),
                    },
                  })
                }
              }

              return { hookEventName: 'PostToolUse' as const }
            },
          ],
        },
      ],
      PostToolUseFailure: [
        {
          hooks: [
            async (input) => {
              console.log(`[Hook:PostToolUseFailure] tool=${(input as any).tool_name}`)
              win?.webContents.send('agent:tool-result', {
                conversationId,
                toolCall: {
                  id: (input as any).tool_use_id || '',
                  toolName: (input as any).tool_name || 'unknown',
                  output: { error: (input as any).tool_response },
                  status: 'error',
                  durationMs: 0,
                },
              })
              return { hookEventName: 'PostToolUseFailure' as const }
            },
          ],
        },
      ],
      Notification: [
        {
          hooks: [
            async (input) => {
              // Forward notifications (e.g. context compaction, status updates)
              console.log(`[Hook:Notification] ${JSON.stringify(input).slice(0, 200)}`)
              return { hookEventName: 'Notification' as const }
            },
          ],
        },
      ],
    }

    // Determine API configuration
    const apiKey = (this.db.getSetting('anthropicApiKey') as string) || process.env.ANTHROPIC_API_KEY || ''
    const baseUrl = (this.db.getSetting('anthropicBaseUrl') as string) || process.env.ANTHROPIC_BASE_URL || ''
    const model = (this.db.getSetting('model') as string) || 'claude-sonnet-4-6'

    const env: Record<string, string | undefined> = {
      ...process.env,
      CLAUDE_CONFIG_DIR: sessionDir,
      ANTHROPIC_API_KEY: apiKey || 'local-no-key',
      CLAUDE_AGENT_SDK_CLIENT_APP: 'folk/0.1.0',
    }

    // If user configured a custom base URL (e.g. llama-server, Ollama proxy, LiteLLM)
    if (baseUrl) {
      env.ANTHROPIC_BASE_URL = baseUrl
    }

    return {
      model,
      env,
      allowedTools: [
        'Read', 'Grep', 'Glob', 'LS', 'Bash',
        'Write', 'Edit', 'MultiEdit',
        'WebFetch', 'WebSearch',
        'TodoRead', 'TodoWrite',
        'Agent',
      ],
      permissionMode: 'bypassPermissions',
      hooks,
    }
  }

  private async streamSession(
    conversationId: string,
    session: SDKSession,
    win: BrowserWindow | null
  ): Promise<void> {
    try {
      // Capture the session ID once available
      try {
        const sid = session.sessionId
        this.sessionIds.set(conversationId, sid)
        this.db.setSetting(`session:${conversationId}`, sid)
        console.log(`[AgentManager] Session ID for conv=${conversationId}: ${sid}`)
      } catch {
        // sessionId might not be available yet for new sessions
      }

      for await (const message of session.stream()) {
        this.handleSDKMessage(conversationId, message, win)

        // Capture session ID after first message if we didn't get it earlier
        if (!this.sessionIds.has(conversationId)) {
          try {
            const sid = session.sessionId
            this.sessionIds.set(conversationId, sid)
            this.db.setSetting(`session:${conversationId}`, sid)
            console.log(`[AgentManager] Session ID captured: ${sid}`)
          } catch {
            // ignore
          }
        }
      }

      console.log(`[AgentManager] Stream ended for conv=${conversationId}`)

      // Session is idle — remove from active but keep sessionId for resume
      this.sessions.delete(conversationId)

      // Send completion signal
      win?.webContents.send('agent:complete', {
        conversationId,
        message: null,
      })
    } catch (err: any) {
      console.error(`[AgentManager] Stream error:`, err)
      this.sessions.delete(conversationId)
      if (err.name !== 'AbortError') {
        win?.webContents.send('agent:error', {
          conversationId,
          error: err.message || String(err),
        })
      }
    }
  }

  private handleSDKMessage(
    conversationId: string,
    message: SDKMessage,
    win: BrowserWindow | null
  ): void {
    switch (message.type) {
      case 'assistant': {
        // Full assistant response — save to DB and notify
        const textParts = message.message.content
          .filter((b: any) => b.type === 'text')
          .map((b: any) => b.text)

        if (textParts.length > 0) {
          const contentBlocks: ContentBlock[] = [{ type: 'text', text: textParts.join('') }]
          const savedMsg = this.db.addMessage(conversationId, 'assistant', contentBlocks)
          win?.webContents.send('agent:complete', { conversationId, message: savedMsg })
        }
        break
      }

      case 'stream_event': {
        // Real-time token streaming
        const event = message.event
        if (event.type === 'content_block_delta') {
          const delta = (event as any).delta
          if (delta?.type === 'text_delta' && delta.text) {
            win?.webContents.send('agent:token', {
              conversationId,
              token: delta.text,
            })
          }
        }
        break
      }

      case 'result': {
        // Final result with cost/duration
        const result = message as any
        console.log(`[AgentManager] Result: cost=${result.cost_usd}, tokens_in=${result.usage?.input_tokens}, tokens_out=${result.usage?.output_tokens}`)

        if (result.result) {
          const contentBlocks: ContentBlock[] = [{ type: 'text', text: result.result }]
          const savedMsg = this.db.addMessage(conversationId, 'assistant', contentBlocks)
          win?.webContents.send('agent:complete', { conversationId, message: savedMsg })
        }
        break
      }

      case 'system': {
        // System messages — tool results, notifications
        const sys = message as any
        console.log(`[AgentManager] System: subtype=${sys.subtype} ${JSON.stringify(sys).slice(0, 200)}`)
        break
      }

      default:
        console.log(`[AgentManager] Message type=${message.type}`)
        break
    }
  }
}
