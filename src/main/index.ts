import { app, BrowserWindow, net, protocol, shell } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

// Register the custom scheme BEFORE app.whenReady so the renderer treats it
// as privileged (secure context, fetch-capable, streamable).
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'folk-file',
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: true
    }
  }
])

// Whitelist of extensions we'll serve. Keeps the blast radius narrow — this
// protocol exists for inline images in chat markdown, not arbitrary file
// access. Add more extensions if other safe media types are needed.
const ALLOWED_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico', '.avif'
])
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { Database } from './database'
import { AgentManager } from './agent-manager'
import { MCPManager } from './mcp-manager'
import { registerIpc } from './ipc-handlers'
import { wireStreaming } from './ipc-streaming'
import { startProxy, ProxyHandle } from './opencode-proxy/server'
import { setProxyHandle } from './opencode-proxy/state'
import { initLogger } from './opencode-proxy/logger'

let db: Database
let agentManager: AgentManager
let mcpManager: MCPManager
let mainWindow: BrowserWindow | null = null
let opencodeProxy: ProxyHandle | null = null
let proxyShuttingDown = false
let proxyRestartAttempts = 0
const PROXY_MAX_RESTARTS = 3

async function bootProxyWithRetry(): Promise<void> {
  while (proxyRestartAttempts < PROXY_MAX_RESTARTS && !proxyShuttingDown) {
    try {
      const handle = await startProxy()
      opencodeProxy = handle
      setProxyHandle(handle)
      proxyRestartAttempts = 0
      return
    } catch (err) {
      proxyRestartAttempts += 1
      console.error(
        `[opencode-proxy] start failed (attempt ${proxyRestartAttempts}/${PROXY_MAX_RESTARTS}):`,
        (err as Error).message
      )
      if (proxyRestartAttempts >= PROXY_MAX_RESTARTS) {
        console.error('[opencode-proxy] giving up — OpenCode providers will be unavailable')
        return
      }
      await new Promise((r) => setTimeout(r, 1000 * proxyRestartAttempts))
    }
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    show: false,
    titleBarStyle: 'hiddenInset',
    // Nudge the macOS traffic-light triplet down so it vertically aligns
    // with the in-app topbar content (sidebar toggle + breadcrumb).
    trafficLightPosition: { x: 16, y: 18 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow!.show())
  mainWindow.on('closed', () => {
    mainWindow = null
  })
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.folk.app')
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // folk-file://<absolute-path> → stream the on-disk file. The hostname slot
  // is unused; we treat everything after the scheme as the absolute path.
  protocol.handle('folk-file', async (req) => {
    try {
      // The renderer rewrites paths to folk-file://localhost/<absolute-path>.
      // We only care about the pathname — host is a placeholder.
      const url = new URL(req.url)
      const rawPath = decodeURIComponent(url.pathname)
      const ext = rawPath.slice(rawPath.lastIndexOf('.')).toLowerCase()
      if (!ALLOWED_EXT.has(ext)) {
        return new Response('Disallowed file type', { status: 403 })
      }
      return await net.fetch(pathToFileURL(rawPath).toString())
    } catch (err) {
      return new Response(`Bad request: ${(err as Error).message}`, { status: 400 })
    }
  })

  // Boot the OpenCode bridge proxy. It's used as ANTHROPIC_BASE_URL for the
  // opencode-* presets so Claude Code's Messages requests can be translated to
  // OpenCode's OpenAI-format /chat/completions route. Loopback only.
  initLogger(join(app.getPath('userData'), 'folk-opencode-proxy.log'))
  void bootProxyWithRetry()

  db = new Database(join(app.getPath('userData'), 'folk.db'))
  mcpManager = new MCPManager(
    db,
    join(app.getPath('userData'), 'folk-managed-mcps.json')
  )
  agentManager = new AgentManager(db, (id) => mcpManager.getAccessToken(id))
  // Initial sync on launch so any existing folk-managed entries land in
  // ~/.claude/.mcp.json right away (handles the very first run after this
  // feature ships).
  void mcpManager.syncToClaudeCode()
  registerIpc(db, agentManager, mcpManager)

  createWindow()
  if (mainWindow) wireStreaming(agentManager, mainWindow)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', (e) => {
  // Block quit briefly so the proxy can drain in-flight requests cleanly.
  if (opencodeProxy && !proxyShuttingDown) {
    proxyShuttingDown = true
    e.preventDefault()
    void (async () => {
      try {
        await opencodeProxy?.close()
      } catch (err) {
        console.error('[opencode-proxy] close error:', (err as Error).message)
      }
      opencodeProxy = null
      setProxyHandle(null)
      agentManager?.dispose()
      db?.close()
      app.exit(0)
    })()
    return
  }
  agentManager?.dispose()
  db?.close()
})
