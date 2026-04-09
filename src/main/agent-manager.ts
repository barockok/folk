import { EventEmitter } from 'events'
import { app, BrowserWindow } from 'electron'
import type { DatabaseManager } from './database'
import type { ContentBlock } from '../shared/types'
import { InferenceManager } from './inference-manager'
import { AgentLoop } from './agent/agent-loop'
import { getFolkToolDefinitions, executeFolkTool } from './agent/folk-tools'
import type { AgentToolCall, AgentToolResponse } from './agent/types'

interface AgentManagerConfig {
  db: DatabaseManager
  getMainWindow: () => BrowserWindow | null
}

const SYSTEM_PROMPT = `You are Folk, a helpful AI assistant running entirely on the user's device.
You have tools to read files, write files, list directories, run shell commands, and search.
Use tools when needed to help the user. Be concise and helpful.
When asked to create or modify files, use the write_file tool.
When asked about files or code, use read_file or search tools first.`

export class AgentManager extends EventEmitter {
  private db: DatabaseManager
  private getMainWindow: () => BrowserWindow | null
  private inference: InferenceManager
  private agentLoops: Map<string, AgentLoop> = new Map()

  constructor(config: AgentManagerConfig) {
    super()
    this.db = config.db
    this.getMainWindow = config.getMainWindow
    this.inference = new InferenceManager()
  }

  async initialize(): Promise<void> {
    console.log('[AgentManager] Initializing inference engine...')
    await this.inference.initialize()

    // Forward status to renderer
    this.inference.on('status', (status) => {
      const win = this.getMainWindow()
      let mappedStatus: string
      if (status === 'ready') mappedStatus = 'ready'
      else if (status === 'loading') mappedStatus = 'starting'
      else if (status === 'error') mappedStatus = 'error'
      else mappedStatus = 'stopped'
      win?.webContents.send('llama:status-change', mappedStatus)
    })

    this.inference.on('download-progress', (progress) => {
      const win = this.getMainWindow()
      win?.webContents.send('model:download-progress', progress)
    })

    // Load the model
    console.log('[AgentManager] Loading Gemma 4 model via WebGPU...')
    await this.inference.loadModel()
    console.log('[AgentManager] Model loaded and ready')
  }

  async handleMessage(conversationId: string, userContent: string): Promise<void> {
    console.log(
      `[AgentManager] handleMessage conv=${conversationId} content="${userContent.slice(0, 80)}"`
    )

    const win = this.getMainWindow()

    // Save user message
    this.db.addMessage(conversationId, 'user', [{ type: 'text', text: userContent }])
    this.db.updateConversationTimestamp(conversationId)

    // Auto-title
    const allMessages = this.db.getMessages(conversationId)
    if (allMessages.length === 1) {
      const title = userContent.length > 50 ? userContent.slice(0, 47) + '...' : userContent
      this.db.renameConversation(conversationId, title)
    }

    // Get workspace
    const conv = this.db.getConversation(conversationId)
    const workspacePath =
      conv?.workspacePath ||
      (this.db.getSetting('workspacePath') as string) ||
      app.getPath('home')

    // Wait for model to be ready (may still be loading on first launch)
    if (this.inference.getStatus() !== 'ready') {
      console.log('[AgentManager] Waiting for model to finish loading...')
      win?.webContents.send('agent:token', { conversationId, token: '_Loading AI model, please wait..._\n\n' })
      await this.inference.waitForReady()
      console.log('[AgentManager] Model ready, proceeding')
    }

    // Get or create agent loop for this conversation
    let loop = this.agentLoops.get(conversationId)
    if (!loop) {
      loop = new AgentLoop({
        inference: this.inference,
        tools: getFolkToolDefinitions(),
        systemPrompt: SYSTEM_PROMPT,
        onToken: (token) => {
          win?.webContents.send('agent:token', { conversationId, token })
        },
        onToolStart: (call) => {
          win?.webContents.send('agent:tool-start', {
            conversationId,
            toolCall: {
              id: `tc-${Date.now()}`,
              toolName: call.name,
              input: call.arguments
            }
          })
        },
        onToolResult: (call, response) => {
          win?.webContents.send('agent:tool-result', {
            conversationId,
            toolCall: {
              id: `tc-${Date.now()}`,
              toolName: call.name,
              output: response.result,
              status: response.result.error ? 'error' : 'success',
              durationMs: 0
            }
          })
          // Create artifact for file writes
          if (call.name === 'write_file') {
            win?.webContents.send('agent:artifact', {
              conversationId,
              artifact: {
                id: `art-${Date.now()}`,
                conversationId,
                messageId: null,
                type: 'file',
                title: (call.arguments.path as string).split('/').pop() || 'file',
                content: call.arguments.content as string,
                filePath: call.arguments.path as string,
                language: null,
                createdAt: Date.now()
              }
            })
          }
        },
        executeToolCall: async (call: AgentToolCall): Promise<AgentToolResponse> => {
          return executeFolkTool(call, workspacePath)
        }
      })
      this.agentLoops.set(conversationId, loop)
    }

    try {
      const result = await loop.run(userContent)

      if (result.response) {
        const contentBlocks: ContentBlock[] = [{ type: 'text', text: result.response }]
        const savedMsg = this.db.addMessage(conversationId, 'assistant', contentBlocks)
        win?.webContents.send('agent:complete', { conversationId, message: savedMsg })
      } else {
        win?.webContents.send('agent:complete', { conversationId, message: null })
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[AgentManager] Error:', err)
      win?.webContents.send('agent:error', { conversationId, error: message })
    }
  }

  stop(conversationId: string): void {
    const loop = this.agentLoops.get(conversationId)
    if (loop) loop.abort()
  }

  async closeAll(): Promise<void> {
    for (const [, loop] of this.agentLoops) {
      loop.abort()
    }
    this.agentLoops.clear()
    await this.inference.close()
  }
}
