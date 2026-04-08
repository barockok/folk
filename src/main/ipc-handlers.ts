import { ipcMain, app, dialog, BrowserWindow } from 'electron'
import fs from 'fs'
import type { DatabaseManager } from './database'
import type { LlamaServerManager } from './llama-server'
import type { AgentManager } from './agent-manager'
import type { ModelManager } from './model-manager'
import type { MCPClientManager } from './mcp/client-manager'
import type { MCPOAuthManager } from './mcp/oauth-manager'
import type { MCPServer } from '../shared/types'

export interface IPCDependencies {
  db: DatabaseManager
  llama: LlamaServerManager
  agentManager: AgentManager
  modelManager: ModelManager
  mcpManager: MCPClientManager
  oauthManager: MCPOAuthManager
  getMainWindow: () => BrowserWindow | null
  getWorkspacePath: () => string
  setWorkspacePath: (path: string) => void
}

export function registerIPCHandlers(deps: IPCDependencies): void {
  const { db, llama, getMainWindow, getWorkspacePath, setWorkspacePath } = deps

  // --- Agent ---
  ipcMain.handle('agent:send-message', async (_, conversationId: string, content: string) => {
    console.log(`[IPC] agent:send-message received, conv=${conversationId}, content="${content.slice(0, 50)}"`)
    try {
      await deps.agentManager.handleMessage(conversationId, content)
      console.log(`[IPC] agent:send-message completed`)
    } catch (err) {
      console.error(`[IPC] agent:send-message error:`, err)
      throw err
    }
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

  // --- Export ---
  ipcMain.handle('conversation:export', async (_, conversationId: string) => {
    const conv = db.getConversation(conversationId)
    if (!conv) return

    const messages = db.getMessages(conversationId)

    let md = `# ${conv.title}\n\n`
    md += `*Exported from Folk on ${new Date().toLocaleDateString()}*\n\n---\n\n`

    for (const msg of messages) {
      const role = msg.role === 'user' ? '**You**' : '**Folk**'
      md += `### ${role}\n\n`
      for (const block of msg.content) {
        if (block.type === 'text') {
          md += block.text + '\n\n'
        }
      }
    }

    const win = getMainWindow()
    if (!win) return

    const result = await dialog.showSaveDialog(win, {
      defaultPath: `${conv.title.replace(/[^a-zA-Z0-9 ]/g, '')}.md`,
      filters: [{ name: 'Markdown', extensions: ['md'] }]
    })

    if (!result.canceled && result.filePath) {
      fs.writeFileSync(result.filePath, md, 'utf-8')
    }
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
      const server = db.addMCPServer(config)
      // Auto-connect if enabled
      if (server.enabled) {
        deps.mcpManager.connect(server).catch((err) => {
          console.error(`Failed to connect MCP server ${server.name}:`, err)
        })
      }
      return server
    }
  )

  ipcMain.handle('mcp:remove-server', async (_event, id: string) => {
    // Disconnect before removing
    await deps.mcpManager.disconnect(id)
    db.removeMCPServer(id)
  })

  ipcMain.handle('mcp:test-connection', async (_event, id: string) => {
    const servers = db.listMCPServers()
    const server = servers.find((s) => s.id === id)
    if (!server) return { ok: false, error: 'Server not found' }
    return deps.mcpManager.testConnection(server)
  })

  ipcMain.handle('mcp:discover-oauth', async (_, serverUrl: string) => {
    return deps.oauthManager.discoverOAuth(serverUrl)
  })

  ipcMain.handle('mcp:authorize', async (_, serverId: string, serverUrl: string) => {
    // 1. Discover OAuth config
    const oauthConfig = await deps.oauthManager.discoverOAuth(serverUrl)
    if (!oauthConfig) {
      throw new Error('Server does not support OAuth')
    }

    // 2. Register client if supported
    let clientId = 'folk-desktop'
    let clientSecret: string | undefined

    if (oauthConfig.registration_endpoint) {
      try {
        const reg = await deps.oauthManager.registerClient(
          oauthConfig.registration_endpoint,
          'http://127.0.0.1:0/callback'
        )
        clientId = reg.client_id
        clientSecret = reg.client_secret
      } catch {
        // Use default client_id
      }
    }

    // 3. Authorize (opens browser)
    const tokens = await deps.oauthManager.authorize(oauthConfig, clientId, clientSecret)

    // 4. Save tokens
    deps.db.saveOAuthTokens(
      serverId,
      tokens,
      JSON.stringify(oauthConfig),
      clientId,
      clientSecret
    )

    // 5. Try connecting with the token
    const server = deps.db.getMCPServerById(serverId)
    if (server) {
      try {
        await deps.mcpManager.connect(server)
      } catch {
        // Token saved, connection can be retried
      }
    }

    return { success: true }
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
