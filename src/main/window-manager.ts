import { BrowserWindow } from 'electron'
import { join } from 'node:path'

export class WindowManager {
  private map = new Map<string, BrowserWindow>()
  private listeners: Array<(ids: string[]) => void> = []

  popout(sessionId: string): void {
    const existing = this.map.get(sessionId)
    if (existing && !existing.isDestroyed()) {
      existing.focus()
      return
    }

    const win = new BrowserWindow({
      width: 900,
      height: 720,
      minWidth: 600,
      minHeight: 400,
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 16, y: 12 },
      webPreferences: {
        preload: join(__dirname, '../preload/index.mjs'),
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false
      }
    })

    win.on('blur', () => { win.webContents.send('app:windowState', 'blurred') })
    win.on('focus', () => { win.webContents.send('app:windowState', 'focused') })

    if (process.env['ELECTRON_RENDERER_URL']) {
      void win.loadURL(process.env['ELECTRON_RENDERER_URL'] + `#popout/${sessionId}`)
    } else {
      void win.loadFile(join(__dirname, '../renderer/index.html'), { hash: `popout/${sessionId}` })
    }

    this.map.set(sessionId, win)
    this.broadcast()

    win.on('closed', () => {
      this.map.delete(sessionId)
      this.broadcast()
    })
  }

  close(sessionId: string): void {
    const win = this.map.get(sessionId)
    this.map.delete(sessionId)
    if (win && !win.isDestroyed()) win.close()
    this.broadcast()
  }

  getPopoutIds(): string[] {
    return [...this.map.keys()]
  }

  getAllWindows(): BrowserWindow[] {
    return [...this.map.values()].filter((w) => !w.isDestroyed())
  }

  broadcastTo(targets: BrowserWindow[]): void {
    const ids = this.getPopoutIds()
    for (const win of targets) {
      if (!win.isDestroyed()) {
        try {
          win.webContents.send('window:popouts', ids)
        } catch {
          // window in transitional state; skip
        }
      }
    }
  }

  onPopoutsChanged(fn: (ids: string[]) => void): () => void {
    this.listeners.push(fn)
    return () => { this.listeners = this.listeners.filter((l) => l !== fn) }
  }

  private broadcast(): void {
    const ids = this.getPopoutIds()
    for (const fn of this.listeners) fn(ids)
  }
}
