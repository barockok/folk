export interface ToolParameter {
  type: string
  description?: string
  enum?: string[]
}

export interface ToolDefinition {
  name: string
  description: string
  parameters?: {
    type: 'object'
    properties: Record<string, ToolParameter>
    required?: string[]
  }
}

export interface AgentToolCall {
  name: string
  arguments: Record<string, unknown>
}

export interface AgentToolResponse {
  name: string
  result: Record<string, unknown>
}

export interface ConversationMessage {
  role: 'user' | 'model'
  content: string
  toolCalls?: AgentToolCall[]
  toolResponses?: AgentToolResponse[]
}

export interface AgentRunResult {
  response: string
  iterations: number
  aborted: boolean
}
