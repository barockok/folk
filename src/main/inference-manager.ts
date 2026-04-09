import { BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { EventEmitter } from 'events'

type InferenceStatus = 'idle' | 'loading' | 'ready' | 'error'

interface InferenceResult {
  output: string
  aborted?: boolean
}

interface PendingRequest {
  resolve: (result: InferenceResult) => void
  reject: (error: Error) => void
  onToken?: (token: string) => void
}

export class InferenceManager extends EventEmitter {
  private window: BrowserWindow | null = null
  private status: InferenceStatus = 'idle'
  private pendingRequests: Map<string, PendingRequest> = new Map()
  private requestCounter = 0
  private currentModelId: string | null = null

  private readyPromise: Promise<void> | null = null
  private readyResolve: (() => void) | null = null

  getStatus(): InferenceStatus {
    return this.status
  }

  async initialize(): Promise<void> {
    // Create hidden window for WebGPU inference
    this.window = new BrowserWindow({
      show: false,
      webPreferences: {
        preload: join(__dirname, '../preload/inference.js'),
        contextIsolation: true,
        nodeIntegration: false,
        webgl: true
      }
    })

    // Set up IPC listeners
    ipcMain.on('inference:worker-ready', () => {
      console.log('[InferenceManager] Worker ready')
    })

    ipcMain.on('inference:status', (_, status: string) => {
      this.status = status as InferenceStatus
      console.log(`[InferenceManager] Status: ${status}`)
      this.emit('status', status)
      if (status === 'ready' && this.readyResolve) {
        this.readyResolve()
        this.readyResolve = null
      }
    })

    ipcMain.on('inference:token', (_, requestId: string, token: string) => {
      const pending = this.pendingRequests.get(requestId)
      if (pending?.onToken) {
        pending.onToken(token)
      }
    })

    ipcMain.on('inference:result', (_, requestId: string, result: InferenceResult & { error?: string }) => {
      const pending = this.pendingRequests.get(requestId)
      if (pending) {
        this.pendingRequests.delete(requestId)
        if (result.error) {
          pending.reject(new Error(result.error))
        } else {
          pending.resolve(result)
        }
      }
    })

    ipcMain.on('inference:error', (_, error: string) => {
      console.error(`[InferenceManager] Error: ${error}`)
      this.emit('error', error)
    })

    ipcMain.on('inference:download-progress', (_, progress: unknown) => {
      this.emit('download-progress', progress)
    })

    // Load the inference page
    await this.window.loadFile(join(__dirname, '../renderer/inference.html'))
  }

  async loadModel(modelId?: string): Promise<void> {
    if (!this.window) throw new Error('Inference window not initialized')
    this.currentModelId = modelId || null
    this.window.webContents.send('inference:load-model', modelId)

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Model load timeout')), 300000)
      const handler = (status: string): void => {
        if (status === 'ready') {
          clearTimeout(timeout)
          this.removeListener('status', handler)
          resolve()
        } else if (status === 'error') {
          clearTimeout(timeout)
          this.removeListener('status', handler)
          reject(new Error('Model failed to load'))
        }
      }
      this.on('status', handler)
    })
  }

  getCurrentModelId(): string | null {
    return this.currentModelId
  }

  async waitForReady(): Promise<void> {
    if (this.status === 'ready') return
    if (!this.readyPromise) {
      this.readyPromise = new Promise((resolve) => {
        this.readyResolve = resolve
      })
    }
    return this.readyPromise
  }

  async generate(
    prompt: string,
    options?: { maxTokens?: number; onToken?: (token: string) => void }
  ): Promise<string> {
    if (!this.window || this.status !== 'ready') {
      throw new Error(`Inference not ready (status: ${this.status})`)
    }

    const requestId = `req-${++this.requestCounter}`

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(requestId, {
        resolve: (result) => resolve(result.output),
        reject,
        onToken: options?.onToken
      })

      this.window!.webContents.send(
        'inference:generate',
        requestId,
        prompt,
        options?.maxTokens || 2048
      )
    })
  }

  abort(): void {
    this.window?.webContents.send('inference:abort')
  }

  async close(): Promise<void> {
    if (this.window) {
      this.window.close()
      this.window = null
    }
  }
}
