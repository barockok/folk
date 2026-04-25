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
    backfillTitle: (id) => ipcRenderer.invoke('sessions:backfillTitle', id)
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
    onUsage: (fn) => listen('agent:usage', fn)
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
  }
}

contextBridge.exposeInMainWorld('electron', electronAPI)
contextBridge.exposeInMainWorld('folk', folk)
