import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PostHog } from 'posthog-node'

export interface TelemetryConfig {
  distinctId: string
  enabled: boolean
}

export interface TelemetryOptions {
  userDataDir: string
  posthogKey: string
  host: string
}

const FILE_NAME = 'folk-telemetry.json'

export class Telemetry {
  #file: string
  #config: TelemetryConfig
  #client: PostHog | null = null

  constructor(opts: TelemetryOptions) {
    if (!existsSync(opts.userDataDir)) mkdirSync(opts.userDataDir, { recursive: true })
    this.#file = join(opts.userDataDir, FILE_NAME)
    this.#config = this.#loadOrCreate()

    if (opts.posthogKey) {
      this.#client = new PostHog(opts.posthogKey, {
        host: opts.host,
        disableGeoip: true,
        flushAt: 10,
        flushInterval: 30_000,
      })
      if (!this.#config.enabled) this.#client.optOut()
    }
  }

  getConfig(): TelemetryConfig {
    return { ...this.#config }
  }

  setEnabled(enabled: boolean): void {
    this.#config.enabled = enabled
    this.#persist()
    if (this.#client) {
      if (enabled) this.#client.optIn()
      else this.#client.optOut()
    }
  }

  async shutdown(): Promise<void> {
    if (this.#client) await this.#client.shutdown()
  }

  #loadOrCreate(): TelemetryConfig {
    if (existsSync(this.#file)) {
      try {
        const raw = JSON.parse(readFileSync(this.#file, 'utf8'))
        if (typeof raw?.distinctId === 'string' && typeof raw?.enabled === 'boolean') {
          return { distinctId: raw.distinctId, enabled: raw.enabled }
        }
      } catch {
        // fall through to recreate
      }
    }
    const fresh: TelemetryConfig = { distinctId: randomUUID(), enabled: true }
    writeFileSync(this.#file, JSON.stringify(fresh, null, 2))
    return fresh
  }

  #persist(): void {
    writeFileSync(this.#file, JSON.stringify(this.#config, null, 2))
  }
}
