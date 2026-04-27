// Writes folk-managed MCP servers into ~/.claude/.mcp.json so they appear in
// Claude Code's CLI and any other surface that reads that file.
//
// Strategy:
//   - We only ever mutate keys we previously wrote. A sidecar in folk's
//     userData dir tracks the set of keys we own.
//   - On every apply we drop any previously-owned key that's no longer in
//     folk's enabled set (handles renames/deletes/disables) and upsert all
//     current folk-owned keys. Anything else in the file is left untouched.
//   - Disabled folk servers are not written — disabling in folk = removed
//     from the CLI's view.
//   - File writes go through a temp file + rename for atomicity.

import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { MCPServer } from '@shared/types'

const CLAUDE_MCP_FILE = join(homedir(), '.claude', '.mcp.json')

interface RawMCPEntry {
  type?: string
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
}

interface ClaudeMCPFile {
  mcpServers?: Record<string, RawMCPEntry>
  // Pass other top-level keys through verbatim
  [k: string]: unknown
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    const text = await readFile(path, 'utf8')
    return JSON.parse(text) as T
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
    // Note: we never write tokens or OAuth client secrets to ~/.claude/.mcp.json.
    // Headers in the file should only carry stable configuration. Live access
    // tokens are injected by agent-manager at session start, not persisted here.
    return e
  }
  return null
}

interface ApplyOptions {
  // Sidecar JSON path — folk's userData dir, NOT under ~/.claude (we don't
  // want to scatter folk metadata into the user's Claude Code dir).
  sidecarPath: string
  // Folk-managed servers (caller already filtered out source==='local').
  // Disabled servers should be passed too — we'll filter them here.
  servers: MCPServer[]
}

export async function applyFolkMCPs(opts: ApplyOptions): Promise<void> {
  const enabled = opts.servers.filter((s) => s.isEnabled)
  const currentNames = new Set(enabled.map((s) => s.name))

  // Load previously-owned names so we know which keys we may safely remove
  // when servers get deleted/disabled/renamed.
  const prevOwned = (await readJson<string[]>(opts.sidecarPath)) ?? []

  // Load existing Claude Code file (or treat as empty).
  const existing = (await readJson<ClaudeMCPFile>(CLAUDE_MCP_FILE)) ?? {}
  const block = { ...(existing.mcpServers ?? {}) }

  // Drop keys we previously owned that are no longer in folk's enabled set.
  for (const name of prevOwned) {
    if (!currentNames.has(name)) {
      delete block[name]
    }
  }

  // Upsert current folk-owned entries.
  for (const s of enabled) {
    const entry = entryFromServer(s)
    if (!entry) continue
    block[s.name] = entry
  }

  const next: ClaudeMCPFile = {
    ...existing,
    mcpServers: block
  }

  // If both folk's owned set and the resulting block are empty, AND the file
  // didn't exist to start with, do nothing — don't materialize an empty file.
  if (
    prevOwned.length === 0 &&
    Object.keys(block).length === 0 &&
    !(await readJson(CLAUDE_MCP_FILE))
  ) {
    return
  }

  await writeJsonAtomic(CLAUDE_MCP_FILE, next)
  await writeJsonAtomic(opts.sidecarPath, [...currentNames])
}
