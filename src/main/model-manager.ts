import { EventEmitter } from 'events'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

export interface DownloadOptions {
  url: string
  destPath: string
  expectedHash?: string
}

export interface DownloadProgressEvent {
  percent: number
  speed: string
  eta: string
}

const DEFAULT_MODEL_NAME = 'gemma-4-E4B-it-Q4_K_M.gguf'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`
  const hours = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  return `${hours}h ${mins}m`
}

export class ModelManager extends EventEmitter {
  private modelsDir: string

  constructor(modelsDir: string) {
    super()
    this.modelsDir = modelsDir
    if (!fs.existsSync(this.modelsDir)) {
      fs.mkdirSync(this.modelsDir, { recursive: true })
    }
  }

  getModelsDir(): string {
    return this.modelsDir
  }

  getDefaultModelPath(): string {
    return path.join(this.modelsDir, DEFAULT_MODEL_NAME)
  }

  hasDefaultModel(): boolean {
    return fs.existsSync(this.getDefaultModelPath())
  }

  listModels(): { name: string; path: string; sizeBytes: number }[] {
    if (!fs.existsSync(this.modelsDir)) {
      return []
    }
    const entries = fs.readdirSync(this.modelsDir)
    return entries
      .filter((entry) => entry.endsWith('.gguf'))
      .map((entry) => {
        const fullPath = path.join(this.modelsDir, entry)
        const stats = fs.statSync(fullPath)
        return {
          name: entry,
          path: fullPath,
          sizeBytes: stats.size
        }
      })
  }

  async download(options: DownloadOptions): Promise<void> {
    const { url, destPath, expectedHash } = options
    const tmpPath = destPath + '.tmp'

    let startByte = 0
    if (fs.existsSync(tmpPath)) {
      const stats = fs.statSync(tmpPath)
      startByte = stats.size
    }

    const headers: Record<string, string> = {}
    if (startByte > 0) {
      headers['Range'] = `bytes=${startByte}-`
    }

    let response: Response
    try {
      response = await fetch(url, { headers })
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      this.emit('error', error)
      throw error
    }

    if (!response.ok && response.status !== 206) {
      const error = new Error(`Download failed: HTTP ${response.status} ${response.statusText}`)
      this.emit('error', error)
      throw error
    }

    // If server doesn't support range requests, start from scratch
    if (startByte > 0 && response.status !== 206) {
      startByte = 0
      if (fs.existsSync(tmpPath)) {
        fs.unlinkSync(tmpPath)
      }
    }

    const contentLength = response.headers.get('content-length')
    const totalSize = contentLength ? parseInt(contentLength, 10) + startByte : null

    const body = response.body
    if (!body) {
      const error = new Error('Response body is null')
      this.emit('error', error)
      throw error
    }

    // Ensure parent directory exists
    const parentDir = path.dirname(destPath)
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true })
    }

    const fileStream = fs.createWriteStream(tmpPath, {
      flags: startByte > 0 ? 'a' : 'w'
    })

    let downloadedBytes = startByte
    let lastTime = Date.now()
    let lastBytes = downloadedBytes
    const startTime = Date.now()

    const reader = body.getReader()

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        fileStream.write(Buffer.from(value))
        downloadedBytes += value.byteLength

        const now = Date.now()
        const elapsed = (now - lastTime) / 1000

        if (elapsed >= 0.5 || done) {
          const bytesSinceLastUpdate = downloadedBytes - lastBytes
          const speedBps = elapsed > 0 ? bytesSinceLastUpdate / elapsed : 0
          const percent = totalSize ? Math.round((downloadedBytes / totalSize) * 100) : 0
          const remainingBytes = totalSize ? totalSize - downloadedBytes : 0
          const etaSeconds = speedBps > 0 ? remainingBytes / speedBps : 0

          this.emit('progress', {
            percent,
            speed: `${formatBytes(speedBps)}/s`,
            eta: formatDuration(etaSeconds)
          } as DownloadProgressEvent)

          lastTime = now
          lastBytes = downloadedBytes
        }
      }
    } catch (err) {
      fileStream.close()
      const error = err instanceof Error ? err : new Error(String(err))
      this.emit('error', error)
      throw error
    }

    await new Promise<void>((resolve, reject) => {
      fileStream.end(() => {
        fileStream.close((err) => {
          if (err) reject(err)
          else resolve()
        })
      })
    })

    // Verify hash if provided
    if (expectedHash) {
      const fileHash = await this.computeFileHash(tmpPath)
      if (fileHash !== expectedHash.toLowerCase()) {
        fs.unlinkSync(tmpPath)
        const error = new Error(
          `Hash mismatch: expected ${expectedHash}, got ${fileHash}`
        )
        this.emit('error', error)
        throw error
      }
    }

    // Rename .tmp to final destination
    fs.renameSync(tmpPath, destPath)

    const totalElapsed = (Date.now() - startTime) / 1000
    this.emit('complete', {
      path: destPath,
      sizeBytes: downloadedBytes,
      duration: formatDuration(totalElapsed)
    })
  }

  private computeFileHash(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256')
      const stream = fs.createReadStream(filePath)
      stream.on('data', (chunk) => hash.update(chunk))
      stream.on('end', () => resolve(hash.digest('hex')))
      stream.on('error', reject)
    })
  }
}
