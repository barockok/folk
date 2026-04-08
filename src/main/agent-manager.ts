import { EventEmitter } from 'events'
import { query, type Options, type SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { mkdirSync, existsSync } from 'fs'
import type { DatabaseManager } from './database'
import type { ContentBlock } from '../shared/types'

interface AgentManagerConfig {
  db: DatabaseManager
  getMainWindow: () => BrowserWindow | null
}

export class AgentManager extends EventEmitter {
  private db: DatabaseManager
  private getMainWindow: () => BrowserWindow | null
  private activeQueries: Map<string, { abort: AbortController }> = new Map()
  private sandboxBaseDir: string

  constructor(config: AgentManagerConfig) {
    super()
    this.db = config.db
    this.getMainWindow = config.getMainWindow
    // Each conversation gets its own .claude sandbox inside the app data
    this.sandboxBaseDir = join(app.getPath('userData'), 'sessions')
    if (!existsSync(this.sandboxBaseDir)) {
      mkdirSync(this.sandboxBaseDir, { recursive: true })
    }
  }

  async handleMessage(conversationId: string, userContent: string): Promise<void> {
    console.log(
      `[AgentManager] handleMessage conv=${conversationId} content="${userContent.slice(0, 50)}"`
    )

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

    // Get workspace path from conversation or settings
    const conv = this.db.getConversation(conversationId)
    const workspacePath =
      conv?.workspacePath ||
      (this.db.getSetting('workspacePath') as string) ||
      app.getPath('home')

    // Create sandboxed session directory for this conversation
    const sessionDir = join(this.sandboxBaseDir, conversationId)
    if (!existsSync(sessionDir)) {
      mkdirSync(sessionDir, { recursive: true })
    }

    // Set up abort controller
    const abortController = new AbortController()
    this.activeQueries.set(conversationId, { abort: abortController })

    try {
      // Build SDK options
      const options: Options = {
        abortController,
        cwd: workspacePath,
        // Sandbox the .claude home directory per conversation
        env: {
          ...process.env,
          CLAUDE_CONFIG_DIR: sessionDir,
          HOME: sessionDir, // Override HOME so .claude goes to sandbox
          // User can set their own API key in Folk settings
          ANTHROPIC_API_KEY:
            (this.db.getSetting('anthropicApiKey') as string) ||
            process.env.ANTHROPIC_API_KEY ||
            ''
        },
        // Use all Claude Code tools
        tools: { type: 'preset', preset: 'claude_code' },
        // Auto-allow safe tools, let dangerous ones through
        allowedTools: ['Read', 'Grep', 'Glob', 'LS', 'WebFetch', 'WebSearch'],
        // Permission mode - accept edits without prompting
        permissionMode: 'acceptEdits',
        // Don't persist sessions to disk (we manage our own DB)
        persistSession: false
      }

      // Create the query (Claude Code session)
      console.log(`[AgentManager] Starting Claude Code session in workspace=${workspacePath}`)
      const conversation = query({
        prompt: userContent,
        options
      })

      // Stream messages from the agent
      for await (const message of conversation) {
        if (abortController.signal.aborted) break

        this.handleSDKMessage(conversationId, message, win)
      }

      console.log(`[AgentManager] Session completed for conv=${conversationId}`)
    } catch (err: any) {
      console.error(`[AgentManager] Error:`, err)
      if (err.name !== 'AbortError') {
        win?.webContents.send('agent:error', {
          conversationId,
          error: err.message || String(err)
        })
      }
    } finally {
      this.activeQueries.delete(conversationId)
    }
  }

  stop(conversationId: string): void {
    const active = this.activeQueries.get(conversationId)
    if (active) {
      active.abort.abort()
      this.activeQueries.delete(conversationId)
    }
  }

  private handleSDKMessage(
    conversationId: string,
    message: SDKMessage,
    win: BrowserWindow | null
  ): void {
    switch (message.type) {
      case 'assistant': {
        // Full assistant message with content blocks
        const textBlocks = message.message.content
          .filter((b: any) => b.type === 'text')
          .map((b: any) => b.text)
          .join('')

        if (textBlocks) {
          const contentBlocks: ContentBlock[] = [{ type: 'text', text: textBlocks }]
          const savedMsg = this.db.addMessage(conversationId, 'assistant', contentBlocks)
          win?.webContents.send('agent:complete', { conversationId, message: savedMsg })
        }

        // Handle tool use blocks
        const toolBlocks = message.message.content.filter((b: any) => b.type === 'tool_use')
        for (const tool of toolBlocks) {
          win?.webContents.send('agent:tool-start', {
            conversationId,
            toolCall: {
              id: (tool as any).id,
              toolName: (tool as any).name,
              input: (tool as any).input
            }
          })
        }
        break
      }

      case 'stream_event': {
        // Streaming token deltas
        const event = message.event
        if (
          event.type === 'content_block_delta' &&
          (event as any).delta?.type === 'text_delta'
        ) {
          win?.webContents.send('agent:token', {
            conversationId,
            token: (event as any).delta.text
          })
        }
        break
      }

      case 'result': {
        // Final result message
        console.log(
          `[AgentManager] Result: cost_usd=${(message as any).cost_usd}, duration=${(message as any).duration_ms}ms`
        )

        // Save the final result text if present
        if ((message as any).result) {
          const contentBlocks: ContentBlock[] = [
            { type: 'text', text: (message as any).result }
          ]
          const savedMsg = this.db.addMessage(conversationId, 'assistant', contentBlocks)
          win?.webContents.send('agent:complete', { conversationId, message: savedMsg })
        }
        break
      }

      case 'system': {
        // System messages (tool results, status updates)
        const sysMsg = message as any
        if (sysMsg.subtype === 'tool_result') {
          win?.webContents.send('agent:tool-result', {
            conversationId,
            toolCall: {
              id: sysMsg.tool_use_id || '',
              toolName: sysMsg.tool_name || 'unknown',
              output: { content: sysMsg.content },
              status: sysMsg.is_error ? 'error' : 'success',
              durationMs: 0
            }
          })
        }
        break
      }

      default:
        // Log other message types for debugging
        console.log(`[AgentManager] SDK message type=${message.type}`)
        break
    }
  }
}
