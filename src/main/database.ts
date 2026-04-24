import BetterSqlite3, { Database as SQLiteDB } from 'better-sqlite3'
import { safeStorage } from 'electron'
import type { Session, SessionConfig } from '@shared/types'
import { randomUUID } from 'node:crypto'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  model_id TEXT NOT NULL,
  working_dir TEXT NOT NULL,
  goal TEXT,
  flags TEXT,
  status TEXT NOT NULL DEFAULT 'idle',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  api_key BLOB NOT NULL,
  base_url TEXT,
  models TEXT NOT NULL,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS mcp_servers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  template TEXT,
  transport TEXT NOT NULL,
  command TEXT,
  args TEXT,
  env TEXT,
  url TEXT,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'stopped',
  last_error TEXT,
  tool_count INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  nickname TEXT,
  pronouns TEXT,
  role TEXT,
  tone TEXT,
  avatar_color TEXT,
  about TEXT
);
`

export class Database {
  readonly db: SQLiteDB

  constructor(filePath: string) {
    this.db = new BetterSqlite3(filePath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    this.db.exec(SCHEMA)
  }

  close(): void {
    this.db.close()
  }

  // --- raw helpers used by tests & feature modules ---
  rawTableNames(): string[] {
    return this.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r: any) => r.name as string)
  }

  rawPragma(key: string): string {
    const row = this.db.pragma(key, { simple: true })
    return String(row)
  }

  // --- API-key encryption helpers (used by provider CRUD) ---
  encryptSecret(plain: string): Buffer {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('safeStorage encryption not available on this platform')
    }
    return safeStorage.encryptString(plain)
  }

  decryptSecret(buf: Buffer): string {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('safeStorage encryption not available on this platform')
    }
    return safeStorage.decryptString(buf)
  }

  createSession(config: SessionConfig): Session {
    const now = Date.now()
    const row: Session = {
      id: randomUUID(),
      title: config.title ?? 'Untitled session',
      modelId: config.modelId,
      workingDir: config.workingDir,
      goal: config.goal ?? null,
      flags: config.flags ?? null,
      status: 'idle',
      createdAt: now,
      updatedAt: now
    }
    this.db
      .prepare(
        `INSERT INTO sessions (id, title, model_id, working_dir, goal, flags, status, created_at, updated_at)
         VALUES (@id, @title, @modelId, @workingDir, @goal, @flags, @status, @createdAt, @updatedAt)`
      )
      .run(row)
    return row
  }

  listSessions(): Session[] {
    const rows = this.db
      .prepare(`SELECT * FROM sessions ORDER BY updated_at DESC`)
      .all() as Array<Record<string, unknown>>
    return rows.map(this.#toSession)
  }

  getSession(id: string): Session | null {
    const row = this.db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(id) as
      | Record<string, unknown>
      | undefined
    return row ? this.#toSession(row) : null
  }

  updateSession(id: string, patch: Partial<Session>): void {
    const existing = this.getSession(id)
    if (!existing) throw new Error(`session ${id} not found`)
    // Guarantee monotonic increase so listSessions ordering is stable even
    // when Date.now() resolution (1ms) is coarser than operation latency.
    const maxRow = this.db
      .prepare(`SELECT MAX(updated_at) AS m FROM sessions`)
      .get() as { m: number | null }
    const nextTs = Math.max(Date.now(), (maxRow.m ?? 0) + 1)
    const merged = { ...existing, ...patch, updatedAt: nextTs }
    this.db
      .prepare(
        `UPDATE sessions SET title = @title, model_id = @modelId, working_dir = @workingDir,
         goal = @goal, flags = @flags, status = @status, updated_at = @updatedAt WHERE id = @id`
      )
      .run(merged)
  }

  deleteSession(id: string): void {
    this.db.prepare(`DELETE FROM sessions WHERE id = ?`).run(id)
  }

  #toSession = (row: Record<string, unknown>): Session => ({
    id: row.id as string,
    title: (row.title as string) ?? '',
    modelId: (row.model_id as string) ?? '',
    workingDir: (row.working_dir as string) ?? '',
    goal: (row.goal as string) ?? null,
    flags: (row.flags as string) ?? null,
    status: (row.status as Session['status']) ?? 'idle',
    createdAt: Number(row.created_at ?? 0),
    updatedAt: Number(row.updated_at ?? 0)
  })
}
