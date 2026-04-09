export interface Conversation {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  workspacePath: string | null
  isArchived: boolean
}

export interface Message {
  id: string
  conversationId: string
  role: 'user' | 'assistant' | 'system'
  content: ContentBlock[]
  createdAt: number
  tokenCount: number | null
}

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; toolUseId: string; content: string; isError?: boolean }

export interface ToolCall {
  id: string
  messageId: string
  toolName: string
  input: Record<string, unknown> | null
  output: Record<string, unknown> | null
  status: 'running' | 'success' | 'error'
  startedAt: number
  completedAt: number | null
  durationMs: number | null
}

export interface Artifact {
  id: string
  conversationId: string
  messageId: string | null
  type: 'file' | 'code' | 'markdown' | 'image'
  title: string
  content: string | null
  filePath: string | null
  language: string | null
  createdAt: number
}

export interface MCPServer {
  id: string
  name: string
  transport: 'stdio' | 'sse'
  command: string | null
  url: string | null
  args: string[] | null
  env: Record<string, string> | null
  headers: Record<string, string> | null
  enabled: boolean
  createdAt: number
}

export interface ModelInfo {
  name: string
  path: string
  sizeBytes: number
  quantization: string
  contextSize: number
}

export type LlamaStatus = 'starting' | 'ready' | 'error' | 'stopped'

export interface ModelDownloadProgress {
  modelId: string
  percent: number
  file: string
}

export interface ToolCallStart {
  id: string
  toolName: string
  input: Record<string, unknown>
}

export interface ToolCallResult {
  id: string
  toolName: string
  output: Record<string, unknown>
  status: 'success' | 'error'
  durationMs: number
}

export interface FolkAPI {
  sendMessage: (conversationId: string, content: string) => Promise<void>
  stopAgent: (conversationId: string) => Promise<void>
  createConversation: () => Promise<Conversation>
  listConversations: () => Promise<Conversation[]>
  deleteConversation: (id: string) => Promise<void>
  renameConversation: (id: string, title: string) => Promise<void>
  getMessages: (conversationId: string) => Promise<Message[]>
  getSetting: (key: string) => Promise<unknown>
  setSetting: (key: string, value: unknown) => Promise<void>
  listMCPServers: () => Promise<MCPServer[]>
  addMCPServer: (config: Omit<MCPServer, 'id' | 'createdAt'>) => Promise<MCPServer>
  removeMCPServer: (id: string) => Promise<void>
  testMCPConnection: (id: string) => Promise<{ ok: boolean; error?: string }>
  discoverMCPOAuth: (serverUrl: string) => Promise<{ authorization_endpoint: string; token_endpoint: string } | null>
  authorizeMCP: (serverId: string, serverUrl: string) => Promise<{ success: boolean }>
  getModelInfo: () => Promise<ModelInfo | null>
  changeModel: (path: string) => Promise<void>
  downloadModelById: (modelId: string) => Promise<void>
  cancelModelDownload: () => Promise<void>
  setActiveModel: (modelId: string) => Promise<void>
  getActiveModel: () => Promise<string | null>
  getDownloadedModels: () => Promise<string[]>
  selectWorkspace: () => Promise<string | null>
  getCurrentWorkspace: () => Promise<string>
  getLlamaStatus: () => Promise<LlamaStatus>
  getAppVersion: () => Promise<string>
  exportConversation: (conversationId: string) => Promise<void>
  openFileDialog: (options?: { filters?: { name: string; extensions: string[] }[] }) => Promise<string[]>
  onToken: (callback: (data: { conversationId: string; token: string }) => void) => () => void
  onToolStart: (callback: (data: { conversationId: string; toolCall: ToolCallStart }) => void) => () => void
  onToolResult: (callback: (data: { conversationId: string; toolCall: ToolCallResult }) => void) => () => void
  onArtifact: (callback: (data: { conversationId: string; artifact: Artifact }) => void) => () => void
  onAgentComplete: (callback: (data: { conversationId: string; message: Message }) => void) => () => void
  onAgentError: (callback: (data: { conversationId: string; error: string }) => void) => () => void
  onModelDownloadProgress: (callback: (data: ModelDownloadProgress) => void) => () => void
  onModelDownloadComplete: (callback: (data: { modelId: string }) => void) => () => void
  onModelDownloadError: (callback: (data: { modelId: string; error: string }) => void) => () => void
  onLlamaStatusChange: (callback: (status: LlamaStatus) => void) => () => void
}
