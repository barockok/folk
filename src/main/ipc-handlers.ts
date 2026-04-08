import { ipcMain, app, dialog, BrowserWindow } from 'electron'
import type { DatabaseManager } from './database'
import type { LlamaServerManager } from './llama-server'
import type { MCPServer } from '../shared/types'

export interface IPCDependencies {
  db: DatabaseManager
  llama: LlamaServerManager
  getMainWindow: () => BrowserWindow | null
  getWorkspacePath: () => string
  setWorkspacePath: (path: string) => void
}

export function registerIPCHandlers(deps: IPCDependencies): void {
  const { db, llama, getMainWindow, getWorkspacePath, setWorkspacePath } = deps

  // --- Agent (stubs, wired in Task 25) ---
  ipcMain.handle('agent:send-message', async () => {
    /* wired in Task 25 */
  })
  ipcMain.handle('agent:stop', () => {
    /* wired in Task 25 */
  })

  // --- Conversations ---
  ipcMain.handle('conversation:create', async () => {
    return db.createConversation('New Chat', getWorkspacePath())
  })

  ipcMain.handle('conversation:list', async () => {
    return db.listConversations()
  })

  ipcMain.handle('conversation:delete', async (_event, id: string) => {
    db.deleteConversation(id)
  })

  ipcMain.handle('conversation:rename', async (_event, id: string, title: string) => {
    db.renameConversation(id, title)
  })

  ipcMain.handle('conversation:messages', async (_event, conversationId: string) => {
    return db.getMessages(conversationId)
  })

  // --- Settings ---
  ipcMain.handle('settings:get', async (_event, key: string) => {
    return db.getSetting(key)
  })

  ipcMain.handle('settings:set', async (_event, key: string, value: unknown) => {
    db.setSetting(key, value)
  })

  // --- MCP Servers ---
  ipcMain.handle('mcp:list-servers', async () => {
    return db.listMCPServers()
  })

  ipcMain.handle(
    'mcp:add-server',
    async (_event, config: Omit<MCPServer, 'id' | 'createdAt'>) => {
      return db.addMCPServer(config)
    }
  )

  ipcMain.handle('mcp:remove-server', async (_event, id: string) => {
    db.removeMCPServer(id)
  })

  ipcMain.handle('mcp:test-connection', async (_event, _id: string) => {
    // TODO: implement actual MCP connection test
    return { ok: true }
  })

  // --- Model ---
  ipcMain.handle('model:info', async () => {
    // TODO: implement model info retrieval
    return null
  })

  ipcMain.handle('model:change', async (_event, _path: string) => {
    // TODO: implement model change
  })

  ipcMain.handle('model:download', async () => {
    /* stub — wired later */
  })

  // --- Workspace ---
  ipcMain.handle('workspace:select', async () => {
    const win = getMainWindow()
    if (!win) return null

    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory']
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    const selected = result.filePaths[0]
    setWorkspacePath(selected)
    db.setSetting('workspacePath', selected)
    return selected
  })

  ipcMain.handle('workspace:current', async () => {
    return getWorkspacePath()
  })

  // --- System ---
  ipcMain.handle('llama:status', async () => {
    return llama.getStatus()
  })

  ipcMain.handle('app:version', async () => {
    return app.getVersion()
  })

  ipcMain.handle('dialog:open-file', async (_event, options?: { filters?: { name: string; extensions: string[] }[] }) => {
    const win = getMainWindow()
    if (!win) return []

    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: options?.filters
    })

    return result.canceled ? [] : result.filePaths
  })
}
