import { app, BrowserWindow, Menu, ipcMain, nativeTheme, net, protocol, screen, shell } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'
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

// Persisted window bounds so resize/move survive relaunch. Validated against
// current display layout — a saved position on a now-disconnected monitor
// would otherwise spawn the window offscreen.
interface WindowBounds { x?: number; y?: number; width: number; height: number }
function windowCachePath(): string {
  return join(app.getPath('userData'), 'folk-window.cache')
}
function readPersistedBounds(): WindowBounds | null {
  try {
    const raw = readFileSync(windowCachePath(), 'utf8')
    const v = JSON.parse(raw) as Partial<WindowBounds>
    if (typeof v.width === 'number' && typeof v.height === 'number') {
      return {
        x: typeof v.x === 'number' ? v.x : undefined,
        y: typeof v.y === 'number' ? v.y : undefined,
        width: v.width,
        height: v.height
      }
    }
    return null
  } catch {
    return null
  }
}
function writePersistedBounds(b: WindowBounds): void {
  try {
    writeFileSync(windowCachePath(), JSON.stringify(b), 'utf8')
  } catch {
    /* best-effort */
  }
}
function isBoundsOnScreen(b: WindowBounds): boolean {
  if (typeof b.x !== 'number' || typeof b.y !== 'number') return true
  const displays = screen.getAllDisplays()
  return displays.some((d) => {
    const wa = d.workArea
    return (
      b.x! >= wa.x - 50 &&
      b.y! >= wa.y - 50 &&
      b.x! + b.width <= wa.x + wa.width + 50 &&
      b.y! + b.height <= wa.y + wa.height + 50
    )
  })
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
  // Inline-image set used by markdown renderer (Conversation.tsx).
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico', '.avif',
  // Extra types served to the in-app FileViewer pane (HTML preview, PDF,
  // audio/video). Same protocol so the iframe / video tags can stream the
  // on-disk file directly without us having to read+inline the bytes.
  '.html', '.htm', '.pdf',
  '.mp4', '.webm', '.mov', '.m4v',
  '.mp3', '.wav', '.ogg', '.m4a', '.flac'
])
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { Database } from './database'
import { AgentManager } from './agent-manager'
import { MCPManager } from './mcp-manager'
import { WindowManager } from './window-manager'
import { registerIpc } from './ipc-handlers'
import { wireStreaming } from './ipc-streaming'
import { startProxy, ProxyHandle } from './opencode-proxy/server'
import { setProxyHandle } from './opencode-proxy/state'
import { initLogger } from './opencode-proxy/logger'
import { stopOpenRouterProxy } from './openrouter-proxy'
import { setupAutoUpdater, teardownAutoUpdater } from './updater'
import { Telemetry } from './telemetry'
import contextMenu from 'electron-context-menu'

let db: Database
let agentManager: AgentManager
let mcpManager: MCPManager
let telemetry: Telemetry
let appLaunchedAt = 0
let mainWindow: BrowserWindow | null = null
let windowManager: WindowManager
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

