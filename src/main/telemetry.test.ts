import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

vi.mock('posthog-node', () => ({
  PostHog: vi.fn().mockImplementation(() => ({
    capture: vi.fn(),
    shutdown: vi.fn().mockResolvedValue(undefined),
    optIn: vi.fn(),
    optOut: vi.fn(),
  })),
}))

import { Telemetry } from './telemetry'

describe('Telemetry config persistence', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'folk-tel-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('creates config file with random uuid + enabled:true on first run', () => {
    const t = new Telemetry({ userDataDir: dir, posthogKey: 'phc_test', host: 'https://x' })
    const cfg = t.getConfig()
    expect(cfg.distinctId).toMatch(/^[0-9a-f-]{36}$/)
    expect(cfg.enabled).toBe(true)
    const onDisk = JSON.parse(readFileSync(join(dir, 'folk-telemetry.json'), 'utf8'))
    expect(onDisk.distinctId).toBe(cfg.distinctId)
  })

  it('reuses existing distinctId across instances', () => {
    const a = new Telemetry({ userDataDir: dir, posthogKey: 'phc_test', host: 'https://x' })
    const id = a.getConfig().distinctId
    const b = new Telemetry({ userDataDir: dir, posthogKey: 'phc_test', host: 'https://x' })
    expect(b.getConfig().distinctId).toBe(id)
  })

  it('persists setEnabled toggle to disk', () => {
    const t = new Telemetry({ userDataDir: dir, posthogKey: 'phc_test', host: 'https://x' })
    t.setEnabled(false)
    const onDisk = JSON.parse(readFileSync(join(dir, 'folk-telemetry.json'), 'utf8'))
    expect(onDisk.enabled).toBe(false)
    expect(t.getConfig().enabled).toBe(false)
  })

  it('recovers from corrupt config file by recreating', () => {
    writeFileSync(join(dir, 'folk-telemetry.json'), 'not json {{{')
    const t = new Telemetry({ userDataDir: dir, posthogKey: 'phc_test', host: 'https://x' })
    expect(t.getConfig().distinctId).toMatch(/^[0-9a-f-]{36}$/)
    expect(t.getConfig().enabled).toBe(true)
  })
})
