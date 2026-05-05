// Test-only stub for Electron's safeStorage API. Aliased from vitest.config.ts.
// Do not import from production code — the electron-vite build does not include this file.

import { vi } from 'vitest'

export const safeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (s: string) =>
    Buffer.from('enc:' + Buffer.from(s, 'utf8').toString('base64'), 'utf8'),
  decryptString: (b: Buffer) => {
    const str = b.toString('utf8')
    if (!str.startsWith('enc:')) throw new Error('bad cipher')
    return Buffer.from(str.slice(4), 'base64').toString('utf8')
  }
}

type IpcListener = (...args: unknown[]) => void

export class BrowserWindow {
  static _all: BrowserWindow[] = []

  webContents = { send: vi.fn() }
  private _destroyed = false
  private _listeners: Map<string, IpcListener[]> = new Map()

  constructor(opts: Record<string, unknown> = {}) {
    BrowserWindow._all.push(this)
  }

  isDestroyed(): boolean {
    return this._destroyed
  }

  focus = vi.fn()
  loadURL = vi.fn()
  loadFile = vi.fn()

  close(): void {
    this._destroyed = true
  }

  on(event: string, fn: IpcListener): this {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, [])
    }
    this._listeners.get(event)!.push(fn)
    return this
  }

  emit(event: string, ...args: unknown[]): void {
    const listeners = this._listeners.get(event)
    if (listeners) {
      listeners.forEach(fn => fn(...args))
    }
  }

  static getAllWindows(): BrowserWindow[] {
    return [...BrowserWindow._all]
  }

  static _reset(): void {
    BrowserWindow._all = []
  }
}
