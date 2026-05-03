import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { FolkAPI } from '@shared/preload-api'

function listen<T>(channel: string, fn: (e: T) => void): () => void {
  const wrapper = (_e: unknown, payload: T): void => fn(payload)
  ipcRenderer.on(channel, wrapper)
  return () => ipcRenderer.removeListener(channel, wrapper)
}

const folk: FolkAPI = {
  sessions: {
    list: () => ipcRenderer.invoke('sessions:list'),
    get: (id) => ipcRenderer.invoke('sessions:get', id),
    create: (config) => ipcRenderer.invoke('sessions:create', config),
    delete: (id) => ipcRenderer.invoke('sessions:delete', id),
    clear: (id) => ipcRenderer.invoke('sessions:clear', id),
    loadMessages: (id) => ipcRenderer.invoke('sessions:loadMessages', id),
    setPermissionMode: (id, mode) => ipcRenderer.invoke('sessions:setPermissionMode', id, mode),
    setModel: (id, modelId) => ipcRenderer.invoke('sessions:setModel', id, modelId),
    setEnabledMcpIds: (id, mcpIds) => ipcRenderer.invoke('sessions:setEnabledMcpIds', id, mcpIds),
    backfillTitle: (id) => ipcRenderer.invoke('sessions:backfillTitle', id),
    rename: (id, title) => ipcRenderer.invoke('sessions:rename', id, title)
  },
  agent: {
    sendMessage: (sessionId, text, attachments, skillPrompts) =>
      ipcRenderer.invoke('agent:sendMessage', sessionId, text, attachments, skillPrompts),
    cancel: (sessionId) => ipcRenderer.invoke('agent:cancel', sessionId),
    onChunk: (fn) => listen('agent:chunk', fn),
    onThinking: (fn) => listen('agent:thinking', fn),
    onToolCall: (fn) => listen('agent:toolCall', fn),
    onToolResult: (fn) => listen('agent:toolResult', fn),
    onDone: (fn) => listen('agent:done', fn),
    onError: (fn) => listen('agent:error', fn),
    onNotice: (fn) => listen('agent:notice', fn),
    onUsage: (fn) => listen('agent:usage', fn),
    onPermissionRequest: (fn) => listen('agent:permissionRequest', fn),
    onMCPElicitation: (fn) => listen('agent:mcpElicitation', fn),
    respondElicitation: (response) => ipcRenderer.invoke('agent:respondElicitation', response),
    onToolProgress: (fn) => listen('agent:toolProgress', fn),
    onPromptSuggestion: (fn) => listen('agent:promptSuggestion', fn),
    respondPermission: (response) => ipcRenderer.invoke('agent:respondPermission', response),
    respondToolUse: (sessionId, toolUseId, answer) =>
      ipcRenderer.invoke('agent:respondToolUse', sessionId, toolUseId, answer)
  },
  providers: {
    list: () => ipcRenderer.invoke('providers:list'),
    save: (p) => ipcRenderer.invoke('providers:save', p),
    delete: (id) => ipcRenderer.invoke('providers:delete', id),
    test: (id) => ipcRenderer.invoke('providers:test', id),
    fetchModels: (input) => ipcRenderer.invoke('providers:fetchModels', input)
  },
  mcp: {
    list: () => ipcRenderer.invoke('mcpServers:list'),
    save: (s) => ipcRenderer.invoke('mcpServers:save', s),
    delete: (id) => ipcRenderer.invoke('mcpServers:delete', id),
    test: (id) => ipcRenderer.invoke('mcpServers:test', id),
    templates: () => ipcRenderer.invoke('mcpServers:templates'),
    listResources: (id) => ipcRenderer.invoke('mcpServers:listResources', id),
    readResource: (id, uri) => ipcRenderer.invoke('mcpServers:readResource', id, uri),
    listPrompts: (id) => ipcRenderer.invoke('mcpServers:listPrompts', id),
    getPrompt: (id, name, args) => ipcRenderer.invoke('mcpServers:getPrompt', id, name, args),
    signIn: (id) => ipcRenderer.invoke('mcpServers:signIn', id),
    signOut: (id) => ipcRenderer.invoke('mcpServers:signOut', id)
  },
  profile: {
    get: () => ipcRenderer.invoke('profile:get'),
    save: (p) => ipcRenderer.invoke('profile:save', p)
  },
  auth: {
    claudeCodeStatus: () => ipcRenderer.invoke('auth:claudeCodeStatus')
  },
  dialog: {
    openFolder: (defaultPath) => ipcRenderer.invoke('dialog:openFolder', defaultPath)
  },
  shell: {
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url)
  },
  files: {
    read: (path) => ipcRenderer.invoke('files:read', path)
  },
  app: {
    reportTheme: (theme) => ipcRenderer.send('app:theme', theme),
    version: () => ipcRenderer.invoke('app:version'),
    onWindowState: (fn) => listen('app:windowState', fn),
    onOpenTweaks: (fn) => {
      const h = (): void => fn()
      ipcRenderer.on('app:openTweaks', h)
      return () => ipcRenderer.off('app:openTweaks', h)
    },
    onOpenCmdk: (fn) => {
      const h = (): void => fn()
      ipcRenderer.on('app:openCmdk', h)
      return () => ipcRenderer.off('app:openCmdk', h)
    },
    onNewSession: (fn) => {
      const h = (): void => fn()
      ipcRenderer.on('app:newSession', h)
      return () => ipcRenderer.off('app:newSession', h)
    },
    onToggleSidebar: (fn) => {
      const h = (): void => fn()
      ipcRenderer.on('app:toggleSidebar', h)
      return () => ipcRenderer.off('app:toggleSidebar', h)
    }
  },
  updater: {
    check: () => ipcRenderer.invoke('updater:check'),
    quitAndInstall: () => ipcRenderer.invoke('updater:quitAndInstall'),
    onChecking: (fn) => {
      const h = () => fn()
      ipcRenderer.on('updater:checking', h)
      return () => ipcRenderer.off('updater:checking', h)
    },
    onAvailable: (fn) => {
      const h = (_e, p) => fn(p)
      ipcRenderer.on('updater:available', h)
      return () => ipcRenderer.off('updater:available', h)
    },
    onNotAvailable: (fn) => {
      const h = (_e, p) => fn(p)
      ipcRenderer.on('updater:notAvailable', h)
      return () => ipcRenderer.off('updater:notAvailable', h)
    },
    onProgress: (fn) => {
      const h = (_e, p) => fn(p)
      ipcRenderer.on('updater:progress', h)
      return () => ipcRenderer.off('updater:progress', h)
    },
    onDownloaded: (fn) => {
      const h = (_e, p) => fn(p)
      ipcRenderer.on('updater:downloaded', h)
      return () => ipcRenderer.off('updater:downloaded', h)
    },
    onError: (fn) => {
      const h = (_e, p) => fn(p)
      ipcRenderer.on('updater:error', h)
      return () => ipcRenderer.off('updater:error', h)
    }
  },
  discover: {
    skills: (workingDir) => ipcRenderer.invoke('discover:skills', workingDir),
    commands: (workingDir) => ipcRenderer.invoke('discover:commands', workingDir),
    plugins: () => ipcRenderer.invoke('discover:plugins'),
    readCommand: (path) => ipcRenderer.invoke('discover:readCommand', path)
  },
  marketplaces: {
    list: () => ipcRenderer.invoke('marketplaces:list'),
    catalog: () => ipcRenderer.invoke('marketplaces:catalog'),
    addGithub: (input) => ipcRenderer.invoke('marketplaces:addGithub', input),
    addDirectory: (path) => ipcRenderer.invoke('marketplaces:addDirectory', path),
    remove: (name) => ipcRenderer.invoke('marketplaces:remove', name),
    update: (name) => ipcRenderer.invoke('marketplaces:update', name)
  },
  plugins: {
    uninstall: (target) => ipcRenderer.invoke('plugins:uninstall', target)
  }
}

contextBridge.exposeInMainWorld('electron', electronAPI)
contextBridge.exposeInMainWorld('folk', folk)
