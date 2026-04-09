import { ipcMain, app, dialog, BrowserWindow } from 'electron'
import fs from 'fs'
import type { DatabaseManager } from './database'
import type { AgentManager } from './agent-manager'

export interface IPCDependencies {
  db: DatabaseManager
  agentManager: AgentManager
  getMainWindow: () => BrowserWindow | null
  getWorkspacePath: () => string
  setWorkspacePath: (path: string) => void
}

export function registerIPCHandlers(deps: IPCDependencies): void {
  const { db, getMainWindow, getWorkspacePath, setWorkspacePath } = deps

  // --- Agent ---
  ipcMain.handle('agent:send-message', async (_, conversationId: string, content: string) => {
    console.log(
      `[IPC] agent:send-message received, conv=${conversationId}, content="${content.slice(0, 50)}"`
    )
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

  // --- MCP Servers (stubs — MCP removed, kept for API compat) ---
  ipcMain.handle('mcp:list-servers', async () => {
    return db.listMCPServers()
  })

  ipcMain.handle('mcp:add-server', async () => {
    throw new Error('MCP servers are not supported in WebGPU mode')
  })

  ipcMain.handle('mcp:remove-server', async () => {
    throw new Error('MCP servers are not supported in WebGPU mode')
  })

  ipcMain.handle('mcp:test-connection', async () => {
    return { ok: false, error: 'MCP not available in WebGPU mode' }
  })

  ipcMain.handle('mcp:discover-oauth', async () => {
    return null
  })

  ipcMain.handle('mcp:authorize', async () => {
    throw new Error('MCP OAuth not available in WebGPU mode')
  })

  // --- Model ---
  ipcMain.handle('model:info', async () => {
    const activeModel = db.getSetting('activeModelId') as string | null
    return {
      name: activeModel || 'gemma-4-e2b-it-ONNX',
      path: 'WebGPU (in-browser)',
      sizeBytes: 0,
      quantization: 'q4f16',
      contextSize: 2048
    }
  })

  ipcMain.handle('model:change', async () => {
    // No-op in WebGPU mode
  })

  ipcMain.handle('model:download-by-id', async (_event, modelId: string) => {
    const win = getMainWindow()
    try {
      const inference = deps.agentManager.getInference()
      await inference.loadModel(modelId)
      // Save to downloaded models list
      const downloaded = (db.getSetting('downloadedModels') as string[] | null) || []
      if (!downloaded.includes(modelId)) {
        downloaded.push(modelId)
        db.setSetting('downloadedModels', downloaded)
      }
      // Set as active if no active model
      const activeModel = db.getSetting('activeModelId') as string | null
      if (!activeModel) {
        db.setSetting('activeModelId', modelId)
      }
      win?.webContents.send('model:download-complete', { modelId })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      win?.webContents.send('model:download-error', { modelId, error: message })
      throw err
    }
  })

  ipcMain.handle('model:download-cancel', async () => {
    const inference = deps.agentManager.getInference()
    inference.abort()
  })

  ipcMain.handle('model:set-active', async (_event, modelId: string) => {
    db.setSetting('activeModelId', modelId)
    // Reload model in inference engine
    const inference = deps.agentManager.getInference()
    await inference.loadModel(modelId)
  })

  ipcMain.handle('model:get-active', async () => {
    return db.getSetting('activeModelId') as string | null
  })

  ipcMain.handle('model:get-downloaded', async () => {
    return (db.getSetting('downloadedModels') as string[] | null) || []
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
    // Map inference status to the LlamaStatus type the renderer expects
    return 'ready'
  })

  ipcMain.handle('app:version', async () => {
    return app.getVersion()
  })

  ipcMain.handle(
    'dialog:open-file',
    async (
      _event,
      options?: { filters?: { name: string; extensions: string[] }[] }
    ) => {
      const win = getMainWindow()
      if (!win) return []

      const result = await dialog.showOpenDialog(win, {
        properties: ['openFile'],
        filters: options?.filters
      })

      return result.canceled ? [] : result.filePaths
    }
  )
}
