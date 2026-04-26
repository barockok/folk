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
    loadMessages: (id) => ipcRenderer.invoke('sessions:loadMessages', id),
    setPermissionMode: (id, mode) => ipcRenderer.invoke('sessions:setPermissionMode', id, mode),
    setModel: (id, modelId) => ipcRenderer.invoke('sessions:setModel', id, modelId),
    backfillTitle: (id) => ipcRenderer.invoke('sessions:backfillTitle', id),
    rename: (id, title) => ipcRenderer.invoke('sessions:rename', id, title)
  },
  agent: {
    sendMessage: (sessionId, text, attachments) =>
      ipcRenderer.invoke('agent:sendMessage', sessionId, text, attachments),
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
    test: (id) => ipcRenderer.invoke('providers:test', id)
  },
  mcp: {
    list: () => ipcRenderer.invoke('mcpServers:list'),
    save: (s) => ipcRenderer.invoke('mcpServers:save', s),
    delete: (id) => ipcRenderer.invoke('mcpServers:delete', id),
    test: (id) => ipcRenderer.invoke('mcpServers:test', id),
    templates: () => ipcRenderer.invoke('mcpServers:templates')
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
    remove: (name) => ipcRenderer.invoke('marketplaces:remove', name)
  },
  plugins: {
    uninstall: (target) => ipcRenderer.invoke('plugins:uninstall', target)
  }
}

contextBridge.exposeInMainWorld('electron', electronAPI)
contextBridge.exposeInMainWorld('folk', folk)
