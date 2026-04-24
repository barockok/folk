import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import type { MCPServer, MCPTemplate, ToolInfo } from '@shared/types'
import { Database } from './database'

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
    isEnabled: true,
    status: 'stopped',
    lastError: null,
    toolCount: null,
    createdAt: Date.now()
  }
}

export class MCPManager {
  constructor(private db: Database) {}

  list(): MCPServer[] {
    return this.db.listMCPs()
  }

  save(server: MCPServer): void {
    this.db.saveMCP(server)
  }

  delete(id: string): void {
    this.db.deleteMCP(id)
  }

  async testConnection(
    id: string
  ): Promise<{ ok: boolean; tools: ToolInfo[]; error?: string }> {
    const server = this.db.listMCPs().find((m) => m.id === id)
    if (!server) return { ok: false, tools: [], error: 'not found' }
    if (server.transport !== 'stdio' || !server.command) {
      return { ok: false, tools: [], error: 'only stdio transport supported in test-connect' }
    }

    return new Promise((resolve) => {
      const child = spawn(server.command!, server.args ?? [], {
        env: { ...process.env, ...(server.env ?? {}) },
        stdio: ['pipe', 'pipe', 'pipe']
      })
      let stderr = ''
      let resolved = false
      const finish = (out: { ok: boolean; tools: ToolInfo[]; error?: string }): void => {
        if (resolved) return
        resolved = true
        try {
          child.kill('SIGTERM')
        } catch {
          /* ignore */
        }
        resolve(out)
      }
      child.on('error', (err) => finish({ ok: false, tools: [], error: err.message }))
      child.stderr.on('data', (b) => (stderr += b.toString()))

      const initReq = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'folk', version: '0.1' }
        }
      }
      const listReq = { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }
      try {
        child.stdin.write(JSON.stringify(initReq) + '\n')
        child.stdin.write(JSON.stringify(listReq) + '\n')
      } catch {
        /* finish is called via child.on('error') */
      }

      let buf = ''
      child.stdout.on('data', (b) => {
        buf += b.toString()
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const msg = JSON.parse(line)
            if (msg.id === 2 && msg.result?.tools) {
              const tools: ToolInfo[] = msg.result.tools.map(
                (t: { name: string; description?: string }) => ({
                  name: t.name,
                  description: t.description
                })
              )
              this.db.saveMCP({ ...server, toolCount: tools.length, lastError: null })
              finish({ ok: true, tools })
              return
            }
          } catch {
            /* ignore */
          }
        }
      })

      setTimeout(() => {
        this.db.saveMCP({ ...server, lastError: stderr || 'timed out' })
        finish({ ok: false, tools: [], error: stderr || 'timed out' })
      }, 8000)
    })
  }
}
