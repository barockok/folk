import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { MCPServer } from '@shared/types'
import { discoverPlugins } from './disk-discovery'

interface RawMCPEntry {
  type?: string
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
}

// Files that ship MCP servers can shape themselves either as a flat record
// of `{ <name>: <entry> }` or wrapped as `{ mcpServers: { <name>: <entry> } }`.
// Claude Code itself emits the wrapped form everywhere now (see
// ~/.claude/.mcp.json, plugin .mcp.json files), but the flat shape still
// shows up in older configs — so accept both.
type FlatOrWrapped =
  | Record<string, RawMCPEntry>
  | { mcpServers?: Record<string, RawMCPEntry> }

interface ClaudeJson {
  mcpServers?: Record<string, RawMCPEntry>
  projects?: Record<string, { mcpServers?: Record<string, RawMCPEntry> }>
}

const USER_FILES = [
  join(homedir(), '.claude', 'mcp_servers.json'),
  join(homedir(), '.claude', '.mcp.json')
]
const CLAUDE_JSON = join(homedir(), '.claude.json')

async function readJson<T>(path: string): Promise<T | null> {
  try {
    const raw = await readFile(path, 'utf8')
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function unwrap(obj: FlatOrWrapped | null): Record<string, RawMCPEntry> {
  if (!obj || typeof obj !== 'object') return {}
  if ('mcpServers' in obj && obj.mcpServers && typeof obj.mcpServers === 'object') {
    return obj.mcpServers
  }
  return obj as Record<string, RawMCPEntry>
}

// Plugin .mcp.json files use ${CLAUDE_PLUGIN_ROOT} as a placeholder for the
// install path. We substitute it for display so the panel shows resolvable
// commands/args/env values.
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

function buildServer(
  name: string,
  raw: RawMCPEntry,
  sourcePath: string,
  scope: string
): MCPServer {
  const transport: 'stdio' | 'http' =
    raw.url || raw.type === 'http' || raw.type === 'sse' ? 'http' : 'stdio'
  return {
    id: `local:${scope}:${name}`,
    name,
    template: null,
    transport,
    command: raw.command ?? null,
    args: raw.args ?? null,
    env: raw.env ?? null,
    url: raw.url ?? null,
    headers: null,
    isEnabled: true,
    status: 'stopped',
    lastError: null,
    toolCount: null,
    createdAt: Date.now(),
    source: 'local',
    sourcePath
  }
}

function pushAll(
  out: MCPServer[],
  servers: Record<string, RawMCPEntry>,
  sourcePath: string,
  scope: string,
  pluginRoot: string | null = null
): void {
  for (const [name, raw] of Object.entries(servers)) {
    if (!raw || typeof raw !== 'object') continue
    out.push(buildServer(name, expandEntry(raw, pluginRoot), sourcePath, scope))
  }
}

export async function discoverLocalMCPs(): Promise<MCPServer[]> {
  const out: MCPServer[] = []

  // User-level files (~/.claude/.mcp.json, ~/.claude/mcp_servers.json) — accept
  // both flat and {mcpServers: …} shapes.
  for (const file of USER_FILES) {
    const obj = await readJson<FlatOrWrapped>(file)
    pushAll(out, unwrap(obj), file, 'user')
  }

  // ~/.claude.json: top-level mcpServers (global) + per-project mcpServers.
  const claudeJson = await readJson<ClaudeJson>(CLAUDE_JSON)
  if (claudeJson?.mcpServers) {
    pushAll(out, claudeJson.mcpServers, CLAUDE_JSON, 'user')
  }
  if (claudeJson?.projects) {
    for (const [projectPath, entry] of Object.entries(claudeJson.projects)) {
      if (!entry?.mcpServers) continue
      pushAll(out, entry.mcpServers, CLAUDE_JSON, `project:${projectPath}`)
    }
  }

  // Plugin-shipped .mcp.json files. Each installed plugin may declare its own
  // MCP servers under <installPath>/.mcp.json.
  try {
    const plugins = await discoverPlugins()
    for (const p of plugins) {
      const file = join(p.installPath, '.mcp.json')
      const obj = await readJson<FlatOrWrapped>(file)
      const servers = unwrap(obj)
      if (Object.keys(servers).length === 0) continue
      pushAll(out, servers, file, `plugin:${p.name}`, p.installPath)
    }
  } catch {
    // best-effort — plugin discovery shouldn't block user/project MCPs
  }

  // De-dupe identical (name + command + args) entries that appear in multiple
  // files — prefer the first occurrence.
  const seen = new Set<string>()
  return out.filter((s) => {
    const key = `${s.name}|${s.command ?? s.url}|${(s.args ?? []).join(' ')}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
