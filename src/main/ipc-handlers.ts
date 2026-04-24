import { ipcMain } from 'electron'
import { Database } from './database'
import { AgentManager } from './agent-manager'
import { MCPManager, MCP_TEMPLATES } from './mcp-manager'
import type {
  SessionConfig,
  ProviderConfig,
  MCPServer,
  Profile,
  Attachment
} from '@shared/types'

export function registerIpc(
  db: Database,
  agent: AgentManager,
  mcp: MCPManager
): void {
  ipcMain.handle('sessions:list', () => agent.listSessions())
  ipcMain.handle('sessions:get', (_e, id: string) => agent.getSession(id))
  ipcMain.handle('sessions:create', (_e, config: SessionConfig) => agent.createSession(config))
  ipcMain.handle('sessions:delete', (_e, id: string) => agent.deleteSession(id))

  ipcMain.handle(
    'agent:sendMessage',
    (_e, sessionId: string, text: string, attachments?: Attachment[]) =>
      agent.sendMessage(sessionId, text, attachments)
  )
  ipcMain.handle('agent:cancel', (_e, sessionId: string) => agent.cancel(sessionId))

  ipcMain.handle('providers:list', () => db.listProviders())
  ipcMain.handle('providers:save', (_e, p: ProviderConfig) => db.saveProvider(p))
  ipcMain.handle('providers:delete', (_e, id: string) => db.deleteProvider(id))
  ipcMain.handle('providers:test', async (_e, id: string) => {
    const p = db.listProviders().find((x) => x.id === id)
    if (!p) return { ok: false, error: 'not found' }
    try {
      const res = await fetch((p.baseUrl ?? 'https://api.anthropic.com') + '/v1/models', {
        headers: { 'x-api-key': p.apiKey, 'anthropic-version': '2023-06-01' }
      })
      return { ok: res.ok, error: res.ok ? undefined : `HTTP ${res.status}` }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('mcpServers:list', () => mcp.list())
  ipcMain.handle('mcpServers:save', (_e, s: MCPServer) => mcp.save(s))
  ipcMain.handle('mcpServers:delete', (_e, id: string) => mcp.delete(id))
  ipcMain.handle('mcpServers:test', (_e, id: string) => mcp.testConnection(id))
  ipcMain.handle('mcpServers:templates', () => MCP_TEMPLATES)

  ipcMain.handle('profile:get', () => db.getProfile())
  ipcMain.handle('profile:save', (_e, p: Profile) => db.saveProfile(p))
}
