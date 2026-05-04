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

export type ProviderType = 'anthropic' | 'openai' | 'google' | 'openai-compatible'
export type PermissionMode = 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions'
export type ErrorCode = 'auth' | 'quota' | 'offline' | 'cancelled' | 'crash' | 'unknown'
export type CostBucket = '<$0.01' | '$0.01-0.10' | '$0.10-1.00' | '$1+'
export type DurationBucket = '<30s' | '30s-2m' | '2m-10m' | '10m+'

export function costBucket(usd: number): CostBucket {
  if (usd < 0.01) return '<$0.01'
  if (usd < 0.1) return '$0.01-0.10'
  if (usd < 1) return '$0.10-1.00'
  return '$1+'
}

export function durationBucket(ms: number): DurationBucket {
  if (ms < 30_000) return '<30s'
  if (ms < 120_000) return '30s-2m'
  if (ms < 600_000) return '2m-10m'
  return '10m+'
}

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

  // Test seam — production code calls this; tests can override.
  _capture(event: string, props: Record<string, unknown>): void {
    if (!this.#client || !this.#config.enabled) return
    this.#client.capture({
      distinctId: this.#config.distinctId,
      event,
      properties: props,
    })
  }

  captureAppLaunched(p: { app_version: string; platform: string; arch: string }): void {
    this._capture('app_launched', p)
  }

  captureAppQuit(p: { uptime_ms: number }): void {
    this._capture('app_quit', p)
  }

  captureSessionStarted(p: {
    provider_type: ProviderType
    permission_mode: PermissionMode
    is_incognito: boolean
    mcp_count: number
  }): void {
    this._capture('session_started', { ...p, has_mcps: p.mcp_count > 0 })
  }

  captureSessionCompleted(p: {
    provider_type: ProviderType
    turn_count: number
    cost_usd: number
    duration_ms: number
  }): void {
    this._capture('session_completed', {
      provider_type: p.provider_type,
      turn_count: p.turn_count,
      cost_bucket: costBucket(p.cost_usd),
      duration_bucket: durationBucket(p.duration_ms),
    })
  }

  captureSessionError(p: { error_code: ErrorCode; provider_type: ProviderType }): void {
    this._capture('session_error', p)
  }

  captureUpdateAvailable(p: { from_version: string; to_version: string }): void {
    this._capture('update_available', p)
  }

  captureUpdateInstalled(p: { from_version: string; to_version: string }): void {
    this._capture('update_installed', p)
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
