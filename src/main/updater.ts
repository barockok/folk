// updater.ts — wraps electron-updater so the renderer can show a banner.
//
// On boot we check immediately, then every 4 hours. autoDownload is on so
// new versions land in the background; the user only sees a banner when
// download finishes (`updater:downloaded`) inviting a restart-to-install.
//
// Skip in dev — autoUpdater rejects non-packaged builds with
// "Could not get code signature for running application".
import { app, ipcMain, type BrowserWindow } from 'electron'
import electronUpdater from 'electron-updater'
import type { Telemetry } from './telemetry'

const { autoUpdater } = electronUpdater

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000

let timer: NodeJS.Timeout | null = null
let registered = false

export function setupAutoUpdater(win: BrowserWindow, telemetry?: Telemetry): void {
  // Bail in dev — autoUpdater requires a packaged, signed app on macOS.
  if (!autoUpdater.isUpdaterActive || !autoUpdater.isUpdaterActive()) {
    return
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  const send = (channel: string, payload: unknown): void => {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }

  autoUpdater.on('checking-for-update', () => send('updater:checking', {}))
  autoUpdater.on('update-available', (info) => {
    telemetry?.captureUpdateAvailable({
      from_version: app.getVersion(),
      to_version: info.version,
    })
    send('updater:available', {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : null
    })
  })
  autoUpdater.on('update-not-available', (info) =>
    send('updater:notAvailable', { version: info.version })
  )
  autoUpdater.on('download-progress', (p) =>
    send('updater:progress', {
      percent: Math.round(p.percent ?? 0),
      bytesPerSecond: p.bytesPerSecond ?? 0,
      transferred: p.transferred ?? 0,
      total: p.total ?? 0
    })
  )
  autoUpdater.on('update-downloaded', (info) => {
    telemetry?.captureUpdateInstalled({
      from_version: app.getVersion(),
      to_version: info.version,
    })
    send('updater:downloaded', { version: info.version })
  })
  autoUpdater.on('error', (err) =>
    send('updater:error', { message: err?.message ?? String(err) })
  )

  if (!registered) {
    ipcMain.handle('updater:check', async () => {
      try {
        const res = await autoUpdater.checkForUpdates()
        return { ok: true, version: res?.updateInfo?.version ?? null }
      } catch (err) {
        return { ok: false, error: (err as Error).message }
      }
    })
    ipcMain.handle('updater:quitAndInstall', () => {
      autoUpdater.quitAndInstall()
      return { ok: true }
    })
    registered = true
  }

  void autoUpdater.checkForUpdates().catch(() => {})
  if (timer) clearInterval(timer)
  timer = setInterval(() => {
    void autoUpdater.checkForUpdates().catch(() => {})
  }, CHECK_INTERVAL_MS)
}

export function teardownAutoUpdater(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
