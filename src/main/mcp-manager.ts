import { randomUUID } from 'node:crypto'
import type { MCPServer, MCPTemplate } from '@shared/types'
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
}
