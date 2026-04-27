import { randomUUID } from 'node:crypto'
import { spawn, type ChildProcessByStdio } from 'node:child_process'
import type { Readable, Writable } from 'node:stream'
import type {
  MCPPrompt,
  MCPPromptMessage,
  MCPResource,
  MCPResourceContent,
  MCPServer,
  MCPTemplate,
  ToolInfo
} from '@shared/types'
import { Database } from './database'
import { discoverLocalMCPs } from './mcp-local-discovery'
import { applyFolkMCPs } from './mcp-config-writer'
import { deleteTokens, loadTokens, storeTokens } from './keychain'
import { refreshAccessToken, signIn as runSignIn } from './oauth'

export const MCP_TEMPLATES: Record<string, MCPTemplate> = {
  filesystem: {
    id: 'filesystem',
    label: 'Filesystem',
    command: 'npx',
    baseArgs: ['-y', '@modelcontextprotocol/server-filesystem'],
    transport: 'stdio',
    fields: [{ key: 'path', label: 'Root path', placeholder: '/Users/you/projects' }]
  },
  github: {
    id: 'github',
    label: 'GitHub',
    command: 'npx',
    baseArgs: ['-y', '@modelcontextprotocol/server-github'],
    transport: 'stdio',
    fields: [{ key: 'GITHUB_PERSONAL_ACCESS_TOKEN', label: 'GitHub PAT', secret: true }]
  },
  postgres: {
    id: 'postgres',
    label: 'Postgres',
    command: 'npx',
    baseArgs: ['-y', '@modelcontextprotocol/server-postgres'],
    transport: 'stdio',
    fields: [
      {
        key: 'connectionString',
        label: 'Connection string',
        placeholder: 'postgres://user:pass@host:5432/db'
      }
    ]
  },
  slack: {
    id: 'slack',
    label: 'Slack',
    command: 'npx',
    baseArgs: ['-y', '@modelcontextprotocol/server-slack'],
    transport: 'stdio',
    fields: [
      { key: 'SLACK_BOT_TOKEN', label: 'Bot token', secret: true },
      { key: 'SLACK_TEAM_ID', label: 'Team ID' }
    ]
  },
  notion: {
    id: 'notion',
    label: 'Notion',
    command: 'npx',
    baseArgs: ['-y', '@modelcontextprotocol/server-notion'],
    transport: 'stdio',
    fields: [{ key: 'NOTION_API_KEY', label: 'Integration token', secret: true }]
  },
  custom: {
    id: 'custom',
    label: 'Custom',
    transport: 'stdio',
    fields: []
  }
}

export interface TemplateOverrides {
  name?: string
  args?: string[]
  env?: Record<string, string>
  url?: string | null
  command?: string
  transport?: 'stdio' | 'http'
}

export function templateToServer(
  templateId: string,
  overrides: TemplateOverrides = {}
): MCPServer {
  const tpl = MCP_TEMPLATES[templateId]
  if (!tpl) throw new Error(`unknown template ${templateId}`)
  return {
    id: randomUUID(),
    name: overrides.name ?? tpl.label,
    template: templateId,
    transport: overrides.transport ?? tpl.transport,
    command: overrides.command ?? tpl.command ?? null,
    args: overrides.args
      ? [...(tpl.baseArgs ?? []), ...overrides.args]
      : (tpl.baseArgs ?? []).slice(),
    env: overrides.env ?? null,
    url: overrides.url ?? null,
    headers: null,
    oauthClientId: null,
    oauthClientSecret: null,
    oauthMetadata: null,
    oauthStatus: null,
    isEnabled: true,
    status: 'stopped',
    lastError: null,
    toolCount: null,
    createdAt: Date.now()
  }
}

interface RpcConnection {
  request: <T>(method: string, params?: Record<string, unknown>) => Promise<T>
  close: () => void
}

