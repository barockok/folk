import type {
  Session,
  SessionConfig,
  ProviderConfig,
  ModelConfig,
  MCPServer,
  MCPTemplate,
  Profile,
  Attachment,
  ToolInfo,
  AgentChunk,
  AgentToolCall,
  AgentToolResult,
  AgentError,
  AgentNotice,
  AgentUsage,
  AgentToolProgress,
  AgentPromptSuggestion,
  PermissionRequest,
  PermissionResponse,
  MCPElicitationRequest,
  MCPElicitationResponse,
  ClaudeCodeAuthStatus,
  PersistedMessage,
  PermissionMode,
  DiscoveredSkill,
  DiscoveredCommand,
  DiscoveredPlugin,
  MarketplaceSummary,
  MarketplacePlugin,
  MCPResource,
  MCPResourceContent,
  MCPPrompt,
  MCPPromptMessage
} from './types'

export interface FolkAPI {
  sessions: {
    list: () => Promise<Session[]>
    get: (id: string) => Promise<Session | null>
    create: (config: SessionConfig) => Promise<Session>
    delete: (id: string) => Promise<void>
    loadMessages: (id: string) => Promise<PersistedMessage[]>
    setPermissionMode: (id: string, mode: PermissionMode) => Promise<Session>
    setModel: (id: string, modelId: string) => Promise<Session>
    backfillTitle: (id: string) => Promise<Session | null>
    rename: (id: string, title: string) => Promise<Session>
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
    onNotice: (fn: (e: AgentNotice) => void) => () => void
    onUsage: (fn: (e: AgentUsage) => void) => () => void
    onPermissionRequest: (fn: (e: PermissionRequest) => void) => () => void
    onMCPElicitation: (fn: (e: MCPElicitationRequest) => void) => () => void
    respondElicitation: (response: MCPElicitationResponse) => Promise<void>
    onToolProgress: (fn: (e: AgentToolProgress) => void) => () => void
    onPromptSuggestion: (fn: (e: AgentPromptSuggestion) => void) => () => void
    respondPermission: (response: PermissionResponse) => Promise<void>
    respondToolUse: (sessionId: string, toolUseId: string, answer: string) => Promise<void>
  }
  providers: {
    list: () => Promise<ProviderConfig[]>
    save: (p: ProviderConfig) => Promise<void>
    delete: (id: string) => Promise<void>
    test: (id: string) => Promise<{ ok: boolean; error?: string }>
    fetchModels: (input: {
      presetId: string
      apiKey?: string
      baseUrl?: string
    }) => Promise<{ ok: boolean; models: ModelConfig[]; error?: string }>
  }
  mcp: {
    list: () => Promise<MCPServer[]>
    save: (s: MCPServer) => Promise<void>
    delete: (id: string) => Promise<void>
    test: (id: string) => Promise<{ ok: boolean; tools: ToolInfo[]; error?: string }>
    templates: () => Promise<Record<string, MCPTemplate>>
    listResources: (
      id: string
    ) => Promise<{ ok: boolean; resources: MCPResource[]; error?: string }>
    readResource: (
      id: string,
      uri: string
    ) => Promise<{ ok: boolean; contents: MCPResourceContent[]; error?: string }>
    listPrompts: (
      id: string
    ) => Promise<{ ok: boolean; prompts: MCPPrompt[]; error?: string }>
    getPrompt: (
      id: string,
      name: string,
      args?: Record<string, string>
    ) => Promise<{
      ok: boolean
      description?: string
      messages: MCPPromptMessage[]
      error?: string
    }>
    signIn: (id: string) => Promise<{ ok: boolean; error?: string }>
    signOut: (id: string) => Promise<{ ok: boolean; error?: string }>
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
  discover: {
    skills: (workingDir?: string) => Promise<DiscoveredSkill[]>
    commands: (workingDir?: string) => Promise<DiscoveredCommand[]>
    plugins: () => Promise<DiscoveredPlugin[]>
    readCommand: (path: string) => Promise<string | { error: string }>
  }
  marketplaces: {
    list: () => Promise<MarketplaceSummary[]>
    catalog: () => Promise<MarketplacePlugin[]>
    addGithub: (input: string) => Promise<{ ok: boolean; name?: string; error?: string }>
    addDirectory: (path: string) => Promise<{ ok: boolean; name?: string; error?: string }>
    remove: (name: string) => Promise<{ ok: boolean; error?: string }>
    update: (name: string) => Promise<{ ok: boolean; pluginCount?: number; error?: string }>
  }
  plugins: {
    uninstall: (target: {
      name: string
      marketplace: string
      scope: 'user' | 'project'
      projectPath?: string
    }) => Promise<{ ok: boolean; error?: string }>
  }
}
