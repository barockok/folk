import { app, BrowserWindow, ipcMain, nativeTheme, net, protocol, shell } from 'electron'
import { join } from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

// Cache the last-known theme so the next launch can paint the BrowserWindow
// in the correct color before the renderer JS bundle has loaded. Without this
// cold prod launches flash white — the renderer is the source of truth for
// theme but it can't communicate that to main before its first paint.
function themeCachePath(): string {
  return join(app.getPath('userData'), 'folk-theme.cache')
}
function readPersistedTheme(): 'light' | 'dark' | null {
  try {
    const v = readFileSync(themeCachePath(), 'utf8').trim()
    return v === 'dark' ? 'dark' : v === 'light' ? 'light' : null
  } catch {
    return null
  }
}
function writePersistedTheme(t: 'light' | 'dark'): void {
  try {
    writeFileSync(themeCachePath(), t, 'utf8')
  } catch {
    /* best-effort cache; loss only re-introduces the flash on the next boot */
  }
}

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
import { setupAutoUpdater, teardownAutoUpdater } from './updater'

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
  // Pick an initial backgroundColor that matches the renderer's tokens for the
  // user's theme. Without this the window paints white before the first React
  // frame, producing a visible flash on launch (especially noticeable in prod
  // where bundle parse + mount takes longer than dev).
  const lastTheme = readPersistedTheme()
  const isDark = lastTheme ? lastTheme === 'dark' : nativeTheme.shouldUseDarkColors
  const initialBg = isDark ? '#0a0f1e' : '#ffffff'

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: initialBg,
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

  // A plain <a href="https://…"> click in the renderer would otherwise
  // navigate the BrowserWindow itself — replacing the React app with the
  // remote page and destroying any in-memory session state. Block external
  // navigation and route to the OS default browser instead. Allow only the
  // app's own dev URL / file:// boot URL.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const current = mainWindow!.webContents.getURL()
    try {
      const target = new URL(url)
      const here = current ? new URL(current) : null
      const sameOrigin = here && target.origin === here.origin
      const isAppFile = target.protocol === 'file:' && target.pathname.endsWith('/index.html')
      if (sameOrigin || isAppFile) return
    } catch {
      // fall through to deny
    }
    event.preventDefault()
    if (/^https?:/i.test(url) || url.startsWith('mailto:')) {
      shell.openExternal(url)
    }
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

  // Renderer reports its applied theme so we can paint the window in the
  // matching color on the next cold launch.
  ipcMain.on('app:theme', (_e, t: unknown) => {
    if (t === 'light' || t === 'dark') writePersistedTheme(t)
  })

  // Open the window FIRST so the renderer starts loading HTML+JS in parallel
  // with the rest of main-process init. The renderer doesn't issue IPC until
  // its first useEffect, by which time DB/IPC are registered below.
  createWindow()

  db = new Database(join(app.getPath('userData'), 'folk.db'))
  mcpManager = new MCPManager(
    db,
    join(app.getPath('userData'), 'folk-managed-mcps.json')
  )
  agentManager = new AgentManager(db, (id) => mcpManager.getAccessToken(id))
  mcpManager.setBusyCheck(() => agentManager.hasLiveSessions())
  agentManager.setOnAllIdle(() => mcpManager.flushDeferredSync())
  registerIpc(db, agentManager, mcpManager)

  if (mainWindow) {
    wireStreaming(agentManager, mainWindow)
  }

  // Defer everything non-critical to first paint: proxy boot (port bind +
  // retries), MCP→ClaudeCode sync, and the auto-updater. Running these inline
  // delayed window creation visibly in prod.
  setImmediate(() => {
    initLogger(join(app.getPath('userData'), 'folk-opencode-proxy.log'))
    void bootProxyWithRetry()
    void mcpManager.syncToClaudeCode()
    if (mainWindow && !is.dev) setupAutoUpdater(mainWindow)
    // Parse the most recent transcripts into AgentManager's LRU so the
    // renderer's first sidebar click hits memory instead of a 1-30MB JSONL
    // parse. Best-effort, errors swallowed inside.
    void agentManager.prewarmRecentSessions(5)
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', (e) => {
  teardownAutoUpdater()
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
