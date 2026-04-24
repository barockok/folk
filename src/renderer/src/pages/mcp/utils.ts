// mcp/utils.ts — helpers for MCPConfigDrawer

import type { MCPServer, MCPTemplate } from '@shared/types'

export type ParamValues = Record<string, string | string[] | boolean | number>

/** Guess which template a saved MCPServer came from. */
export function guessTemplate(server: MCPServer): string {
  const args = (server.args ?? []).join(' ')
  if (args.includes('server-filesystem')) return 'filesystem'
  if (args.includes('server-github')) return 'github'
  if (args.includes('server-postgres')) return 'postgres'
  if (args.includes('server-slack')) return 'slack'
  if ((server.url ?? '').includes('notion')) return 'notion'
  return 'custom'
}

/** Pre-fill param values from a saved MCPServer for a given template. */
export function initFromData(server: MCPServer | null, tplId: string): ParamValues {
  if (!server) return {}
  if (tplId === 'filesystem') {
    const paths = (server.args ?? []).filter((a) => a.startsWith('~') || a.startsWith('/'))
    return { path: paths[0] ?? '~/Documents' }
  }
  if (tplId === 'github') {
    const token = server.env?.['GITHUB_PERSONAL_ACCESS_TOKEN'] ?? ''
    return { GITHUB_PERSONAL_ACCESS_TOKEN: token }
  }
  if (tplId === 'postgres') {
    const cs = (server.args ?? []).find((a) => a.startsWith('postgres://')) ?? ''
    return { connectionString: cs }
  }
  if (tplId === 'slack') {
    return {
      SLACK_BOT_TOKEN: server.env?.['SLACK_BOT_TOKEN'] ?? '',
      SLACK_TEAM_ID: server.env?.['SLACK_TEAM_ID'] ?? ''
    }
  }
  if (tplId === 'notion') {
    return { NOTION_TOKEN: server.env?.['NOTION_TOKEN'] ?? '' }
  }
  // custom
  return {
    command: server.command ?? '',
    url: server.url ?? '',
    transport: server.transport
  }
}

/** Build an MCPServer from form state. */
export function buildServerFromForm(
  base: MCPServer | null,
  tplId: string,
  tpl: MCPTemplate | undefined,
  name: string,
  params: ParamValues
): MCPServer {
  const id = base?.id ?? crypto.randomUUID()
  const now = base?.createdAt ?? Date.now()

  const common: MCPServer = {
    id,
    name: name || (tpl?.label ?? 'New server'),
    template: tplId,
    transport: tpl?.transport ?? 'stdio',
    command: tpl?.command ?? null,
    args: tpl?.baseArgs ? [...tpl.baseArgs] : null,
    env: null,
    url: null,
    isEnabled: base?.isEnabled ?? true,
    status: base?.status ?? 'stopped',
    lastError: null,
    toolCount: base?.toolCount ?? null,
    createdAt: now
  }

  if (tplId === 'filesystem') {
    const path = String(params['path'] ?? '~/Documents')
    common.args = [...(tpl?.baseArgs ?? []), path]
    return common
  }
  if (tplId === 'github') {
    common.env = { GITHUB_PERSONAL_ACCESS_TOKEN: String(params['GITHUB_PERSONAL_ACCESS_TOKEN'] ?? '') }
    return common
  }
  if (tplId === 'postgres') {
    common.args = [...(tpl?.baseArgs ?? []), String(params['connectionString'] ?? '')]
    return common
  }
  if (tplId === 'slack') {
    common.env = {
      SLACK_BOT_TOKEN: String(params['SLACK_BOT_TOKEN'] ?? ''),
      SLACK_TEAM_ID: String(params['SLACK_TEAM_ID'] ?? '')
    }
    return common
  }
  if (tplId === 'notion') {
    common.env = { NOTION_TOKEN: String(params['NOTION_TOKEN'] ?? '') }
    return common
  }
  // custom
  const transport = String(params['transport'] ?? 'stdio') as 'stdio' | 'http'
  common.transport = transport
  if (transport === 'http') {
    common.command = null
    common.args = null
    common.url = String(params['url'] ?? '')
  } else {
    common.command = String(params['command'] ?? '')
    common.url = null
  }
  return common
}

/** Build the raw JSON config preview for the drawer. */
export function buildPreviewJson(
  name: string,
  tplId: string,
  tpl: MCPTemplate | undefined,
  params: ParamValues
): string {
  const server = buildServerFromForm(null, tplId, tpl, name, params)
  const entry: Record<string, unknown> = {}
  if (server.transport === 'stdio') {
    entry.command = server.command
    entry.args = server.args
    if (server.env && Object.keys(server.env).length > 0) entry.env = server.env
  } else {
    entry.url = server.url
    if (server.env && Object.keys(server.env).length > 0) entry.headers = server.env
  }
  return JSON.stringify({ mcpServers: { [name || 'new-server']: entry } }, null, 2)
}