// Spin up a stdio MCP server, perform `initialize`, return a small JSON-RPC
// shim. Each public inspection method (testConnection, listResources, …)
// opens its own connection — MCP servers are usually cheap to start, and we
// don't want to keep long-lived processes around for an editor UI.
function connectStdioMCP(server: MCPServer, timeoutMs = 8000): Promise<RpcConnection> {
  return new Promise((resolve, reject) => {
    if (server.transport !== 'stdio' || !server.command) {
      reject(new Error('only stdio transport supported'))
      return
    }
    const child: ChildProcessByStdio<Writable, Readable, Readable> = spawn(
      server.command,
      server.args ?? [],
      {
        env: { ...process.env, ...(server.env ?? {}) },
        stdio: ['pipe', 'pipe', 'pipe']
      }
    )
    let stderr = ''
    let nextId = 1
    const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
    let buf = ''
    let initialized = false
    let closed = false

    const close = (): void => {
      if (closed) return
      closed = true
      try {
        child.kill('SIGTERM')
      } catch {
        /* ignore */
      }
      // Snapshot + clear before rejecting — pending callbacks may re-enter
      // close() (e.g. init reject calling close), and we don't want to iterate
      // a mutating map.
      const snapshot = [...pending.values()]
      pending.clear()
      for (const p of snapshot) p.reject(new Error('connection closed'))
    }

    const writeMsg = (msg: Record<string, unknown>): void => {
      try {
        child.stdin.write(JSON.stringify(msg) + '\n')
      } catch (err) {
        reject(err as Error)
      }
    }

    const request = <T>(method: string, params: Record<string, unknown> = {}): Promise<T> =>
      new Promise<T>((resolveReq, rejectReq) => {
        const id = nextId++
        pending.set(id, { resolve: (v) => resolveReq(v as T), reject: rejectReq })
        writeMsg({ jsonrpc: '2.0', id, method, params })
      })

    child.on('error', (err) => {
      close()
      reject(err)
    })
    child.stderr.on('data', (b) => {
      stderr += b.toString()
    })

    const overallTimer = setTimeout(() => {
      close()
      reject(new Error(stderr || 'init timed out'))
    }, timeoutMs)

    child.stdout.on('data', (b) => {
      buf += b.toString()
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.trim()) continue
        let msg: { id?: number; result?: unknown; error?: { message?: string } } | null = null
        try {
          msg = JSON.parse(line)
        } catch {
          continue
        }
        if (!msg || typeof msg.id !== 'number') continue
        if (msg.id === 0 && !initialized) {
          // shouldn't happen; init uses positive id
          continue
        }
        const p = pending.get(msg.id)
        if (!p) continue
        pending.delete(msg.id)
        if (msg.error) p.reject(new Error(msg.error.message ?? 'rpc error'))
        else p.resolve(msg.result)
      }
    })

    // initialize first; resolve outer promise once init completes
    const initId = nextId++
    pending.set(initId, {
      resolve: () => {
        initialized = true
        clearTimeout(overallTimer)
        resolve({ request, close })
      },
      reject: (err) => {
        clearTimeout(overallTimer)
        // Don't call close() here — we're already being invoked via close()'s
        // iteration of pending callbacks, or init failed naturally and the
        // child will exit on its own when stdin closes.
        reject(err)
      }
    })
    writeMsg({
      jsonrpc: '2.0',
      id: initId,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'folk', version: '0.1' }
      }
    })
  })
}

export class MCPManager {
  // Latest snapshot of CC-discovered local MCPs. Refreshed on every list()
  // call so #getServer can resolve `local:*` ids without rescanning.
  #localCache: MCPServer[] = []

  // Sidecar path for the write-through bookkeeping. Lives in folk's userData
  // dir, NOT under ~/.claude — the user's Claude Code dir stays clean.
  constructor(
    private db: Database,
    private syncSidecarPath: string
  ) {}

  async list(): Promise<MCPServer[]> {
    const folk = this.db.listMCPs()
    try {
      this.#localCache = await discoverLocalMCPs()
    } catch {
      this.#localCache = []
    }
    return [...folk, ...this.#localCache]
  }

  save(server: MCPServer): void {
    if (server.source === 'local') {
      throw new Error('Local MCP servers are read-only')
    }
    this.db.saveMCP(server)
    void this.#syncToClaudeCode()
  }

  delete(id: string): void {
    if (id.startsWith('local:')) {
      throw new Error('Local MCP servers are read-only')
    }
    this.db.deleteMCP(id)
    void this.#syncToClaudeCode()
  }

  // Write folk's enabled MCPs into ~/.claude/.mcp.json so they're visible to
  // the Claude Code CLI and any other surface that reads that file. Best
  // effort — failures are logged but don't break the IPC return.
  async syncToClaudeCode(): Promise<void> {
    try {
      const owned = this.db.listMCPs() // folk DB only — no local entries
      await applyFolkMCPs({ sidecarPath: this.syncSidecarPath, servers: owned })
    } catch (err) {
      console.error('[mcp] write-through to ~/.claude/.mcp.json failed:', err)
    }
  }

  #syncToClaudeCode(): void {
    void this.syncToClaudeCode()
  }

