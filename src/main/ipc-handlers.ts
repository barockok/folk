import { ipcMain, app, dialog, BrowserWindow } from 'electron'
import fs from 'fs'
import type { DatabaseManager } from './database'
import type { LlamaServerManager } from './llama-server'
import type { AgentManager } from './agent-manager'
import type { ModelManager } from './model-manager'
import type { MCPServer } from '../shared/types'

export interface IPCDependencies {
  db: DatabaseManager
  llama: LlamaServerManager
  agentManager: AgentManager
  modelManager: ModelManager
  getMainWindow: () => BrowserWindow | null
  getWorkspacePath: () => string
  setWorkspacePath: (path: string) => void
}

export function registerIPCHandlers(deps: IPCDependencies): void {
  const { db, llama, getMainWindow, getWorkspacePath, setWorkspacePath } = deps

  // --- Agent ---
  ipcMain.handle('agent:send-message', async (_, conversationId: string, content: string) => {
    await deps.agentManager.handleMessage(conversationId, content)
  })
  ipcMain.handle('agent:stop', (_, conversationId: string) => {
    deps.agentManager.stop(conversationId)
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
    const modelPath = (db.getSetting('modelPath') as string | null) ?? deps.modelManager.getDefaultModelPath()
    if (!fs.existsSync(modelPath)) return null
    const stats = fs.statSync(modelPath)
    const name = modelPath.split('/').pop() ?? modelPath.split('\\').pop() ?? 'unknown'
    return {
      name,
      path: modelPath,
      sizeBytes: stats.size,
      quantization: 'Q4',
      contextSize: 4096
    }
  })

  ipcMain.handle('model:change', async (_event, path: string) => {
    db.setSetting('modelPath', path)
  })

  ipcMain.handle('model:download', async (_event, url: string) => {
    const destPath = deps.modelManager.getDefaultModelPath()
    const win = getMainWindow()

    const onProgress = (progress: { percent: number; speed: string; eta: string }): void => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('model:download-progress', progress)
      }
    }

    deps.modelManager.on('progress', onProgress)

    try {
      await deps.modelManager.download({ url, destPath })
      db.setSetting('modelPath', destPath)
    } finally {
      deps.modelManager.removeListener('progress', onProgress)
    }
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
