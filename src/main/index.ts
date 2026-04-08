import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import fs from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { DatabaseManager } from './database'
import { LlamaServerManager } from './llama-server'
import { registerIPCHandlers } from './ipc-handlers'

let mainWindow: BrowserWindow | null = null
let db: DatabaseManager
let llama: LlamaServerManager
let workspacePath: string = app.getPath('home')

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#0f0f0f',
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
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

  // Initialize LlamaServerManager
  const modelPath = join(app.getPath('userData'), 'models', 'default.gguf')
  llama = new LlamaServerManager({
    modelPath,
    port: 8847,
    contextSize: 4096
  })

  // Forward llama status events to renderer
  llama.on('status', (status) => {
    mainWindow?.webContents.send('llama:status-change', status)
  })

  // Register IPC handlers
  registerIPCHandlers({
    db,
    llama,
    getMainWindow: () => mainWindow,
    getWorkspacePath: () => workspacePath,
    setWorkspacePath: (path: string) => {
      workspacePath = path
    }
  })

  // Create main window
  createWindow()

  // Start llama-server if model exists
  if (fs.existsSync(modelPath)) {
    llama.start().catch((err) => {
      console.error('Failed to start llama-server:', err)
    })
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', async () => {
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
