import BetterSqlite3, { Database as SQLiteDB } from 'better-sqlite3'
import { app, safeStorage } from 'electron'
import type {
  Session,
  SessionConfig,
  ProviderConfig,
  ProviderAuthMode,
  ModelConfig,
  MCPServer,
  Profile
} from '@shared/types'
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID
} from 'node:crypto'
import { existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs'
import { dirname, join } from 'node:path'

// Dev builds aren't code-signed, so macOS Keychain ACLs don't persist between
// launches and electron's safeStorage prompts every time it decrypts. Fall
// back to a file-backed AES-GCM key. Packaged signed builds keep using
// safeStorage so secrets stay tied to the user's login keychain.
const SECRET_MAGIC = Buffer.from('FOLKDEV1')

function devKeyPath(dbPath: string): string {
  return join(dirname(dbPath), 'folk-dev.key')
}

function loadOrCreateDevKey(dbPath: string): Buffer {
  const p = devKeyPath(dbPath)
  if (existsSync(p)) {
    const k = readFileSync(p)
    if (k.length === 32) return k
  }
  const k = randomBytes(32)
  writeFileSync(p, k, { mode: 0o600 })
  try {
    chmodSync(p, 0o600)
  } catch {
    // best effort
  }
  return k
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  model_id TEXT NOT NULL,
  working_dir TEXT NOT NULL,
  goal TEXT,
  flags TEXT,
  status TEXT NOT NULL DEFAULT 'idle',
  claude_started INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  api_key BLOB NOT NULL,
  auth_mode TEXT NOT NULL DEFAULT 'api-key',
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

const DEFAULT_PROFILE: Profile = {
  nickname: '',
  pronouns: '',
  role: '',
  tone: '',
  avatarColor: '#635bff',
  about: ''
}

export class Database {
  readonly db: SQLiteDB

  #dbPath: string
  #devKey: Buffer | null = null

  constructor(filePath: string) {
    this.#dbPath = filePath
    this.db = new BetterSqlite3(filePath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    this.db.exec(SCHEMA)
    this.#migrate()
  }

  // Dev builds skip Electron safeStorage to avoid macOS keychain prompts.
  #useDevKey(): boolean {
    let packaged = false
    try {
      packaged = app.isPackaged
    } catch {
      packaged = false
    }
    return !packaged
  }

  #getDevKey(): Buffer {
    if (!this.#devKey) this.#devKey = loadOrCreateDevKey(this.#dbPath)
    return this.#devKey
  }

  #migrate(): void {
    const provCols = this.db
      .prepare(`PRAGMA table_info(providers)`)
      .all() as Array<{ name: string }>
    if (!provCols.some((c) => c.name === 'auth_mode')) {
      this.db
        .prepare(`ALTER TABLE providers ADD COLUMN auth_mode TEXT NOT NULL DEFAULT 'api-key'`)
        .run()
    }
    const sessCols = this.db
      .prepare(`PRAGMA table_info(sessions)`)
      .all() as Array<{ name: string }>
    if (!sessCols.some((c) => c.name === 'claude_started')) {
      this.db
        .prepare(`ALTER TABLE sessions ADD COLUMN claude_started INTEGER NOT NULL DEFAULT 0`)
        .run()
    }
    if (!sessCols.some((c) => c.name === 'permission_mode')) {
      this.db
        .prepare(
          `ALTER TABLE sessions ADD COLUMN permission_mode TEXT NOT NULL DEFAULT 'default'`
        )
        .run()
    }
    const mcpCols = new Set(
      (this.db.prepare(`PRAGMA table_info(mcp_servers)`).all() as Array<{ name: string }>).map(
        (c) => c.name
      )
    )
    const mcpAdditions: Array<[string, string]> = [
      ['template', `ALTER TABLE mcp_servers ADD COLUMN template TEXT`],
      ['transport', `ALTER TABLE mcp_servers ADD COLUMN transport TEXT NOT NULL DEFAULT 'stdio'`],
      ['command', `ALTER TABLE mcp_servers ADD COLUMN command TEXT`],
      ['args', `ALTER TABLE mcp_servers ADD COLUMN args TEXT`],
      ['env', `ALTER TABLE mcp_servers ADD COLUMN env TEXT`],
      ['url', `ALTER TABLE mcp_servers ADD COLUMN url TEXT`],
      ['is_enabled', `ALTER TABLE mcp_servers ADD COLUMN is_enabled INTEGER NOT NULL DEFAULT 1`],
      ['status', `ALTER TABLE mcp_servers ADD COLUMN status TEXT NOT NULL DEFAULT 'stopped'`],
      ['last_error', `ALTER TABLE mcp_servers ADD COLUMN last_error TEXT`],
      ['tool_count', `ALTER TABLE mcp_servers ADD COLUMN tool_count INTEGER`]
    ]
    for (const [col, ddl] of mcpAdditions) {
      if (!mcpCols.has(col)) this.db.prepare(ddl).run()
    }
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
    if (this.#useDevKey()) {
      const key = this.#getDevKey()
      const iv = randomBytes(12)
      const cipher = createCipheriv('aes-256-gcm', key, iv)
      const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
      const tag = cipher.getAuthTag()
      // Magic prefix lets decrypt distinguish dev-key vs safeStorage payloads.
      return Buffer.concat([SECRET_MAGIC, iv, tag, enc])
    }
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('safeStorage encryption not available on this platform')
    }
    return safeStorage.encryptString(plain)
  }

  decryptSecret(buf: Buffer): string {
    // Empty buffer = no secret stored (e.g., claude-code auth providers).
    if (buf.length === 0) return ''
    if (buf.length >= SECRET_MAGIC.length && buf.subarray(0, SECRET_MAGIC.length).equals(SECRET_MAGIC)) {
      const key = this.#getDevKey()
      const iv = buf.subarray(SECRET_MAGIC.length, SECRET_MAGIC.length + 12)
      const tag = buf.subarray(SECRET_MAGIC.length + 12, SECRET_MAGIC.length + 12 + 16)
      const enc = buf.subarray(SECRET_MAGIC.length + 12 + 16)
      const decipher = createDecipheriv('aes-256-gcm', key, iv)
      decipher.setAuthTag(tag)
      return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8')
    }
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
      claudeStarted: false,
      permissionMode: config.permissionMode ?? 'default',
      createdAt: now,
      updatedAt: now
    }
    this.db
      .prepare(
        `INSERT INTO sessions (id, title, model_id, working_dir, goal, flags, status, claude_started, permission_mode, created_at, updated_at)
         VALUES (@id, @title, @modelId, @workingDir, @goal, @flags, @status, @claudeStarted, @permissionMode, @createdAt, @updatedAt)`
      )
      .run({ ...row, claudeStarted: row.claudeStarted ? 1 : 0 })
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
         goal = @goal, flags = @flags, status = @status, claude_started = @claudeStarted,
         permission_mode = @permissionMode, updated_at = @updatedAt WHERE id = @id`
      )
      .run({ ...merged, claudeStarted: merged.claudeStarted ? 1 : 0 })
  }

  deleteSession(id: string): void {
    this.db.prepare(`DELETE FROM sessions WHERE id = ?`).run(id)
  }

  saveProvider(p: ProviderConfig): void {
    // When using Claude Code auth, there may be no API key — encrypt empty string.
    const encKey = this.encryptSecret(p.apiKey ?? '')
    this.db
      .prepare(
        `INSERT INTO providers (id, name, api_key, auth_mode, base_url, models, is_enabled, created_at)
         VALUES (@id, @name, @apiKey, @authMode, @baseUrl, @models, @isEnabled, @createdAt)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           api_key = excluded.api_key,
           auth_mode = excluded.auth_mode,
           base_url = excluded.base_url,
           models = excluded.models,
           is_enabled = excluded.is_enabled`
      )
      .run({
        id: p.id,
        name: p.name,
        apiKey: encKey,
        authMode: p.authMode ?? 'api-key',
        baseUrl: p.baseUrl,
        models: JSON.stringify(p.models),
        isEnabled: p.isEnabled ? 1 : 0,
        createdAt: p.createdAt
      })
  }

  listProviders(): ProviderConfig[] {
    const rows = this.db
      .prepare(`SELECT * FROM providers ORDER BY created_at ASC`)
      .all() as Array<Record<string, unknown>>
    const updateStmt = this.db.prepare(`UPDATE providers SET api_key = ? WHERE id = ?`)
    return rows.map((r) => {
      const buf = r.api_key as Buffer
      const apiKey = this.decryptSecret(buf)
      // One-shot migration: in dev mode, re-encrypt any row that's still
      // wrapped in safeStorage so the next restart skips the macOS keychain
      // prompt entirely. Detect by checking for the dev-key magic prefix.
      if (
        this.#useDevKey() &&
        apiKey &&
        buf.length > 0 &&
        !(buf.length >= SECRET_MAGIC.length && buf.subarray(0, SECRET_MAGIC.length).equals(SECRET_MAGIC))
      ) {
        try {
          const reEnc = this.encryptSecret(apiKey)
          updateStmt.run(reEnc, r.id as string)
        } catch {
          // Migration failure shouldn't break listProviders — next restart
          // will retry. Worst case: prompt continues until a re-save.
        }
      }
      return {
        id: r.id as string,
        name: r.name as string,
        apiKey,
        authMode: ((r.auth_mode as string) ?? 'api-key') as ProviderAuthMode,
        baseUrl: (r.base_url as string) ?? null,
        models: JSON.parse((r.models as string) ?? '[]') as ModelConfig[],
        isEnabled: Number(r.is_enabled ?? 0) === 1,
        createdAt: Number(r.created_at ?? 0)
      }
    })
  }

  deleteProvider(id: string): void {
    this.db.prepare(`DELETE FROM providers WHERE id = ?`).run(id)
  }

  saveMCP(m: MCPServer): void {
    this.db
      .prepare(
        `INSERT INTO mcp_servers (id, name, template, transport, command, args, env, url,
           is_enabled, status, last_error, tool_count, created_at)
         VALUES (@id, @name, @template, @transport, @command, @args, @env, @url,
           @isEnabled, @status, @lastError, @toolCount, @createdAt)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name, template = excluded.template, transport = excluded.transport,
           command = excluded.command, args = excluded.args, env = excluded.env, url = excluded.url,
           is_enabled = excluded.is_enabled, status = excluded.status,
           last_error = excluded.last_error, tool_count = excluded.tool_count`
      )
      .run({
        id: m.id,
        name: m.name,
        template: m.template,
        transport: m.transport,
        command: m.command,
        args: m.args ? JSON.stringify(m.args) : null,
        env: m.env ? JSON.stringify(m.env) : null,
        url: m.url,
        isEnabled: m.isEnabled ? 1 : 0,
        status: m.status,
        lastError: m.lastError,
        toolCount: m.toolCount,
        createdAt: m.createdAt
      })
  }

  listMCPs(): MCPServer[] {
    const rows = this.db
      .prepare(`SELECT * FROM mcp_servers ORDER BY created_at ASC`)
      .all() as Array<Record<string, unknown>>
    return rows.map((r) => ({
      id: r.id as string,
      name: r.name as string,
      template: (r.template as string) ?? null,
      transport: r.transport as MCPServer['transport'],
      command: (r.command as string) ?? null,
      args: r.args ? (JSON.parse(r.args as string) as string[]) : null,
      env: r.env ? (JSON.parse(r.env as string) as Record<string, string>) : null,
      url: (r.url as string) ?? null,
      isEnabled: Number(r.is_enabled ?? 0) === 1,
      status: r.status as MCPServer['status'],
      lastError: (r.last_error as string) ?? null,
      toolCount: r.tool_count == null ? null : Number(r.tool_count),
      createdAt: Number(r.created_at ?? 0)
    }))
  }

  deleteMCP(id: string): void {
    this.db.prepare(`DELETE FROM mcp_servers WHERE id = ?`).run(id)
  }

  getProfile(): Profile {
    const row = this.db.prepare(`SELECT * FROM profile WHERE id = 1`).get() as
      | Record<string, unknown>
      | undefined
    if (!row) return { ...DEFAULT_PROFILE }
    return {
      nickname: (row.nickname as string) ?? '',
      pronouns: (row.pronouns as string) ?? '',
      role: (row.role as string) ?? '',
      tone: (row.tone as string) ?? '',
      avatarColor: (row.avatar_color as string) ?? DEFAULT_PROFILE.avatarColor,
      about: (row.about as string) ?? ''
    }
  }

  saveProfile(p: Profile): void {
    this.db
      .prepare(
        `INSERT INTO profile (id, nickname, pronouns, role, tone, avatar_color, about)
         VALUES (1, @nickname, @pronouns, @role, @tone, @avatarColor, @about)
         ON CONFLICT(id) DO UPDATE SET
           nickname = excluded.nickname, pronouns = excluded.pronouns,
           role = excluded.role, tone = excluded.tone,
           avatar_color = excluded.avatar_color, about = excluded.about`
      )
      .run(p)
  }

  #toSession = (row: Record<string, unknown>): Session => ({
    id: row.id as string,
    title: (row.title as string) ?? '',
    modelId: (row.model_id as string) ?? '',
    workingDir: (row.working_dir as string) ?? '',
    goal: (row.goal as string) ?? null,
    flags: (row.flags as string) ?? null,
    status: (row.status as Session['status']) ?? 'idle',
    claudeStarted: Number(row.claude_started ?? 0) === 1,
    permissionMode: ((row.permission_mode as string) ?? 'default') as Session['permissionMode'],
    createdAt: Number(row.created_at ?? 0),
    updatedAt: Number(row.updated_at ?? 0)
  })
}
