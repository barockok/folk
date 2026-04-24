import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Database } from './database'
import { MCP_TEMPLATES, MCPManager, templateToServer } from './mcp-manager'

describe('MCP templates', () => {
  it('exposes filesystem, github, postgres, slack, notion, custom', () => {
    expect(Object.keys(MCP_TEMPLATES).sort()).toEqual([
      'custom',
      'filesystem',
      'github',
      'notion',
      'postgres',
      'slack'
    ])
  })

  it('templateToServer fills in command + args from template', () => {
    const s = templateToServer('filesystem', { name: 'FS', args: ['/tmp'] })
    expect(s.transport).toBe('stdio')
    expect(s.command).toBe('npx')
    expect(s.args).toContain('-y')
    expect(s.args).toContain('@modelcontextprotocol/server-filesystem')
    expect(s.args).toContain('/tmp')
  })
})

describe('MCPManager.testConnection', () => {
  let dir: string
  let db: Database
  let mgr: MCPManager

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'folk-mcp-'))
    db = new Database(join(dir, 'folk.db'))
    mgr = new MCPManager(db)
  })

  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('returns ok:false with a useful error when command is missing', async () => {
    const s = templateToServer('custom', { name: 'X', command: '/no/such/bin', args: [] })
    db.saveMCP(s)
    const res = await mgr.testConnection(s.id)
    expect(res.ok).toBe(false)
    expect(res.error).toBeTruthy()
  })
})
