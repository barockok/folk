import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { MCPServer } from '@shared/types'

interface RawMCPEntry {
  type?: string
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
}

interface ClaudeJson {
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
    isEnabled: true,
    status: 'stopped',
    lastError: null,
    toolCount: null,
    createdAt: Date.now(),
    source: 'local',
    sourcePath
  }
}

export async function discoverLocalMCPs(): Promise<MCPServer[]> {
  const out: MCPServer[] = []
  for (const file of USER_FILES) {
    const obj = await readJson<Record<string, RawMCPEntry>>(file)
    if (!obj) continue
    for (const [name, raw] of Object.entries(obj)) {
      if (!raw || typeof raw !== 'object') continue
      out.push(buildServer(name, raw, file, 'user'))
    }
  }
  const claudeJson = await readJson<ClaudeJson>(CLAUDE_JSON)
  if (claudeJson?.projects) {
    for (const [projectPath, entry] of Object.entries(claudeJson.projects)) {
      const servers = entry.mcpServers
      if (!servers) continue
      for (const [name, raw] of Object.entries(servers)) {
        if (!raw || typeof raw !== 'object') continue
        out.push(buildServer(name, raw, CLAUDE_JSON, `project:${projectPath}`))
      }
    }
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