  // ── OAuth ──────────────────────────────────────────────────────────────────

  // Run the full OAuth sign-in flow for an HTTP server. Persists discovered
  // metadata + client credentials on the server record; tokens go to keychain.
  async signIn(id: string): Promise<{ ok: boolean; error?: string }> {
    const server = this.db.listMCPs().find((m) => m.id === id)
    if (!server) return { ok: false, error: 'Server not found' }
    if (server.transport !== 'http' || !server.url) {
      return { ok: false, error: 'OAuth only applies to HTTP servers' }
    }
    try {
      const result = await runSignIn({
        serverId: server.id,
        serverUrl: server.url,
        providedClientId: server.oauthClientId,
        providedClientSecret: server.oauthClientSecret,
        cachedMetadata: server.oauthMetadata
      })
      this.db.saveMCP({
        ...server,
        oauthMetadata: result.metadata,
        oauthClientId: result.clientId,
        oauthClientSecret: result.clientSecret,
        oauthStatus: 'authorized'
      })
      void this.syncToClaudeCode()
      return { ok: true }
    } catch (err) {
      this.db.saveMCP({ ...server, oauthStatus: 'error' })
      return { ok: false, error: (err as Error).message }
    }
  }

  // Sign out: drop tokens + reset status (keep metadata + clientId so the next
  // sign-in skips re-discovery / re-registration).
  async signOut(id: string): Promise<{ ok: boolean; error?: string }> {
    const server = this.db.listMCPs().find((m) => m.id === id)
    if (!server) return { ok: false, error: 'Server not found' }
    await deleteTokens(server.id)
    this.db.saveMCP({ ...server, oauthStatus: 'unauthorized' })
    return { ok: true }
  }

  // Look up the currently-stored access token for a server, refreshing if
  // it's expired or near-expiry. Returns null if there's no token at all
  // (caller must trigger sign-in).
  async getAccessToken(id: string): Promise<string | null> {
    const server = this.db.listMCPs().find((m) => m.id === id)
    if (!server) return null
    const tokens = await loadTokens(server.id)
    if (!tokens) return null

    // Refresh if we're inside the 60-second buffer window.
    const needsRefresh =
      tokens.expiresAt != null && Date.now() > tokens.expiresAt - 60_000
    if (!needsRefresh) return tokens.accessToken

    if (!tokens.refreshToken || !server.oauthMetadata || !server.oauthClientId) {
      // Can't refresh — surface as unauthorized so the UI prompts re-sign-in.
      this.db.saveMCP({ ...server, oauthStatus: 'unauthorized' })
      await deleteTokens(server.id)
      return null
    }
    try {
      const fresh = await refreshAccessToken({
        metadata: server.oauthMetadata,
        refreshToken: tokens.refreshToken,
        clientId: server.oauthClientId,
        clientSecret: server.oauthClientSecret
      })
      // Reuse the previous refresh token if the AS didn't rotate it.
      if (!fresh.refreshToken) fresh.refreshToken = tokens.refreshToken
      await storeTokens(server.id, fresh)
      return fresh.accessToken
    } catch (err) {
      console.error('[mcp] token refresh failed:', err)
      this.db.saveMCP({ ...server, oauthStatus: 'unauthorized' })
      return null
    }
  }

