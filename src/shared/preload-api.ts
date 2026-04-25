import type {
  Session,
  SessionConfig,
  ProviderConfig,
  MCPServer,
  MCPTemplate,
  Profile,
  Attachment,
  ToolInfo,
  AgentChunk,
  AgentToolCall,
  AgentToolResult,
  AgentError,
  ClaudeCodeAuthStatus,
  PersistedMessage
} from './types'

export interface FolkAPI {
  sessions: {
    list: () => Promise<Session[]>
    get: (id: string) => Promise<Session | null>
    create: (config: SessionConfig) => Promise<Session>
    delete: (id: string) => Promise<void>
    loadMessages: (id: string) => Promise<PersistedMessage[]>
  }
  agent: {
    sendMessage: (sessionId: string, text: string, attachments?: Attachment[]) => Promise<void>
    cancel: (sessionId: string) => Promise<void>
    onChunk: (fn: (e: AgentChunk) => void) => () => void
    onThinking: (fn: (e: AgentChunk) => void) => () => void
    onToolCall: (fn: (e: AgentToolCall) => void) => () => void
    onToolResult: (fn: (e: AgentToolResult) => void) => () => void
    onDone: (fn: (e: { sessionId: string }) => void) => () => void
    onError: (fn: (e: AgentError) => void) => () => void
  }
  providers: {
    list: () => Promise<ProviderConfig[]>
    save: (p: ProviderConfig) => Promise<void>
    delete: (id: string) => Promise<void>
    test: (id: string) => Promise<{ ok: boolean; error?: string }>
  }
  mcp: {
    list: () => Promise<MCPServer[]>
    save: (s: MCPServer) => Promise<void>
    delete: (id: string) => Promise<void>
    test: (id: string) => Promise<{ ok: boolean; tools: ToolInfo[]; error?: string }>
    templates: () => Promise<Record<string, MCPTemplate>>
  }
  profile: {
    get: () => Promise<Profile>
    save: (p: Profile) => Promise<void>
  }
  auth: {
    claudeCodeStatus: () => Promise<ClaudeCodeAuthStatus>
  }
  dialog: {
    openFolder: (defaultPath?: string) => Promise<string | null>
  }
}
