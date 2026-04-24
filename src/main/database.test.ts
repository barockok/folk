import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Database } from './database'
import { rmSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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
