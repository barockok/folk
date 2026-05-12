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
import { deleteMCP, findMCP, listAllMCPs, makeId, upsertMCP } from './mcp-config-store'
import { MCPOAuthStore } from './mcp-oauth-store'
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
  scope?: MCPServer['scope']
  projectPath?: string
}

// Build a fresh MCPServer record from a template. Defaults to user scope.
export function templateToServer(
  templateId: string,
  overrides: TemplateOverrides = {}
): MCPServer {
  const tpl = MCP_TEMPLATES[templateId]
  if (!tpl) throw new Error(`unknown template ${templateId}`)
  const scope = overrides.scope ?? 'user'
  const name = overrides.name ?? tpl.label
  return {
    id: makeId(scope, name, overrides.projectPath),
    name,
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
    createdAt: Date.now(),
    scope,
    projectPath: overrides.projectPath
  }
}

interface RpcConnection {
  request: <T>(method: string, params?: Record<string, unknown>) => Promise<T>
  close: () => void
}

// Spin up a stdio MCP server, perform `initialize`, return a small JSON-RPC
// shim. Each public inspection method (testConnection, listResources, …)
// opens its own connection.
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
        if (msg.id === 0 && !initialized) continue
        const p = pending.get(msg.id)
        if (!p) continue
        pending.delete(msg.id)
        if (msg.error) p.reject(new Error(msg.error.message ?? 'rpc error'))
        else p.resolve(msg.result)
      }
    })

    const initId = nextId++
    pending.set(initId, {
      resolve: () => {
        initialized = true
        clearTimeout(overallTimer)
        resolve({ request, close })
      },
      reject: (err) => {
        clearTimeout(overallTimer)
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
  #signInInFlight: string | null = null
  #oauth: MCPOAuthStore

  constructor(oauthSidecarPath: string) {
    this.#oauth = new MCPOAuthStore(oauthSidecarPath)
  }

  // Kept for API stability with old call sites. Folk no longer write-throughs
  // a separate file — Claude Code's ~/.claude.json IS the source of truth.
  setBusyCheck(_fn: () => boolean): void {
    /* no-op */
  }
  flushDeferredSync(): void {
    /* no-op */
  }

  async list(): Promise<MCPServer[]> {
    const servers = await listAllMCPs()
    const oauth = await this.#oauth.all()
    return servers.map((s) => {
      const rec = oauth[s.id]
      if (!rec) return s
      return {
        ...s,
        oauthClientId: rec.clientId,
        oauthClientSecret: rec.clientSecret,
        oauthMetadata: rec.metadata,
        oauthStatus: rec.status
      }
    })
  }

  async save(server: MCPServer): Promise<void> {
    if (server.scope === 'plugin') {
      throw new Error('Plugin-bundled MCP servers are read-only')
    }
    await upsertMCP(server)
    // Persist OAuth bookkeeping if present.
    if (
      server.oauthClientId ||
      server.oauthClientSecret ||
      server.oauthMetadata ||
      server.oauthStatus
    ) {
      await this.#oauth.set(server.id, {
        clientId: server.oauthClientId,
        clientSecret: server.oauthClientSecret,
        metadata: server.oauthMetadata,
        status: server.oauthStatus
      })
    }
  }

  async delete(id: string): Promise<void> {
    await deleteMCP(id)
    await this.#oauth.delete(id)
    await deleteTokens(id).catch(() => undefined)
  }

  // ── OAuth ──────────────────────────────────────────────────────────────────

  async signIn(id: string): Promise<{ ok: boolean; error?: string }> {
    const server = await findMCP(id)
    if (!server) return { ok: false, error: 'Server not found' }
    if (server.transport !== 'http' || !server.url) {
      return { ok: false, error: 'OAuth only applies to HTTP servers' }
    }
    if (this.#signInInFlight) {
      return { ok: false, error: 'Another sign-in is in progress. Finish or cancel that one first.' }
    }
    this.#signInInFlight = id
    const existing = (await this.#oauth.get(id)) ?? {
      clientId: null,
      clientSecret: null,
      metadata: null,
      status: null
    }
    try {
      const result = await runSignIn({
        serverId: server.id,
        serverUrl: server.url,
        providedClientId: existing.clientId,
        providedClientSecret: existing.clientSecret,
        cachedMetadata: existing.metadata
      })
      await this.#oauth.set(id, {
        clientId: result.clientId,
        clientSecret: result.clientSecret,
        metadata: result.metadata,
        status: 'authorized'
      })
      return { ok: true }
    } catch (err) {
      await this.#oauth.patch(id, { status: 'error' })
      return { ok: false, error: (err as Error).message }
    } finally {
      this.#signInInFlight = null
    }
  }

  async signOut(id: string): Promise<{ ok: boolean; error?: string }> {
    await deleteTokens(id)
    await this.#oauth.patch(id, { status: 'unauthorized' })
    return { ok: true }
  }

  async getAccessToken(id: string): Promise<string | null> {
    const rec = await this.#oauth.get(id)
    if (!rec) return null
    const tokens = await loadTokens(id)
    if (!tokens) return null

    const needsRefresh =
      tokens.expiresAt != null && Date.now() > tokens.expiresAt - 60_000
    if (!needsRefresh) return tokens.accessToken

    if (!tokens.refreshToken || !rec.metadata || !rec.clientId) {
      await this.#oauth.patch(id, { status: 'unauthorized' })
      await deleteTokens(id)
      return null
    }
    try {
      const fresh = await refreshAccessToken({
        metadata: rec.metadata,
        refreshToken: tokens.refreshToken,
        clientId: rec.clientId,
        clientSecret: rec.clientSecret
      })
      if (!fresh.refreshToken) fresh.refreshToken = tokens.refreshToken
      await storeTokens(id, fresh)
      return fresh.accessToken
    } catch (err) {
      console.error('[mcp] token refresh failed:', err)
      await this.#oauth.patch(id, { status: 'unauthorized' })
      return null
    }
  }

  async testConnection(
    id: string
  ): Promise<{ ok: boolean; tools: ToolInfo[]; error?: string }> {
    const server = await findMCP(id)
    if (!server) return { ok: false, tools: [], error: 'not found' }
    let conn: RpcConnection
    try {
      conn = await connectStdioMCP(server)
    } catch (err) {
      return { ok: false, tools: [], error: (err as Error).message }
    }
    try {
      const res = await conn.request<{ tools: Array<{ name: string; description?: string }> }>(
        'tools/list'
      )
      const tools: ToolInfo[] = res.tools.map((t) => ({
        name: t.name,
        description: t.description
      }))
      return { ok: true, tools }
    } catch (err) {
      return { ok: false, tools: [], error: (err as Error).message }
    } finally {
      conn.close()
    }
  }

  async listResources(
    id: string
  ): Promise<{ ok: boolean; resources: MCPResource[]; error?: string }> {
    const server = await findMCP(id)
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
    const server = await findMCP(id)
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
    const server = await findMCP(id)
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
    const server = await findMCP(id)
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
