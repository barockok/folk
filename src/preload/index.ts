import { contextBridge, ipcRenderer } from 'electron'
import type { FolkAPI } from '../shared/types'

const folkAPI: FolkAPI = {
  // Agent
  sendMessage: (conversationId, content) =>
    ipcRenderer.invoke('agent:send-message', conversationId, content),
  stopAgent: (conversationId) => ipcRenderer.invoke('agent:stop', conversationId),

  // Conversations
  createConversation: () => ipcRenderer.invoke('conversation:create'),
  listConversations: () => ipcRenderer.invoke('conversation:list'),
  deleteConversation: (id) => ipcRenderer.invoke('conversation:delete', id),
  renameConversation: (id, title) => ipcRenderer.invoke('conversation:rename', id, title),
  getMessages: (conversationId) => ipcRenderer.invoke('conversation:messages', conversationId),

  // Settings
  getSetting: (key) => ipcRenderer.invoke('settings:get', key),
  setSetting: (key, value) => ipcRenderer.invoke('settings:set', key, value),

  // MCP
  listMCPServers: () => ipcRenderer.invoke('mcp:list-servers'),
  addMCPServer: (config) => ipcRenderer.invoke('mcp:add-server', config),
  removeMCPServer: (id) => ipcRenderer.invoke('mcp:remove-server', id),
  testMCPConnection: (id) => ipcRenderer.invoke('mcp:test-connection', id),

  // Model
  getModelInfo: () => ipcRenderer.invoke('model:info'),
  changeModel: (path) => ipcRenderer.invoke('model:change', path),
  downloadModel: (url) => ipcRenderer.invoke('model:download', url),

  // Workspace
  selectWorkspace: () => ipcRenderer.invoke('workspace:select'),
  getCurrentWorkspace: () => ipcRenderer.invoke('workspace:current'),

  // System
  getLlamaStatus: () => ipcRenderer.invoke('llama:status'),
  getAppVersion: () => ipcRenderer.invoke('app:version'),
  exportConversation: (conversationId) => ipcRenderer.invoke('conversation:export', conversationId),
  openFileDialog: (options) => ipcRenderer.invoke('dialog:open-file', options),

  // Event listeners (main → renderer)
  onToken: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, data: Parameters<typeof callback>[0]) =>
      callback(data)
    ipcRenderer.on('agent:token', handler)
    return () => ipcRenderer.removeListener('agent:token', handler)
  },
  onToolStart: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, data: Parameters<typeof callback>[0]) =>
      callback(data)
    ipcRenderer.on('agent:tool-start', handler)
    return () => ipcRenderer.removeListener('agent:tool-start', handler)
  },
  onToolResult: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, data: Parameters<typeof callback>[0]) =>
      callback(data)
    ipcRenderer.on('agent:tool-result', handler)
    return () => ipcRenderer.removeListener('agent:tool-result', handler)
  },
  onArtifact: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, data: Parameters<typeof callback>[0]) =>
      callback(data)
    ipcRenderer.on('agent:artifact', handler)
    return () => ipcRenderer.removeListener('agent:artifact', handler)
  },
  onAgentComplete: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, data: Parameters<typeof callback>[0]) =>
      callback(data)
    ipcRenderer.on('agent:complete', handler)
    return () => ipcRenderer.removeListener('agent:complete', handler)
  },
  onAgentError: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, data: Parameters<typeof callback>[0]) =>
      callback(data)
    ipcRenderer.on('agent:error', handler)
    return () => ipcRenderer.removeListener('agent:error', handler)
  },
  onDownloadProgress: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, data: Parameters<typeof callback>[0]) =>
      callback(data)
    ipcRenderer.on('model:download-progress', handler)
    return () => ipcRenderer.removeListener('model:download-progress', handler)
  },
  onLlamaStatusChange: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, status: Parameters<typeof callback>[0]) =>
      callback(status)
    ipcRenderer.on('llama:status-change', handler)
    return () => ipcRenderer.removeListener('llama:status-change', handler)
  }
}

contextBridge.exposeInMainWorld('folk', folkAPI)
