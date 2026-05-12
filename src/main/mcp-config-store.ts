// Single source of truth for MCP server entries: Claude Code's own config
// files. Folk reads + writes ~/.claude.json (mcpServers for user scope,
// projects[path].mcpServers for project scope). Plugin-bundled .mcp.json
// entries surface read-only. Legacy ~/.claude/.mcp.json and
// ~/.claude/mcp_servers.json are read for back-compat but never written.
//
// IDs are deterministic: `user:<name>` | `project:<path>:<name>` |
// `plugin:<pluginName>:<name>`.

import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { MCPServer } from '@shared/types'
import { discoverPlugins } from './disk-discovery'

const CLAUDE_JSON = join(homedir(), '.claude.json')
const LEGACY_USER_FILES = [
  join(homedir(), '.claude', 'mcp_servers.json'),
  join(homedir(), '.claude', '.mcp.json')
]

interface RawMCPEntry {
  type?: string
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
}

type FlatOrWrapped =
  | Record<string, RawMCPEntry>
  | { mcpServers?: Record<string, RawMCPEntry> }

interface ClaudeJson {
  mcpServers?: Record<string, RawMCPEntry>
  projects?: Record<string, { mcpServers?: Record<string, RawMCPEntry> }>
  [k: string]: unknown
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    const raw = await readFile(path, 'utf8')
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

async function writeJsonAtomic(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.tmp.${process.pid}.${Date.now()}`
  await writeFile(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8')
  try {
    await rename(tmp, path)
  } catch (err) {
    await unlink(tmp).catch(() => undefined)
    throw err
  }
}

function unwrap(obj: FlatOrWrapped | null): Record<string, RawMCPEntry> {
  if (!obj || typeof obj !== 'object') return {}
  if ('mcpServers' in obj) {
    const wrapped = (obj as { mcpServers?: Record<string, RawMCPEntry> }).mcpServers
    return wrapped && typeof wrapped === 'object' ? wrapped : {}
  }
  return obj as Record<string, RawMCPEntry>
}

function expandPluginRoot(value: string, root: string): string {
  return value.replaceAll('${CLAUDE_PLUGIN_ROOT}', root)
}

function expandEntry(raw: RawMCPEntry, root: string | null): RawMCPEntry {
  if (!root) return raw
  return {
    ...raw,
    command: raw.command ? expandPluginRoot(raw.command, root) : raw.command,
    args: raw.args?.map((a) => expandPluginRoot(a, root)),
    env: raw.env
      ? Object.fromEntries(
          Object.entries(raw.env).map(([k, v]) => [k, expandPluginRoot(v, root)])
        )
      : raw.env,
    url: raw.url ? expandPluginRoot(raw.url, root) : raw.url
  }
}

export function makeId(scope: MCPServer['scope'], name: string, projectPath?: string): string {
  if (scope === 'user') return `user:${name}`
  if (scope === 'project') return `project:${projectPath ?? ''}:${name}`
  return `plugin:${projectPath ?? ''}:${name}`
}

interface ParsedId {
  scope: MCPServer['scope']
  name: string
  projectPath?: string
}

export function parseId(id: string): ParsedId | null {
  if (id.startsWith('user:')) {
    return { scope: 'user', name: id.slice('user:'.length) }
  }
  if (id.startsWith('project:')) {
    const rest = id.slice('project:'.length)
    const lastColon = rest.lastIndexOf(':')
    if (lastColon < 0) return null
    return {
      scope: 'project',
      projectPath: rest.slice(0, lastColon),
      name: rest.slice(lastColon + 1)
    }
  }
  if (id.startsWith('plugin:')) {
    const rest = id.slice('plugin:'.length)
    const lastColon = rest.lastIndexOf(':')
    if (lastColon < 0) return null
    return {
      scope: 'plugin',
      projectPath: rest.slice(0, lastColon),
      name: rest.slice(lastColon + 1)
    }
  }
  return null
}

function buildServer(
  scope: MCPServer['scope'],
  name: string,
  raw: RawMCPEntry,
  sourcePath: string,
  projectPath?: string
): MCPServer {
  const transport: 'stdio' | 'http' =
    raw.url || raw.type === 'http' || raw.type === 'sse' ? 'http' : 'stdio'
  return {
    id: makeId(scope, name, projectPath),
    name,
    template: null,
    transport,
    command: raw.command ?? null,
    args: raw.args ?? null,
    env: raw.env ?? null,
    url: raw.url ?? null,
    headers: raw.headers ?? null,
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
    projectPath,
    sourcePath
  }
}

export async function listAllMCPs(): Promise<MCPServer[]> {
  const out: MCPServer[] = []
  const claudeJson = await readJson<ClaudeJson>(CLAUDE_JSON)

  // User scope: ~/.claude.json mcpServers
  if (claudeJson?.mcpServers) {
    for (const [name, raw] of Object.entries(claudeJson.mcpServers)) {
      if (!raw || typeof raw !== 'object') continue
      out.push(buildServer('user', name, raw, CLAUDE_JSON))
    }
  }
  // Project scope: ~/.claude.json projects[path].mcpServers
  if (claudeJson?.projects) {
    for (const [path, entry] of Object.entries(claudeJson.projects)) {
      if (!entry?.mcpServers) continue
      for (const [name, raw] of Object.entries(entry.mcpServers)) {
        if (!raw || typeof raw !== 'object') continue
        out.push(buildServer('project', name, raw, CLAUDE_JSON, path))
      }
    }
  }
  // Legacy user files — read-only, treat as user scope but flag via sourcePath.
  for (const file of LEGACY_USER_FILES) {
    const obj = await readJson<FlatOrWrapped>(file)
    const servers = unwrap(obj)
    for (const [name, raw] of Object.entries(servers)) {
      if (!raw || typeof raw !== 'object') continue
      if (out.some((s) => s.scope === 'user' && s.name === name)) continue
      out.push(buildServer('user', name, raw, file))
    }
  }
  // Plugins (read-only).
  try {
    const plugins = await discoverPlugins()
    for (const p of plugins) {
      const file = join(p.installPath, '.mcp.json')
      const obj = await readJson<FlatOrWrapped>(file)
      const servers = unwrap(obj)
      for (const [name, raw] of Object.entries(servers)) {
        if (!raw || typeof raw !== 'object') continue
        out.push(
          buildServer('plugin', name, expandEntry(raw, p.installPath), file, p.installPath)
        )
      }
    }
  } catch {
    // best-effort
  }

  return out
}

function entryFromServer(s: MCPServer): RawMCPEntry | null {
  if (s.transport === 'stdio') {
    if (!s.command) return null
    const e: RawMCPEntry = { command: s.command }
    if (s.args && s.args.length > 0) e.args = s.args
    if (s.env && Object.keys(s.env).length > 0) e.env = s.env
    return e
  }
  if (s.transport === 'http') {
    if (!s.url) return null
    const e: RawMCPEntry = { type: 'http', url: s.url }
    if (s.headers && Object.keys(s.headers).length > 0) e.headers = s.headers
    return e
  }
  return null
}

export async function upsertMCP(server: MCPServer): Promise<void> {
  if (server.scope === 'plugin') {
    throw new Error('Plugin-bundled MCP servers are read-only')
  }
  const entry = entryFromServer(server)
  if (!entry) throw new Error('Server missing required fields')
  const existing = (await readJson<ClaudeJson>(CLAUDE_JSON)) ?? {}
  const next: ClaudeJson = { ...existing }
  if (server.scope === 'user') {
    next.mcpServers = { ...(existing.mcpServers ?? {}), [server.name]: entry }
  } else {
    if (!server.projectPath) throw new Error('Project scope requires projectPath')
    const projects = { ...(existing.projects ?? {}) }
    const entryBlock = projects[server.projectPath] ?? {}
    projects[server.projectPath] = {
      ...entryBlock,
      mcpServers: { ...(entryBlock.mcpServers ?? {}), [server.name]: entry }
    }
    next.projects = projects
  }
  await writeJsonAtomic(CLAUDE_JSON, next)
}

export async function deleteMCP(id: string): Promise<void> {
  const parsed = parseId(id)
  if (!parsed) throw new Error(`Invalid MCP id: ${id}`)
  if (parsed.scope === 'plugin') {
    throw new Error('Plugin-bundled MCP servers are read-only')
  }
  const existing = (await readJson<ClaudeJson>(CLAUDE_JSON)) ?? {}
  const next: ClaudeJson = { ...existing }
  if (parsed.scope === 'user') {
    const block = { ...(existing.mcpServers ?? {}) }
    delete block[parsed.name]
    next.mcpServers = block
  } else {
    if (!parsed.projectPath) throw new Error('Project scope requires projectPath')
    const projects = { ...(existing.projects ?? {}) }
    const entryBlock = projects[parsed.projectPath]
    if (entryBlock?.mcpServers) {
      const block = { ...entryBlock.mcpServers }
      delete block[parsed.name]
      projects[parsed.projectPath] = { ...entryBlock, mcpServers: block }
    }
    next.projects = projects
  }
  await writeJsonAtomic(CLAUDE_JSON, next)
}

export async function findMCP(id: string): Promise<MCPServer | null> {
  const all = await listAllMCPs()
  return all.find((s) => s.id === id) ?? null
}
