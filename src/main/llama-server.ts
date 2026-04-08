import { EventEmitter } from 'events'
import { ChildProcess, spawn } from 'child_process'
import path from 'path'
import type { LlamaStatus } from '../shared/types'

export interface LlamaServerConfig {
  modelPath: string
  port: number
  contextSize: number
  gpuLayers?: number
  binaryPath?: string
}

export class LlamaServerManager extends EventEmitter {
  private config: LlamaServerConfig
  private status: LlamaStatus = 'stopped'
  private process: ChildProcess | null = null
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null
  private restartCount = 0
  private static readonly MAX_RESTART_ATTEMPTS = 3

  constructor(config: LlamaServerConfig) {
    super()
    this.config = config
  }

  getStatus(): LlamaStatus {
    return this.status
  }

  getPort(): number {
    return this.config.port
  }

  getBaseUrl(): string {
    return `http://127.0.0.1:${this.config.port}`
  }

  buildArgs(): string[] {
    const args = [
      '--model',
      this.config.modelPath,
      '--jinja',
      '--port',
      String(this.config.port),
      '--ctx-size',
      String(this.config.contextSize)
    ]
    if (this.config.gpuLayers !== undefined) {
      args.push('--n-gpu-layers', String(this.config.gpuLayers))
    }
    return args
  }

  async start(): Promise<void> {
    if (this.status === 'ready' || this.status === 'starting') {
      return
    }

    this.setStatus('starting')
    this.restartCount = 0

    const binaryPath = this.config.binaryPath ?? this.getDefaultBinaryPath()
    const args = this.buildArgs()

    this.process = spawn(binaryPath, args, { stdio: ['ignore', 'pipe', 'pipe'] })

    this.process.stdout?.on('data', (data: Buffer) => {
      this.emit('log', data.toString())
    })

    this.process.stderr?.on('data', (data: Buffer) => {
      this.emit('log', data.toString())
    })

    this.process.on('exit', (_code, _signal) => {
      if (this.status !== 'stopped') {
        this.setStatus('error')
        this.stopHealthCheck()
        this.tryRestart()
      }
    })

    await this.waitForHealth()
    this.setStatus('ready')
    this.startHealthCheck()
  }

  async stop(): Promise<void> {
    this.stopHealthCheck()
    this.setStatus('stopped')

    if (!this.process) {
      return
    }

    const proc = this.process
    this.process = null

    return new Promise<void>((resolve) => {
      const killTimeout = setTimeout(() => {
        proc.kill('SIGKILL')
      }, 5000)

      proc.on('exit', () => {
        clearTimeout(killTimeout)
        resolve()
      })

      proc.kill('SIGTERM')
    })
  }

  private async waitForHealth(maxWaitMs = 60000): Promise<void> {
    const start = Date.now()
    const pollInterval = 500

    while (Date.now() - start < maxWaitMs) {
      try {
        const response = await fetch(`${this.getBaseUrl()}/health`)
        if (response.ok) {
          return
        }
      } catch {
        // Server not ready yet
      }
      await new Promise((resolve) => setTimeout(resolve, pollInterval))
    }

    throw new Error(`llama-server health check timed out after ${maxWaitMs}ms`)
  }

  private startHealthCheck(): void {
    this.stopHealthCheck()
    this.healthCheckInterval = setInterval(async () => {
      try {
        const response = await fetch(`${this.getBaseUrl()}/health`)
        if (!response.ok) {
          this.setStatus('error')
          this.stopHealthCheck()
          this.tryRestart()
        }
      } catch {
        this.setStatus('error')
        this.stopHealthCheck()
        this.tryRestart()
      }
    }, 10000)
  }

  private stopHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
      this.healthCheckInterval = null
    }
  }

  private tryRestart(): void {
    this.restartCount++
    if (this.restartCount <= LlamaServerManager.MAX_RESTART_ATTEMPTS) {
      this.emit('log', `Restarting llama-server (attempt ${this.restartCount}/${LlamaServerManager.MAX_RESTART_ATTEMPTS})`)
      this.start().catch((err) => {
        this.emit('log', `Restart failed: ${err}`)
        this.setStatus('error')
      })
    } else {
      this.emit('log', 'Max restart attempts reached, giving up')
      this.setStatus('error')
    }
  }

  private setStatus(status: LlamaStatus): void {
    this.status = status
    this.emit('status', status)
  }

  private getDefaultBinaryPath(): string {
    const { execSync } = require('child_process')

    // 1. Check bundled binary
    const platform = process.platform
    const arch = process.arch
    const resourcesPath =
      process.resourcesPath ?? path.join(path.dirname(process.execPath), 'resources')
    const bundledPath = path.join(resourcesPath, 'bin', `${platform}-${arch}`, 'llama-server')

    try {
      const fs = require('fs')
      if (fs.existsSync(bundledPath)) return bundledPath
    } catch {}

    // 2. Check common install locations
    const commonPaths = [
      '/opt/homebrew/bin/llama-server',
      '/usr/local/bin/llama-server',
      '/usr/bin/llama-server',
    ]
    for (const p of commonPaths) {
      try {
        const fs = require('fs')
        if (fs.existsSync(p)) return p
      } catch {}
    }

    // 3. Try to find via PATH using 'which'
    try {
      const result = execSync('which llama-server', { encoding: 'utf-8' }).trim()
      if (result) return result
    } catch {}

    // 4. Fallback to bundled path (will fail with clear error)
    return bundledPath
  }
}
