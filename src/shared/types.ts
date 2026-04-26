// Convention:
//   `| null`  — persisted column that always exists but may be empty.
//   `?`       — optional key in an input/DTO/nested-JSON shape.

export type SessionStatus = 'idle' | 'running' | 'error' | 'cancelled'

// Mirrors the SDK `PermissionMode` so folk can persist + show the same modes.
// 'default' = prompt on first use, 'acceptEdits' = silently allow file edits,
// 'plan' = read-only plan mode, 'bypassPermissions' = nothing prompts.
export type PermissionMode =
  | 'default'
  | 'acceptEdits'
  | 'plan'
  | 'bypassPermissions'

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
  permissionMode: PermissionMode
  createdAt: number
  updatedAt: number
}

export interface SessionConfig {
  title?: string
  modelId: string
  workingDir: string
  goal?: string
  flags?: string
  permissionMode?: PermissionMode
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
  // When non-null, this tool_use was emitted by a subagent dispatched via the
  // parent's `Task` (or similar) call — render it nested inside that parent.
  parentCallId?: string | null
}

export interface AgentToolResult {
  sessionId: string
  callId: string
  tool: string
  output: unknown
  isError?: boolean
  parentCallId?: string | null
}

export interface PersistedToolCall {
  callId: string
  tool: string
  input: unknown
  output?: unknown
  isError?: boolean
  // Nested tool calls from a subagent (Task tool dispatch). Mirrors the
  // SDK's parent_tool_use_id envelope linkage.
  children?: PersistedToolCall[]
  // Live elapsed seconds reported by the SDK while a tool is running. Cleared
  // / ignored once the result lands.
  elapsedSeconds?: number
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

export interface PermissionRequest {
  sessionId: string
  requestId: string
  toolName: string
  toolUseID: string
  input: Record<string, unknown>
  title?: string
  description?: string
  displayName?: string
  blockedPath?: string
  decisionReason?: string
}

export type PermissionResponse =
  | { requestId: string; behavior: 'allow'; allowAlways?: boolean }
  | { requestId: string; behavior: 'deny'; message?: string }

export interface AgentUsage {
  sessionId: string
  totalCostUsd: number
  durationMs: number
  numTurns: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreateTokens: number
}

// Out-of-band events from the SDK that aren't user/assistant messages but
// should leave a visible mark in the transcript (compaction, retries, rate
// limits, ad-hoc info dumps from /cost / /status).
export interface AgentNotice {
  sessionId: string
  kind: 'compact_boundary' | 'api_retry' | 'rate_limit' | 'info' | 'lifecycle'
  text?: string
}

export interface AgentToolProgress {
  sessionId: string
  callId: string
  elapsedSeconds: number
}

export interface AgentPromptSuggestion {
  sessionId: string
  suggestion: string
}

export interface AgentError {
  sessionId: string
  code: 'auth' | 'quota' | 'offline' | 'cancelled' | 'invalid-model' | 'crash' | 'unknown'
  message: string
  retryable: boolean
}

export interface DiscoveredSkill {
  id: string
  name: string
  description: string
  scope: 'user' | 'project'
  path: string
}

export interface DiscoveredCommand {
  name: string
  description: string
  scope: 'user' | 'project' | 'plugin'
  path: string
  // For plugin-scoped commands, the plugin name (used in slash menu badges).
  plugin?: string
}

export interface DiscoveredPlugin {
  id: string
  name: string
  marketplace: string
  version: string
  scope: 'user' | 'project'
  projectPath: string | null
  installPath: string
  description: string
  lastUpdated: string | null
}

export interface MarketplaceSummary {
  name: string
  description: string
  source: { source: 'github' | 'directory' | 'url'; repo?: string; path?: string; url?: string }
  installLocation: string
  lastUpdated: string | null
  pluginCount: number
}

export interface MarketplacePlugin {
  id: string
  marketplace: string
  name: string
  description: string
  category: string
  author: string
  homepage: string | null
  installed: boolean
}

export interface MCPTemplate {
  id: string
  label: string
  command?: string
  baseArgs?: string[]
  transport: MCPTransport
  fields: Array<{ key: string; label: string; placeholder?: string; secret?: boolean }>
}
