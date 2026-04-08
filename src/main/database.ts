import Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'
import type {
  Conversation,
  Message,
  ToolCall,
  Artifact,
  MCPServer,
  ContentBlock
} from '../shared/types'

export class DatabaseManager {
  private db: Database.Database

  constructor(dbPath: string) {
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    this.runMigrations()
  }

  private runMigrations(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        workspace_path TEXT,
        is_archived INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        token_count INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);

      CREATE TABLE IF NOT EXISTS tool_calls (
        id TEXT PRIMARY KEY,
        message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        tool_name TEXT NOT NULL,
        input TEXT,
        output TEXT,
        status TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        completed_at INTEGER,
        duration_ms INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_tool_calls_msg ON tool_calls(message_id);

      CREATE TABLE IF NOT EXISTS artifacts (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        message_id TEXT REFERENCES messages(id),
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT,
        file_path TEXT,
        language TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_artifacts_conv ON artifacts(conversation_id);

      CREATE TABLE IF NOT EXISTS mcp_servers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        transport TEXT NOT NULL,
        command TEXT,
        url TEXT,
        args TEXT,
        env TEXT,
        enabled INTEGER DEFAULT 1,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `)
  }

  listTables(): string[] {
    const rows = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[]
    return rows.map((r) => r.name)
  }

  // --- Conversations ---

  createConversation(title: string, workspacePath: string | null = null): Conversation {
    const id = uuidv4()
    const now = Date.now()
    this.db
      .prepare(
        `INSERT INTO conversations (id, title, created_at, updated_at, workspace_path, is_archived)
         VALUES (?, ?, ?, ?, ?, 0)`
      )
      .run(id, title, now, now, workspacePath)
    return { id, title, createdAt: now, updatedAt: now, workspacePath, isArchived: false }
  }

  getConversation(id: string): Conversation | null {
    const row = this.db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as
      | ConversationRow
      | undefined
    return row ? mapConversation(row) : null
  }

  listConversations(): Conversation[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM conversations WHERE is_archived = 0 ORDER BY updated_at DESC'
      )
      .all() as ConversationRow[]
    return rows.map(mapConversation)
  }

  deleteConversation(id: string): void {
    this.db.prepare('DELETE FROM conversations WHERE id = ?').run(id)
  }

  renameConversation(id: string, title: string): void {
    this.db.prepare('UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?').run(
      title,
      Date.now(),
      id
    )
  }

  updateConversationTimestamp(id: string): void {
    this.db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(Date.now(), id)
  }

  // --- Messages ---

  addMessage(
    conversationId: string,
    role: 'user' | 'assistant' | 'system',
    content: ContentBlock[],
    tokenCount: number | null = null
  ): Message {
    const id = uuidv4()
    const now = Date.now()
    const contentJson = JSON.stringify(content)
    this.db
      .prepare(
        `INSERT INTO messages (id, conversation_id, role, content, created_at, token_count)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(id, conversationId, role, contentJson, now, tokenCount)
    return { id, conversationId, role, content, createdAt: now, tokenCount }
  }

  getMessages(conversationId: string): Message[] {
    const rows = this.db
      .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC')
      .all(conversationId) as MessageRow[]
    return rows.map(mapMessage)
  }

  // --- Tool Calls ---

  addToolCall(
    messageId: string,
    toolName: string,
    input: Record<string, unknown> | null
  ): ToolCall {
    const id = uuidv4()
    const now = Date.now()
    const inputJson = input ? JSON.stringify(input) : null
    this.db
      .prepare(
        `INSERT INTO tool_calls (id, message_id, tool_name, input, output, status, started_at, completed_at, duration_ms)
         VALUES (?, ?, ?, ?, NULL, 'running', ?, NULL, NULL)`
      )
      .run(id, messageId, toolName, inputJson, now)
    return {
      id,
      messageId,
      toolName,
      input,
      output: null,
      status: 'running',
      startedAt: now,
      completedAt: null,
      durationMs: null
    }
  }

  completeToolCall(id: string, output: Record<string, unknown> | null, status: 'success' | 'error'): void {
    const now = Date.now()
    const row = this.db.prepare('SELECT started_at FROM tool_calls WHERE id = ?').get(id) as
      | { started_at: number }
      | undefined
    const durationMs = row ? now - row.started_at : null
    this.db
      .prepare(
        'UPDATE tool_calls SET output = ?, status = ?, completed_at = ?, duration_ms = ? WHERE id = ?'
      )
      .run(output ? JSON.stringify(output) : null, status, now, durationMs, id)
  }

  getToolCalls(messageId: string): ToolCall[] {
    const rows = this.db
      .prepare('SELECT * FROM tool_calls WHERE message_id = ?')
      .all(messageId) as ToolCallRow[]
    return rows.map(mapToolCall)
  }

  // --- Artifacts ---

  addArtifact(
    conversationId: string,
    messageId: string | null,
    type: 'file' | 'code' | 'markdown' | 'image',
    title: string,
    content: string | null,
    filePath: string | null,
    language: string | null
  ): Artifact {
    const id = uuidv4()
    const now = Date.now()
    this.db
      .prepare(
        `INSERT INTO artifacts (id, conversation_id, message_id, type, title, content, file_path, language, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, conversationId, messageId, type, title, content, filePath, language, now)
    return { id, conversationId, messageId, type, title, content, filePath, language, createdAt: now }
  }

  getArtifacts(conversationId: string): Artifact[] {
    const rows = this.db
      .prepare('SELECT * FROM artifacts WHERE conversation_id = ?')
      .all(conversationId) as ArtifactRow[]
    return rows.map(mapArtifact)
  }

  // --- MCP Servers ---

  addMCPServer(config: Omit<MCPServer, 'id' | 'createdAt'>): MCPServer {
    const id = uuidv4()
    const now = Date.now()
    this.db
      .prepare(
        `INSERT INTO mcp_servers (id, name, transport, command, url, args, env, enabled, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        config.name,
        config.transport,
        config.command,
        config.url,
        config.args ? JSON.stringify(config.args) : null,
        config.env ? JSON.stringify(config.env) : null,
        config.enabled ? 1 : 0,
        now
      )
    return { id, ...config, createdAt: now }
  }

  listMCPServers(): MCPServer[] {
    const rows = this.db.prepare('SELECT * FROM mcp_servers').all() as MCPServerRow[]
    return rows.map(mapMCPServer)
  }

  removeMCPServer(id: string): void {
    this.db.prepare('DELETE FROM mcp_servers WHERE id = ?').run(id)
  }

  // --- Settings ---

  getSetting(key: string): unknown {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
      | { value: string }
      | undefined
    return row ? JSON.parse(row.value) : null
  }

  setSetting(key: string, value: unknown): void {
    this.db
      .prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
      .run(key, JSON.stringify(value))
  }

  close(): void {
    this.db.close()
  }
}

// --- Row types (snake_case from DB) ---

interface ConversationRow {
  id: string
  title: string
  created_at: number
  updated_at: number
  workspace_path: string | null
  is_archived: number
}

interface MessageRow {
  id: string
  conversation_id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  created_at: number
  token_count: number | null
}

interface ToolCallRow {
  id: string
  message_id: string
  tool_name: string
  input: string | null
  output: string | null
  status: 'running' | 'success' | 'error'
  started_at: number
  completed_at: number | null
  duration_ms: number | null
}

interface ArtifactRow {
  id: string
  conversation_id: string
  message_id: string | null
  type: 'file' | 'code' | 'markdown' | 'image'
  title: string
  content: string | null
  file_path: string | null
  language: string | null
  created_at: number
}

interface MCPServerRow {
  id: string
  name: string
  transport: 'stdio' | 'sse'
  command: string | null
  url: string | null
  args: string | null
  env: string | null
  enabled: number
  created_at: number
}

// --- Mappers ---

function mapConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    workspacePath: row.workspace_path,
    isArchived: row.is_archived === 1
  }
}

function mapMessage(row: MessageRow): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: JSON.parse(row.content),
    createdAt: row.created_at,
    tokenCount: row.token_count
  }
}

function mapToolCall(row: ToolCallRow): ToolCall {
  return {
    id: row.id,
    messageId: row.message_id,
    toolName: row.tool_name,
    input: row.input ? JSON.parse(row.input) : null,
    output: row.output ? JSON.parse(row.output) : null,
    status: row.status,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    durationMs: row.duration_ms
  }
}

function mapArtifact(row: ArtifactRow): Artifact {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    messageId: row.message_id,
    type: row.type,
    title: row.title,
    content: row.content,
    filePath: row.file_path,
    language: row.language,
    createdAt: row.created_at
  }
}

function mapMCPServer(row: MCPServerRow): MCPServer {
  return {
    id: row.id,
    name: row.name,
    transport: row.transport,
    command: row.command,
    url: row.url,
    args: row.args ? JSON.parse(row.args) : null,
    env: row.env ? JSON.parse(row.env) : null,
    enabled: row.enabled === 1,
    createdAt: row.created_at
  }
}
