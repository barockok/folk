import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { AgentManager } from './agent-manager'
import { Database } from './database'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { __setQueryImpl, __resetQueryImpl, makeQuery } from './__mocks__/claude-agent-sdk'
import type { AgentError } from '@shared/types'

describe('AgentManager.createSession', () => {
  let db: Database
  let dir: string
  let mgr: AgentManager

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'folk-agent-'))
    db = new Database(join(dir, 'folk.db'))
    mgr = new AgentManager(db)
  })

  afterEach(() => {
    mgr.dispose()
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('persists a session and exposes it via getSession', async () => {
    db.saveProvider({
      id: 'anthropic',
      name: 'Anthropic',
      apiKey: 'sk-ant',
      baseUrl: null,
      models: [{ id: 'claude-sonnet-4-5', label: 'Sonnet', enabled: true }],
      isEnabled: true,
      createdAt: Date.now()
    })
    const s = await mgr.createSession({
      modelId: 'claude-sonnet-4-5',
      workingDir: dir
    })
    expect(s.id).toBeTruthy()
    expect(mgr.getSession(s.id)).toBeTruthy()
  })
})

describe('AgentManager.sendMessage', () => {
  let db: Database
  let dir: string
  let mgr: AgentManager

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'folk-agent-'))
    db = new Database(join(dir, 'folk.db'))
    mgr = new AgentManager(db)
    db.saveProvider({
      id: 'anthropic',
      name: 'Anthropic',
      apiKey: 'sk',
      baseUrl: null,
      models: [{ id: 'm', label: 'M', enabled: true }],
      isEnabled: true,
      createdAt: Date.now()
    })
  })

  afterEach(() => {
    mgr.dispose()
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('emits chunk and done events and sets status', async () => {
    const s = await mgr.createSession({ modelId: 'm', workingDir: dir })
    const chunks: string[] = []
    mgr.on('chunk', (e) => chunks.push(e.text))
    const done = new Promise<void>((res) => mgr.once('done', () => res()))
    await mgr.sendMessage(s.id, 'hi')
    await done
    expect(chunks).toEqual(['hello'])
    expect(mgr.getSession(s.id)?.status).toBe('idle')
  })
})

describe('AgentManager.cancel & error mapping', () => {
  let db: Database
  let dir: string
  let mgr: AgentManager

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'folk-agent-'))
    db = new Database(join(dir, 'folk.db'))
    mgr = new AgentManager(db)
    db.saveProvider({
      id: 'anthropic',
      name: 'Anthropic',
      apiKey: 'sk',
      baseUrl: null,
      models: [{ id: 'm', label: 'M', enabled: true }],
      isEnabled: true,
      createdAt: Date.now()
    })
  })

  afterEach(() => {
    mgr.dispose()
    db.close()
    rmSync(dir, { recursive: true, force: true })
    __resetQueryImpl()
  })

  it('maps 401 to auth error, not retryable', async () => {
    __setQueryImpl(() =>
      makeQuery([], {
        throwBefore: Object.assign(new Error('401 unauthorized'), { code: '401' })
      })
    )
    const s = await mgr.createSession({ modelId: 'm', workingDir: dir })
    const err = new Promise<AgentError>((res) => mgr.once('error', (e) => res(e)))
    await mgr.sendMessage(s.id, 'hi').catch(() => undefined)
    const e = await err
    expect(e.code).toBe('auth')
    expect(e.retryable).toBe(false)
  })

  it('cancel sets session status to cancelled', async () => {
    const s = await mgr.createSession({ modelId: 'm', workingDir: dir })
    await mgr.sendMessage(s.id, 'hi').catch(() => undefined)
    await mgr.cancel(s.id)
    expect(mgr.getSession(s.id)?.status).toBe('cancelled')
  })
})
