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
    clear: (id: string) => Promise<Session>
    loadMessages: (id: string) => Promise<PersistedMessage[]>
    setPermissionMode: (id: string, mode: PermissionMode) => Promise<Session>
    setModel: (id: string, modelId: string) => Promise<Session>
    setEnabledMcpIds: (id: string, mcpIds: string[] | null) => Promise<Session>
    backfillTitle: (id: string) => Promise<Session | null>
    rename: (id: string, title: string) => Promise<Session>
  }
  agent: {
    sendMessage: (sessionId: string, text: string, attachments?: Attachment[], skillPrompts?: string[]) => Promise<void>
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
    claudeLogin: () => Promise<{ ok: boolean; error?: string }>
  }
  dialog: {
    openFolder: (defaultPath?: string) => Promise<string | null>
  }
  shell: {
    openExternal: (url: string) => Promise<{ ok: boolean }>
  }
  files: {
    read: (path: string) => Promise<
      | { ok: true; path: string; size: number; mtimeMs: number; kind: 'text' | 'binary' | 'image' | 'video' | 'audio' | 'pdf' | 'too-large'; content: string | null }
      | { ok: false; error: string }
    >
  }
  app: {
    reportTheme: (theme: 'light' | 'dark') => void
    version: () => Promise<string>
    onWindowState: (fn: (state: 'blurred' | 'focused') => void) => () => void
    onOpenTweaks: (fn: () => void) => () => void
    onOpenCmdk: (fn: () => void) => () => void
    onNewSession: (fn: () => void) => () => void
    onToggleSidebar: (fn: () => void) => () => void
  }
  updater: {
    check: () => Promise<{ ok: boolean; version?: string | null; error?: string }>
    quitAndInstall: () => Promise<{ ok: boolean }>
    onChecking: (fn: () => void) => () => void
    onAvailable: (fn: (e: { version: string; releaseDate?: string; releaseNotes: string | null }) => void) => () => void
    onNotAvailable: (fn: (e: { version: string }) => void) => () => void
    onProgress: (fn: (e: { percent: number; bytesPerSecond: number; transferred: number; total: number }) => void) => () => void
    onDownloaded: (fn: (e: { version: string }) => void) => () => void
    onError: (fn: (e: { message: string }) => void) => () => void
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
