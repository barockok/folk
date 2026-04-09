import type { InferenceManager } from '../inference-manager'
import { buildPrompt } from './prompt-builder'
import { parseToolCalls, hasToolCalls, extractThinking, extractFinalResponse } from './tool-parser'
import type {
  ToolDefinition,
  AgentToolCall,
  AgentToolResponse,
  ConversationMessage,
  AgentRunResult
} from './types'

const MAX_ITERATIONS = 10

interface AgentLoopOptions {
  inference: InferenceManager
  tools: ToolDefinition[]
  systemPrompt: string
  maxIterations?: number
  onToken?: (token: string) => void
  onToolStart?: (call: AgentToolCall) => void
  onToolResult?: (call: AgentToolCall, response: AgentToolResponse) => void
  executeToolCall: (call: AgentToolCall) => Promise<AgentToolResponse>
}

export class AgentLoop {
  private options: AgentLoopOptions
  private history: ConversationMessage[] = []
  private aborted = false

  constructor(options: AgentLoopOptions) {
    this.options = options
  }

  abort(): void {
    this.aborted = true
    this.options.inference.abort()
  }

  getHistory(): ConversationMessage[] {
    return [...this.history]
  }

  clearHistory(): void {
    this.history = []
  }

  async run(userMessage: string): Promise<AgentRunResult> {
    this.aborted = false

    // Add user message to history
    this.history.push({ role: 'user', content: userMessage })

    const maxIterations = this.options.maxIterations || MAX_ITERATIONS
    let iterations = 0
    let finalResponse = ''

    for (let i = 0; i < maxIterations; i++) {
      if (this.aborted) break
      iterations++

      // Build prompt with tool declarations
      const prompt = buildPrompt(
        this.options.systemPrompt,
        this.options.tools,
        this.history,
        false // thinking disabled for now
      )

      // Generate response
      let accumulated = ''
      const output = await this.options.inference.generate(prompt, {
        maxTokens: 2048,
        onToken: (token) => {
          accumulated += token
          // Only stream non-tool-call tokens to UI
          if (!hasToolCalls(accumulated)) {
            this.options.onToken?.(token)
          }
        }
      })

      // Check for tool calls in the output
      const { rest } = extractThinking(output)
      const toolCalls = parseToolCalls(rest)

      if (toolCalls.length === 0) {
        // No tool calls — this is the final response
        finalResponse = extractFinalResponse(output)
        this.history.push({ role: 'model', content: finalResponse })
        break
      }

      // Execute tool calls
      const toolResponses: AgentToolResponse[] = []
      for (const call of toolCalls) {
        if (this.aborted) break

        this.options.onToolStart?.(call)
        const response = await this.options.executeToolCall(call)
        toolResponses.push(response)
        this.options.onToolResult?.(call, response)
      }

      // Add to history
      this.history.push({
        role: 'model',
        content: extractFinalResponse(output),
        toolCalls,
        toolResponses
      })

      // If last iteration, extract whatever we have
      if (i === maxIterations - 1) {
        finalResponse = extractFinalResponse(output)
      }
    }

    return {
      response: finalResponse,
      iterations,
      aborted: this.aborted
    }
  }
}
