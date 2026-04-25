import { BrowserWindow, dialog, ipcMain } from 'electron'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { access, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { Database } from './database'
import { AgentManager } from './agent-manager'
import { MCPManager, MCP_TEMPLATES } from './mcp-manager'
import type {
  SessionConfig,
  ProviderConfig,
  MCPServer,
  Profile,
  Attachment,
  ClaudeCodeAuthStatus
} from '@shared/types'

const execFileP = promisify(execFile)

async function detectClaudeCodeAuth(): Promise<ClaudeCodeAuthStatus> {
  // macOS: credentials stored in the login Keychain under service
  // "Claude Code-credentials". A successful lookup is enough to confirm login;
  // we don't extract the token — the SDK reads it itself when invoked.
  if (process.platform === 'darwin') {
    try {
      await execFileP('security', ['find-generic-password', '-s', 'Claude Code-credentials'])
      return { loggedIn: true, source: 'keychain', email: null }
    } catch {
      // fall through to file check
    }
  }
  // Linux / fallback: ~/.claude/.credentials.json
  const filePath = join(homedir(), '.claude', '.credentials.json')
  try {
    await access(filePath)
    let email: string | null = null
    try {
      const parsed = JSON.parse(await readFile(filePath, 'utf8')) as Record<string, unknown>
      const acct = parsed.account as { email?: string } | undefined
      email = acct?.email ?? null
    } catch {
      // credentials file may be opaque — that's fine, we only need existence
    }
    return { loggedIn: true, source: 'file', email }
  } catch {
    return { loggedIn: false, source: null, email: null }
  }
}

export function registerIpc(
  db: Database,
  agent: AgentManager,
  mcp: MCPManager
): void {
  ipcMain.handle('sessions:list', () => agent.listSessions())
  ipcMain.handle('sessions:get', (_e, id: string) => agent.getSession(id))
  ipcMain.handle('sessions:create', (_e, config: SessionConfig) => agent.createSession(config))
  ipcMain.handle('sessions:delete', (_e, id: string) => agent.deleteSession(id))
  ipcMain.handle('sessions:loadMessages', (_e, id: string) => agent.loadMessages(id))

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
    if (p.authMode === 'claude-code') {
      const status = await detectClaudeCodeAuth()
      return status.loggedIn
        ? { ok: true }
        : { ok: false, error: 'Claude Code login not found — run `claude login` in a terminal' }
    }
    try {
      const res = await fetch((p.baseUrl ?? 'https://api.anthropic.com') + '/v1/models', {
        headers: { 'x-api-key': p.apiKey, 'anthropic-version': '2023-06-01' }
      })
      return { ok: res.ok, error: res.ok ? undefined : `HTTP ${res.status}` }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('auth:claudeCodeStatus', () => detectClaudeCodeAuth())

  ipcMain.handle('dialog:openFolder', async (_e, defaultPath?: string) => {
    const parent = BrowserWindow.getFocusedWindow() ?? undefined
    const opts: Parameters<typeof dialog.showOpenDialog>[1] = {
      title: 'Choose working folder',
      properties: ['openDirectory', 'createDirectory']
    }
    if (defaultPath) opts.defaultPath = defaultPath
    const res = parent
      ? await dialog.showOpenDialog(parent, opts)
      : await dialog.showOpenDialog(opts)
    if (res.canceled || res.filePaths.length === 0) return null
    return res.filePaths[0]
  })

  ipcMain.handle('mcpServers:list', () => mcp.list())
  ipcMain.handle('mcpServers:save', (_e, s: MCPServer) => mcp.save(s))
  ipcMain.handle('mcpServers:delete', (_e, id: string) => mcp.delete(id))
  ipcMain.handle('mcpServers:test', (_e, id: string) => mcp.testConnection(id))
  ipcMain.handle('mcpServers:templates', () => MCP_TEMPLATES)

  ipcMain.handle('profile:get', () => db.getProfile())
  ipcMain.handle('profile:save', (_e, p: Profile) => db.saveProfile(p))
}
