import { app, shell, BrowserWindow, Menu } from 'electron'
import { join } from 'path'
import fs from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { DatabaseManager } from './database'
import { LlamaServerManager } from './llama-server'
import { AgentManager } from './agent-manager'
import { ModelManager } from './model-manager'
import { MCPClientManager } from './mcp/client-manager'
import { MCPOAuthManager } from './mcp/oauth-manager'
import { registerIPCHandlers } from './ipc-handlers'

let mainWindow: BrowserWindow | null = null
let db: DatabaseManager
let llama: LlamaServerManager
let mcpManager: MCPClientManager
let agentManager: AgentManager
let workspacePath: string = app.getPath('home')

function createWindow(): void {
  const savedBounds = db.getSetting('windowBounds') as { x: number; y: number; width: number; height: number } | null
  const wasMaximized = db.getSetting('windowMaximized') as boolean | null

  mainWindow = new BrowserWindow({
    width: savedBounds?.width ?? 1400,
    height: savedBounds?.height ?? 900,
    ...(savedBounds ? { x: savedBounds.x, y: savedBounds.y } : {}),
    minWidth: 800,
    minHeight: 600,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#0f0f0f',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // Debounced window bounds saving
  let boundsTimer: ReturnType<typeof setTimeout> | null = null
  const saveBounds = (): void => {
    if (boundsTimer) clearTimeout(boundsTimer)
    boundsTimer = setTimeout(() => {
      if (mainWindow && !mainWindow.isMaximized()) {
        db.setSetting('windowBounds', mainWindow.getBounds())
      }
    }, 500)
  }
  mainWindow.on('resize', saveBounds)
  mainWindow.on('move', saveBounds)

  // Save maximized state
  mainWindow.on('maximize', () => db.setSetting('windowMaximized', true))
  mainWindow.on('unmaximize', () => db.setSetting('windowMaximized', false))

  mainWindow.on('ready-to-show', () => {
    if (wasMaximized) {
      mainWindow?.maximize()
    }
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Initialize database
  const dbPath = join(app.getPath('userData'), 'folk.db')
  db = new DatabaseManager(dbPath)

  // Restore workspace from settings
  const savedWorkspace = db.getSetting('workspacePath') as string | null
  if (savedWorkspace && fs.existsSync(savedWorkspace)) {
    workspacePath = savedWorkspace
  }

  // Initialize ModelManager
  const modelsDir = join(app.getPath('userData'), 'models')
  const modelManager = new ModelManager(modelsDir)

  // Initialize LlamaServerManager — use saved model path or ModelManager's default
  const modelPath = (db.getSetting('modelPath') as string | null) ?? modelManager.getDefaultModelPath()
  llama = new LlamaServerManager({
    modelPath,
    port: 8847,
    contextSize: 4096
  })

  // Initialize MCP Client Manager and OAuth Manager
  mcpManager = new MCPClientManager()
  const oauthManager = new MCPOAuthManager()

  // Set token provider so MCP client can use stored OAuth tokens
  mcpManager.setTokenProvider(async (serverId) => {
    return db.getOAuthTokens(serverId)
  })

  // Initialize AgentManager (uses Claude Agent SDK — tools are built-in)
  agentManager = new AgentManager({
    db,
    getMainWindow: () => mainWindow
  })

  // Forward llama status events to renderer
  llama.on('status', (status) => {
    mainWindow?.webContents.send('llama:status-change', status)
  })

  // Forward MCP status events to renderer
  mcpManager.on('status-change', (serverId: string, status: string) => {
    mainWindow?.webContents.send('mcp:status-change', { serverId, status })
  })

  // Register IPC handlers
  registerIPCHandlers({
    db,
    llama,
    agentManager,
    modelManager,
    mcpManager,
    oauthManager,
    getMainWindow: () => mainWindow,
    getWorkspacePath: () => workspacePath,
    setWorkspacePath: (path: string) => {
      workspacePath = path
    }
  })

  // Create main window
  createWindow()

  // Set up native application menu
  const menu = Menu.buildFromTemplate([
    {
      label: 'Folk',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
      ],
    },
  ])
  Menu.setApplicationMenu(menu)

  // Start llama-server if model exists
  if (fs.existsSync(modelPath)) {
    llama.start().catch((err) => {
      console.error('Failed to start llama-server:', err)
    })
  }

  // Connect to enabled MCP servers
  const mcpServers = db.listMCPServers()
  for (const server of mcpServers) {
    if (server.enabled) {
      mcpManager.connect(server).catch((err) => {
        console.error(`Failed to connect MCP server ${server.name}:`, err)
      })
    }
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', async () => {
  try {
    await agentManager?.closeAll()
  } catch {
    // ignore agent session close errors
  }
  try {
    await mcpManager?.disconnectAll()
  } catch {
    // ignore MCP disconnect errors during shutdown
  }
  try {
    await llama?.stop()
  } catch {
    // ignore stop errors during shutdown
  }
  db?.close()

  if (process.platform !== 'darwin') {
    app.quit()
  }
})
