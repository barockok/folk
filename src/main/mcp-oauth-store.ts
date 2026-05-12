// Sidecar JSON at userData/mcp-oauth.json holding OAuth bookkeeping for
// HTTP MCP servers. Claude Code's ~/.claude.json mcpServers schema has no
// place for clientId/clientSecret/metadata/status, so folk keeps them here
// keyed by MCP id (`scope:name[:projectPath]`). Access tokens stay in the
// OS keychain — only non-secret bookkeeping lives in this file.

import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { OAuthServerMetadata } from '@shared/types'

export interface OAuthRecord {
  clientId: string | null
  clientSecret: string | null
  metadata: OAuthServerMetadata | null
  status: 'unauthorized' | 'authorized' | 'error' | null
}

type Store = Record<string, OAuthRecord>

async function readStore(path: string): Promise<Store> {
  try {
    const raw = await readFile(path, 'utf8')
    return JSON.parse(raw) as Store
  } catch {
    return {}
  }
}

async function writeStore(path: string, store: Store): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.tmp.${process.pid}.${Date.now()}`
  await writeFile(tmp, JSON.stringify(store, null, 2) + '\n', 'utf8')
  try {
    await rename(tmp, path)
  } catch (err) {
    await unlink(tmp).catch(() => undefined)
    throw err
  }
}

export class MCPOAuthStore {
  constructor(private path: string) {}

  async get(id: string): Promise<OAuthRecord | null> {
    const s = await readStore(this.path)
    return s[id] ?? null
  }

  async set(id: string, rec: OAuthRecord): Promise<void> {
    const s = await readStore(this.path)
    s[id] = rec
    await writeStore(this.path, s)
  }

  async patch(id: string, patch: Partial<OAuthRecord>): Promise<void> {
    const s = await readStore(this.path)
    const base: OAuthRecord = s[id] ?? {
      clientId: null,
      clientSecret: null,
      metadata: null,
      status: null
    }
    s[id] = { ...base, ...patch }
    await writeStore(this.path, s)
  }

  async delete(id: string): Promise<void> {
    const s = await readStore(this.path)
    delete s[id]
    await writeStore(this.path, s)
  }

  async all(): Promise<Store> {
    return await readStore(this.path)
  }
}
