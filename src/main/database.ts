import BetterSqlite3, { Database as SQLiteDB } from 'better-sqlite3'
import { safeStorage } from 'electron'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  title TEXT,
  model_id TEXT,
  working_dir TEXT,
  goal TEXT,
  flags TEXT,
  status TEXT DEFAULT 'idle',
  created_at INTEGER,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  api_key BLOB NOT NULL,
  base_url TEXT,
  models TEXT NOT NULL,
  is_enabled INTEGER DEFAULT 1,
  created_at INTEGER
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
  is_enabled INTEGER DEFAULT 1,
  status TEXT DEFAULT 'stopped',
  last_error TEXT,
  tool_count INTEGER,
  created_at INTEGER
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
}
