import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Database } from './database'
import { rmSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Session, ProviderConfig } from '@shared/types'

describe('Database.init', () => {
  let dir: string
  let db: Database

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'folk-db-'))
  })

  afterEach(() => {
    db?.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('creates all tables on first init', () => {
    db = new Database(join(dir, 'folk.db'))
    const tables = db.rawTableNames()
    expect(tables).toEqual(
      expect.arrayContaining(['sessions', 'providers', 'mcp_servers', 'profile'])
    )
  })

  it('enables WAL journaling', () => {
    db = new Database(join(dir, 'folk.db'))
    expect(db.rawPragma('journal_mode')).toBe('wal')
  })
})

describe('sessions CRUD', () => {
  let dir: string
  let db: Database

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'folk-db-'))
    db = new Database(join(dir, 'folk.db'))
  })

  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('createSession persists and returns the row', () => {
    const s = db.createSession({
      modelId: 'claude-sonnet-4-5',
      workingDir: '/tmp/project'
    })
    expect(s.id).toBeTruthy()
    expect(s.status).toBe('idle')
    expect(s.createdAt).toBeGreaterThan(0)
  })

  it('listSessions returns rows in updatedAt desc', () => {
    db.createSession({ modelId: 'm', workingDir: '/a' })
    const b = db.createSession({ modelId: 'm', workingDir: '/b' })
    db.updateSession(b.id, { title: 'B' })
    const rows = db.listSessions()
    expect(rows[0].id).toBe(b.id)
  })

  it('deleteSession removes the row', () => {
    const s = db.createSession({ modelId: 'm', workingDir: '/a' })
    db.deleteSession(s.id)
    expect(db.getSession(s.id)).toBeNull()
  })
})

describe('providers CRUD', () => {
  let dir: string
  let db: Database

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'folk-db-'))
    db = new Database(join(dir, 'folk.db'))
  })

  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('saveProvider encrypts api key at rest', () => {
    db.saveProvider({
      id: 'anthropic',
      name: 'Anthropic',
      apiKey: 'sk-ant-xxx',
      authMode: 'api-key',
      baseUrl: null,
      models: [{ id: 'claude-sonnet-4-5', label: 'Sonnet', enabled: true }],
      isEnabled: true,
      createdAt: Date.now()
    })
    const raw = db.db
      .prepare('SELECT api_key FROM providers WHERE id = ?')
      .get('anthropic') as { api_key: Buffer }
    expect(raw.api_key.toString('utf8')).not.toContain('sk-ant-xxx')
  })

  it('listProviders decrypts api keys', () => {
    db.saveProvider({
      id: 'anthropic',
      name: 'Anthropic',
      apiKey: 'sk-ant-xxx',
      authMode: 'api-key',
      baseUrl: null,
      models: [],
      isEnabled: true,
      createdAt: Date.now()
    })
    const rows = db.listProviders()
    expect(rows[0].apiKey).toBe('sk-ant-xxx')
  })

  it('deleteProvider removes the row', () => {
    db.saveProvider({
      id: 'p1',
      name: 'X',
      apiKey: 'k',
      authMode: 'api-key',
      baseUrl: null,
      models: [],
      isEnabled: true,
      createdAt: Date.now()
    })
    db.deleteProvider('p1')
    expect(db.listProviders().length).toBe(0)
  })
})

describe('mcp servers CRUD', () => {
  let dir: string
  let db: Database

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'folk-db-'))
    db = new Database(join(dir, 'folk.db'))
  })

  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('saveMCP persists stdio server with args/env round-trip', () => {
    db.saveMCP({
      id: 'fs',
      name: 'Filesystem',
      template: 'filesystem',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
      env: { DEBUG: '1' },
      url: null,
      isEnabled: true,
      status: 'stopped',
      lastError: null,
      toolCount: null,
      createdAt: Date.now()
    })
    const got = db.listMCPs()[0]
    expect(got.args).toEqual(['-y', '@modelcontextprotocol/server-filesystem', '/tmp'])
    expect(got.env).toEqual({ DEBUG: '1' })
  })
})

describe('profile', () => {
  let dir: string
  let db: Database

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'folk-db-'))
    db = new Database(join(dir, 'folk.db'))
  })

  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('getProfile returns defaults when empty', () => {
    const p = db.getProfile()
    expect(p.nickname).toBe('')
    expect(p.avatarColor).toBeTruthy()
  })

  it('saveProfile upserts singleton row', () => {
    db.saveProfile({
      nickname: 'Z',
      pronouns: 'they/them',
      role: 'dev',
      tone: 'direct',
      avatarColor: '#635bff',
      about: 'hi'
    })
    const p = db.getProfile()
    expect(p.nickname).toBe('Z')
    db.saveProfile({ ...p, nickname: 'Zid' })
    expect(db.getProfile().nickname).toBe('Zid')
  })
})