  async #getServer(id: string): Promise<MCPServer | null> {
    if (id.startsWith('local:')) {
      let hit = this.#localCache.find((m) => m.id === id)
      if (!hit) {
        // Cache cold (renderer can call listResources before list()). Refresh.
        try {
          this.#localCache = await discoverLocalMCPs()
        } catch {
          this.#localCache = []
        }
        hit = this.#localCache.find((m) => m.id === id)
      }
      return hit ?? null
    }
    return this.db.listMCPs().find((m) => m.id === id) ?? null
  }

  async testConnection(
    id: string
  ): Promise<{ ok: boolean; tools: ToolInfo[]; error?: string }> {
    const server = await this.#getServer(id)
    if (!server) return { ok: false, tools: [], error: 'not found' }
    let conn: RpcConnection
    try {
      conn = await connectStdioMCP(server)
    } catch (err) {
      const msg = (err as Error).message
      this.db.saveMCP({ ...server, lastError: msg })
      return { ok: false, tools: [], error: msg }
    }
    try {
      const res = await conn.request<{ tools: Array<{ name: string; description?: string }> }>(
        'tools/list'
      )
      const tools: ToolInfo[] = res.tools.map((t) => ({
        name: t.name,
        description: t.description
      }))
      this.db.saveMCP({ ...server, toolCount: tools.length, lastError: null })
      return { ok: true, tools }
    } catch (err) {
      const msg = (err as Error).message
      this.db.saveMCP({ ...server, lastError: msg })
      return { ok: false, tools: [], error: msg }
    } finally {
      conn.close()
    }
  }

  async listResources(
    id: string
  ): Promise<{ ok: boolean; resources: MCPResource[]; error?: string }> {
    const server = await this.#getServer(id)
    if (!server) return { ok: false, resources: [], error: 'not found' }
    let conn: RpcConnection
    try {
      conn = await connectStdioMCP(server)
    } catch (err) {
      return { ok: false, resources: [], error: (err as Error).message }
    }
    try {
      const res = await conn.request<{ resources: MCPResource[] }>('resources/list')
      return { ok: true, resources: res.resources ?? [] }
    } catch (err) {
      return { ok: false, resources: [], error: (err as Error).message }
    } finally {
      conn.close()
    }
  }

  async readResource(
    id: string,
    uri: string
  ): Promise<{ ok: boolean; contents: MCPResourceContent[]; error?: string }> {
    const server = await this.#getServer(id)
    if (!server) return { ok: false, contents: [], error: 'not found' }
    let conn: RpcConnection
    try {
      conn = await connectStdioMCP(server)
    } catch (err) {
      return { ok: false, contents: [], error: (err as Error).message }
    }
    try {
      const res = await conn.request<{ contents: MCPResourceContent[] }>('resources/read', { uri })
      return { ok: true, contents: res.contents ?? [] }
    } catch (err) {
      return { ok: false, contents: [], error: (err as Error).message }
    } finally {
      conn.close()
    }
  }

  async listPrompts(
    id: string
  ): Promise<{ ok: boolean; prompts: MCPPrompt[]; error?: string }> {
    const server = await this.#getServer(id)
    if (!server) return { ok: false, prompts: [], error: 'not found' }
    let conn: RpcConnection
    try {
      conn = await connectStdioMCP(server)
    } catch (err) {
      return { ok: false, prompts: [], error: (err as Error).message }
    }
    try {
      const res = await conn.request<{ prompts: MCPPrompt[] }>('prompts/list')
      return { ok: true, prompts: res.prompts ?? [] }
    } catch (err) {
      return { ok: false, prompts: [], error: (err as Error).message }
    } finally {
      conn.close()
    }
  }

  async getPrompt(
    id: string,
    name: string,
    args: Record<string, string> = {}
  ): Promise<{
    ok: boolean
    description?: string
    messages: MCPPromptMessage[]
    error?: string
  }> {
    const server = await this.#getServer(id)
    if (!server) return { ok: false, messages: [], error: 'not found' }
    let conn: RpcConnection
    try {
      conn = await connectStdioMCP(server)
    } catch (err) {
      return { ok: false, messages: [], error: (err as Error).message }
    }
    try {
      const res = await conn.request<{ description?: string; messages: MCPPromptMessage[] }>(
        'prompts/get',
        { name, arguments: args }
      )
      return { ok: true, description: res.description, messages: res.messages ?? [] }
    } catch (err) {
      return { ok: false, messages: [], error: (err as Error).message }
    } finally {
      conn.close()
    }
  }
}
