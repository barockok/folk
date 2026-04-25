// Convention:
//   `| null`  — persisted column that always exists but may be empty.
//   `?`       — optional key in an input/DTO/nested-JSON shape.

export type SessionStatus = 'idle' | 'running' | 'error' | 'cancelled'

export interface Session {
  id: string
  title: string
  modelId: string
  workingDir: string
  goal: string | null
  flags: string | null
  status: SessionStatus
  // True once the underlying Claude Code SDK session has been started at least
  // once. First turn passes `sessionId`, subsequent turns pass `resume`.
  claudeStarted: boolean
  createdAt: number
  updatedAt: number
}

export interface SessionConfig {
  title?: string
  modelId: string
  workingDir: string
  goal?: string
  flags?: string
}

export type ProviderAuthMode = 'api-key' | 'claude-code'

export interface ProviderConfig {
  id: string
  name: string
  apiKey: string
  authMode: ProviderAuthMode
  baseUrl: string | null
  models: ModelConfig[]
  isEnabled: boolean
  createdAt: number
}

export interface ClaudeCodeAuthStatus {
  loggedIn: boolean
  source: 'keychain' | 'file' | null
  email: string | null
}

export interface ModelConfig {
  id: string
  label: string
  enabled: boolean
  contextWindow?: number
  maxOutput?: number
}

export type MCPTransport = 'stdio' | 'http'

export interface MCPServer {
  id: string
  name: string
  template: string | null
  transport: MCPTransport
  command: string | null
  args: string[] | null
  env: Record<string, string> | null
  url: string | null
  isEnabled: boolean
  status: 'running' | 'stopped' | 'error'
  lastError: string | null
  toolCount: number | null
  createdAt: number
}

export interface ToolInfo {
  name: string
  description?: string
}

export interface Profile {
  nickname: string
  pronouns: string
  role: string
  tone: string
  avatarColor: string
  about: string
}

export interface Attachment {
  kind: 'image' | 'text' | 'binary'
  name: string
  mimeType: string
  size: number
  dataBase64: string
}

export interface AgentChunk {
  sessionId: string
  text: string
}

export interface AgentToolCall {
  sessionId: string
  callId: string
  tool: string
  input: unknown
}

export interface AgentToolResult {
  sessionId: string
  callId: string
  tool: string
  output: unknown
  isError?: boolean
}

export interface PersistedToolCall {
  callId: string
  tool: string
  input: unknown
  output?: unknown
  isError?: boolean
}

// Ordered units that make up a single message turn — preserves the actual
// arrival order of the model's text / thinking / tool-use output instead of
// flattening them into separate buckets.
export type MessageBlock =
  | { kind: 'text'; text: string }
  | { kind: 'thinking'; text: string }
  | { kind: 'tool'; call: PersistedToolCall }

export interface PersistedMessage {
  id: string
  role: 'user' | 'assistant'
  blocks: MessageBlock[]
  createdAt: number
}

export interface AgentError {
  sessionId: string
  code: 'auth' | 'quota' | 'offline' | 'cancelled' | 'invalid-model' | 'crash' | 'unknown'
  message: string
  retryable: boolean
}

export interface MCPTemplate {
  id: string
  label: string
  command?: string
  baseArgs?: string[]
  transport: MCPTransport
  fields: Array<{ key: string; label: string; placeholder?: string; secret?: boolean }>
}
