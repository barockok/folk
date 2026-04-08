import { EventEmitter } from 'events'
import Anthropic from '@anthropic-ai/sdk'
import type { BrowserWindow } from 'electron'
import type { DatabaseManager } from './database'
import type { FileSystemTools, FileToolResult } from './tools/file-system'
import type { SystemInfoTool, SystemInfoResult } from './tools/system-info'
import type { ContentBlock } from '../shared/types'

interface AgentManagerConfig {
  baseUrl: string
  db: DatabaseManager
  fileTools: FileSystemTools
  systemInfoTool: SystemInfoTool
  getMainWindow: () => BrowserWindow | null
}

const MAX_ITERATIONS = 20

export class AgentManager extends EventEmitter {
  private client: Anthropic
  private db: DatabaseManager
  private fileTools: FileSystemTools
  private systemInfoTool: SystemInfoTool
  private getMainWindow: () => BrowserWindow | null
  private abortControllers: Map<string, AbortController> = new Map()

  constructor(config: AgentManagerConfig) {
    super()
    this.client = new Anthropic({
      baseURL: config.baseUrl,
      apiKey: 'local-no-key-needed'
    })
    this.db = config.db
    this.fileTools = config.fileTools
    this.systemInfoTool = config.systemInfoTool
    this.getMainWindow = config.getMainWindow
  }

  updateBaseUrl(url: string): void {
    this.client = new Anthropic({
      baseURL: url,
      apiKey: 'local-no-key-needed'
    })
  }

  async handleMessage(conversationId: string, userContent: string): Promise<void> {
    console.log(`[AgentManager] handleMessage called for conversation=${conversationId}, content="${userContent.slice(0, 50)}"`)

    // Save user message
    const userBlocks: ContentBlock[] = [{ type: 'text', text: userContent }]
    this.db.addMessage(conversationId, 'user', userBlocks)
    this.db.updateConversationTimestamp(conversationId)

    // Auto-title on first message
    const messages = this.db.getMessages(conversationId)
    if (messages.length === 1) {
      this.autoTitle(conversationId, userContent)
    }

    // Load full conversation history
    const history = this.db.getMessages(conversationId)
    console.log(`[AgentManager] Loaded ${history.length} messages from history`)
    const apiMessages = history.map((msg) => ({
      role: msg.role as 'user' | 'assistant',
      content: this.toApiContent(msg.content)
    }))

    // Create abort controller
    const controller = new AbortController()
    this.abortControllers.set(conversationId, controller)

    try {
      await this.agentLoop(conversationId, apiMessages, controller.signal)
      console.log(`[AgentManager] agentLoop completed successfully`)
    } catch (err) {
      console.error(`[AgentManager] Error in agentLoop:`, err)
      if ((err as Error).name === 'AbortError') {
        return
      }
      const errorMessage = err instanceof Error ? err.message : String(err)
      this.sendIPC('agent:error', { conversationId, error: errorMessage })
    } finally {
      this.abortControllers.delete(conversationId)
    }
  }

  stop(conversationId: string): void {
    const controller = this.abortControllers.get(conversationId)
    if (controller) {
      controller.abort()
      this.abortControllers.delete(conversationId)
    }
  }