function buildApplicationMenu(): void {
  const isMac = process.platform === 'darwin'
  const sendToRenderer = (channel: string): void => {
    const focused = BrowserWindow.getFocusedWindow()
    if (focused && !focused.isDestroyed()) {
      focused.webContents.send(channel)
      return
    }
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel)
  }

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? ([
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              {
                label: 'Preferences…',
                accelerator: 'CmdOrCtrl+,',
                click: () => sendToRenderer('app:openTweaks')
              },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' }
            ]
          }
        ] as MenuItemConstructorOptions[])
      : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'New Session',
          accelerator: 'CmdOrCtrl+N',
          click: () => sendToRenderer('app:newSession')
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
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
        { role: 'pasteAndMatchStyle' },
        { role: 'delete' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Search…',
          accelerator: 'CmdOrCtrl+K',
          click: () => sendToRenderer('app:openCmdk')
        },
        { type: 'separator' },
        {
          label: 'Toggle Sidebar',
          accelerator: 'CmdOrCtrl+\\',
          click: () => sendToRenderer('app:toggleSidebar')
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac
          ? ([{ type: 'separator' }, { role: 'front' }] as MenuItemConstructorOptions[])
          : ([{ role: 'close' }] as MenuItemConstructorOptions[]))
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow(): void {
  // Pick an initial backgroundColor that matches the renderer's tokens for the
  // user's theme. Without this the window paints white before the first React
  // frame, producing a visible flash on launch (especially noticeable in prod
  // where bundle parse + mount takes longer than dev).
  const lastTheme = readPersistedTheme()
  const isDark = lastTheme ? lastTheme === 'dark' : nativeTheme.shouldUseDarkColors
  const initialBg = isDark ? '#0a0f1e' : '#ffffff'

  const savedBounds = readPersistedBounds()
  const useSaved = savedBounds && isBoundsOnScreen(savedBounds)
  const bounds: WindowBounds = useSaved ? savedBounds! : { width: 1280, height: 820 }

  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
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

  // Persist bounds on resize/move (debounced) and at close. Use the
  // BrowserWindow's getBounds — works for both maximized-restore and normal
  // states because we want the actual current size.
  let saveTimer: NodeJS.Timeout | null = null
  const queueSaveBounds = (): void => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      if (!mainWindow || mainWindow.isDestroyed()) return
      if (mainWindow.isMinimized() || mainWindow.isFullScreen()) return
      writePersistedBounds(mainWindow.getNormalBounds())
    }, 400)
  }
  mainWindow.on('resize', queueSaveBounds)
  mainWindow.on('move', queueSaveBounds)
  mainWindow.on('close', () => {
    if (saveTimer) clearTimeout(saveTimer)
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (mainWindow.isMinimized() || mainWindow.isFullScreen()) return
    writePersistedBounds(mainWindow.getNormalBounds())
  })

  // Tell the renderer when the window loses/gains focus so it can desaturate
  // chrome (sidebar icons, accent highlights) — matches macOS native app
  // behavior. Renderer applies a `data-window-state` attribute on <html>.
  mainWindow.on('blur', () => {
    mainWindow?.webContents.send('app:windowState', 'blurred')
  })
  mainWindow.on('focus', () => {
    mainWindow?.webContents.send('app:windowState', 'focused')
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

// OS-level brand: Dock, menu bar, Finder, Activity Monitor read this.
// In production the .app bundle's Info.plist (set via electron-builder
// productName) wins, but app.setName ensures dev runs are consistent.
app.setName('Folk')

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.folk.app')
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Native right-click context menu — copy/cut/paste/select-all on text,
  // Copy image / Save image / Copy link on media + anchors. Inspect Element
  // only in dev. Mirrors the affordances people expect from a web browser.
  contextMenu({
    showSelectAll: true,
    showCopyImage: true,
    showCopyImageAddress: true,
    showSaveImageAs: true,
    showCopyLink: true,
    showInspectElement: false,
    showSearchWithGoogle: false,
    // Only show menu in chat content, editable inputs, or on media/links.
    // Sidebar + app chrome stay menu-less to match native-app feel.
    shouldShowMenu: (_event, params) => {
      if (params.isEditable) return true
      if (params.selectionText && params.selectionText.trim().length > 0) return true
      if (params.mediaType === 'image' || params.mediaType === 'video') return true
      if (params.linkURL && params.linkURL.length > 0) return true
      return false
    }
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
  // matching color on the next cold launch and recolor the live window so
  // resize doesn't flash the previous theme's bg.
  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.on('app:theme', (_e, t: unknown) => {
    if (t !== 'light' && t !== 'dark') return
    writePersistedTheme(t)
    const bg = t === 'dark' ? '#0a0f1e' : '#ffffff'
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setBackgroundColor(bg)
    }
  })

  // OS-level appearance change. folk's theme is user-driven (not auto-OS) so
  // we don't override it — but a user who hasn't picked a theme yet (no
  // persisted value) should follow the system.
  nativeTheme.on('updated', () => {
    if (readPersistedTheme()) return
    const bg = nativeTheme.shouldUseDarkColors ? '#0a0f1e' : '#ffffff'
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setBackgroundColor(bg)
    }
  })

  buildApplicationMenu()

  // Open the window FIRST so the renderer starts loading HTML+JS in parallel
  // with the rest of main-process init. The renderer doesn't issue IPC until
  // its first useEffect, by which time DB/IPC are registered below.
  createWindow()

  db = new Database(join(app.getPath('userData'), 'folk.db'))
  mcpManager = new MCPManager(join(app.getPath('userData'), 'mcp-oauth.json'))
  telemetry = new Telemetry({
    userDataDir: app.getPath('userData'),
    posthogKey: process.env.VITE_POSTHOG_KEY ?? '',
    host: process.env.VITE_POSTHOG_HOST ?? 'https://us.i.posthog.com'
  })
  agentManager = new AgentManager(db, (id) => mcpManager.getAccessToken(id), telemetry)
  windowManager = new WindowManager(() => {
    const t = readPersistedTheme()
    return (t ? t === 'dark' : nativeTheme.shouldUseDarkColors) ? '#0a0f1e' : '#ffffff'
  })
  mcpManager.setBusyCheck(() => agentManager.hasLiveSessions())
  agentManager.setOnAllIdle(() => mcpManager.flushDeferredSync())
  appLaunchedAt = Date.now()
  telemetry.captureAppLaunched({
    app_version: app.getVersion(),
    platform: process.platform,
    arch: process.arch
  })
  // Best-effort crash telemetry. We log only the source channel — no stack,
  // message, or path, so the privacy contract holds. The process still exits
  // on uncaughtException as Electron's default handler runs after ours.
  process.on('uncaughtException', (err) => {
    try {
      telemetry?.captureCrash({ source: 'uncaught' })
    } catch {
      /* swallow */
    }
    console.error('[main] uncaughtException:', err)
  })
  process.on('unhandledRejection', (reason) => {
    try {
      telemetry?.captureCrash({ source: 'unhandled-rejection' })
    } catch {
      /* swallow */
    }
    console.error('[main] unhandledRejection:', reason)
  })
  registerIpc(db, agentManager, mcpManager, telemetry, windowManager)

  const getStreamTargets = (): BrowserWindow[] =>
    [mainWindow, ...windowManager.getAllWindows()].filter((w): w is BrowserWindow => !!w && !w.isDestroyed())
  wireStreaming(agentManager, getStreamTargets)
  windowManager.onPopoutsChanged(() => {
    windowManager.broadcastTo(getStreamTargets())
  })

  // Defer everything non-critical to first paint: proxy boot (port bind +
  // retries), MCP→ClaudeCode sync, and the auto-updater. Running these inline
  // delayed window creation visibly in prod.
  setImmediate(() => {
    initLogger(join(app.getPath('userData'), 'folk-opencode-proxy.log'))
    void bootProxyWithRetry()
    if (mainWindow && !is.dev) setupAutoUpdater(mainWindow, telemetry)
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
      await stopOpenRouterProxy().catch(() => {})
      agentManager?.dispose()
      db?.close()
      telemetry?.captureAppQuit({ uptime_ms: Date.now() - appLaunchedAt })
      await telemetry?.shutdown()
      app.exit(0)
    })()
    return
  }
  agentManager?.dispose()
  db?.close()
  telemetry?.captureAppQuit({ uptime_ms: Date.now() - appLaunchedAt })
  void telemetry?.shutdown()
})
