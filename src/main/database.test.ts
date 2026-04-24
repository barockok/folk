import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Database } from './database'
import { rmSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Session } from '@shared/types'

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