  private async agentLoop(
    conversationId: string,
    messages: Array<{ role: 'user' | 'assistant'; content: unknown }>,
    signal: AbortSignal
  ): Promise<void> {
    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      if (signal.aborted) return

      console.log(`[AgentManager] agentLoop iteration=${iteration}, messages=${messages.length}`)
      console.log(`[AgentManager] Calling API at baseURL=${this.client.baseURL}`)

      const requestParams = {
        model: 'gemma-4-e4b',
        max_tokens: 4096,
        system: this.getSystemPrompt(),
        messages: messages as Anthropic.MessageParam[],
        tools: [
          ...this.fileTools.getToolDefinitions(),
          ...this.systemInfoTool.getToolDefinitions()
        ] as Anthropic.Tool[]
      }

      console.log(`[AgentManager] Request tools: ${requestParams.tools.map(t => t.name).join(', ')}`)

      const stream = this.client.messages.stream(requestParams)

      stream.on('error', (err) => {
        console.error(`[AgentManager] Stream error:`, err)
      })

      // Stream text tokens
      stream.on('text', (text) => {
        if (!signal.aborted) {
          this.sendIPC('agent:token', { conversationId, token: text })
        }
      })

      let finalMessage: Anthropic.Message
      try {
        finalMessage = await stream.finalMessage()
        console.log(`[AgentManager] Got finalMessage, stop_reason=${finalMessage.stop_reason}, content_blocks=${finalMessage.content.length}`)
      } catch (streamErr) {
        console.error(`[AgentManager] stream.finalMessage() failed:`, streamErr)
        throw streamErr
      }

      if (signal.aborted) return

      // Build ContentBlock array from the response
      const assistantBlocks: ContentBlock[] = finalMessage.content.map((block) => {
        if (block.type === 'text') {
          return { type: 'text' as const, text: block.text }
        }
        if (block.type === 'tool_use') {
          return {
            type: 'tool_use' as const,
            id: block.id,
            name: block.name,
            input: block.input as Record<string, unknown>
          }
        }
        return { type: 'text' as const, text: '' }
      })

      // Save assistant message
      const assistantMessage = this.db.addMessage(
        conversationId,
        'assistant',
        assistantBlocks,
        finalMessage.usage?.output_tokens ?? null
      )

      // Check for tool use
      const toolUseBlocks = finalMessage.content.filter((block) => block.type === 'tool_use')

      if (toolUseBlocks.length === 0 || finalMessage.stop_reason === 'end_turn') {
        // No tools or end_turn: we're done
        const completeMessage = this.db.getMessages(conversationId).at(-1)
        this.sendIPC('agent:complete', {
          conversationId,
          message: completeMessage ?? assistantMessage
        })
        return
      }

      // Execute tools
      const toolResultBlocks: ContentBlock[] = []

      for (const toolBlock of toolUseBlocks) {
        if (toolBlock.type !== 'tool_use') continue
        if (signal.aborted) return

        // Notify tool start
        this.sendIPC('agent:tool-start', {
          conversationId,
          toolCall: {
            id: toolBlock.id,
            toolName: toolBlock.name,
            input: toolBlock.input as Record<string, unknown>
          }
        })

        // Execute the tool
        const startTime = Date.now()
        let result: FileToolResult | SystemInfoResult
        if (toolBlock.name === 'system_info') {
          result = this.systemInfoTool.executeTool(toolBlock.name)
        } else {
          result = await this.fileTools.executeTool(
            toolBlock.name,
            toolBlock.input as Record<string, unknown>
          )
        }
        const durationMs = Date.now() - startTime

        // Save tool call to DB
        const toolCall = this.db.addToolCall(
          assistantMessage.id,
          toolBlock.name,
          toolBlock.input as Record<string, unknown>
        )
        this.db.completeToolCall(
          toolCall.id,
          result.data as Record<string, unknown> | null,
          result.success ? 'success' : 'error'
        )

        // Notify tool result
        this.sendIPC('agent:tool-result', {
          conversationId,
          toolCall: {
            id: toolBlock.id,
            toolName: toolBlock.name,
            output: result.data ?? { error: result.error },
            status: result.success ? 'success' : 'error',
            durationMs
          }
        })

        // Create artifact for write/create operations
        if (
          result.success &&
          (toolBlock.name === 'write_file' || toolBlock.name === 'create_file')
        ) {
          const input = toolBlock.input as Record<string, unknown>
          const filePath = input.path as string
          const ext = filePath.split('.').pop() ?? ''
          const artifact = this.db.addArtifact(
            conversationId,
            assistantMessage.id,
            'file',
            filePath,
            (input.content as string) ?? null,
            filePath,
            ext
          )
          this.sendIPC('agent:artifact', { conversationId, artifact })
        }

        // Build tool_result content block
        toolResultBlocks.push({
          type: 'tool_result' as const,
          toolUseId: toolBlock.id,
          content: JSON.stringify(result.success ? result.data : { error: result.error }),
          isError: !result.success
        })
      }

      // Save tool results as a user message (required by the API)
      this.db.addMessage(conversationId, 'user', toolResultBlocks)

      // Append assistant and tool result messages for next iteration
      messages.push({
        role: 'assistant',
        content: finalMessage.content
      })
      messages.push({
        role: 'user',
        content: toolResultBlocks.map((block) => {
          if (block.type === 'tool_result') {
            return {
              type: 'tool_result' as const,
              tool_use_id: block.toolUseId,
              content: block.content,
              is_error: block.isError
            }
          }
          return block
        })
      })
    }

    // Max iterations reached
    this.sendIPC('agent:error', {
      conversationId,
      error: 'Agent reached maximum iteration limit'
    })
  }

  private getSystemPrompt(): string {
    return `You are Folk, a helpful AI assistant running locally on the user's machine. You have access to file system tools that let you read, write, create, and list files within the user's workspace.

When working with files:
- Always use relative paths from the workspace root
- Be careful with file modifications — confirm destructive changes when appropriate
- Provide clear explanations of what you're doing and why

You run entirely locally — no data leaves the user's machine. Be concise, helpful, and accurate.`
  }

  private autoTitle(conversationId: string, firstMessage: string): void {
    const maxLength = 50
    let title = firstMessage.replace(/\n/g, ' ').trim()
    if (title.length > maxLength) {
      title = title.substring(0, maxLength - 3) + '...'
    }
    if (title.length === 0) {
      title = 'New Conversation'
    }
    this.db.renameConversation(conversationId, title)
  }

  private sendIPC(channel: string, data: unknown): void {
    const win = this.getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, data)
    }
  }

  private toApiContent(
    blocks: ContentBlock[]
  ): Array<Record<string, unknown>> {
    return blocks.map((block) => {
      if (block.type === 'text') {
        return { type: 'text', text: block.text }
      }
      if (block.type === 'tool_use') {
        return {
          type: 'tool_use',
          id: block.id,
          name: block.name,
          input: block.input
        }
      }
      if (block.type === 'tool_result') {
        return {
          type: 'tool_result',
          tool_use_id: block.toolUseId,
          content: block.content,
          is_error: block.isError
        }
      }
      return { type: 'text', text: '' }
    })
  }
}
