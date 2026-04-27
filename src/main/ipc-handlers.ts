import { BrowserWindow, dialog, ipcMain, type OpenDialogOptions } from 'electron'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { access, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { Database } from './database'
import { AgentManager } from './agent-manager'
import { MCPManager, MCP_TEMPLATES } from './mcp-manager'
import { discoverCommands, discoverPlugins, discoverSkills } from './disk-discovery'
import {
  addMarketplaceFromDirectory,
  addMarketplaceFromGithub,
  listMarketplaceCatalog,
  listMarketplaces,
  removeMarketplace,
  uninstallPlugin,
  updateMarketplace
} from './marketplace-manager'
import type {
  SessionConfig,
  ProviderConfig,
  ModelConfig,
  MCPServer,
  Profile,
  Attachment,
  ClaudeCodeAuthStatus,
  PermissionMode
} from '@shared/types'

const execFileP = promisify(execFile)

interface FetchModelsInput {
  presetId: string
  apiKey?: string
  baseUrl?: string
}

interface RawModelEntry {
  id?: string
  name?: string
  display_name?: string
  context_length?: number
  context_window?: number
  pricing?: { prompt?: string; completion?: string }
}

function toModelConfig(m: RawModelEntry, fallbackId: string): ModelConfig {
  const id = String(m.id ?? fallbackId)
  const label = String(m.display_name ?? m.name ?? id)
  const cw =
    typeof m.context_length === 'number'
      ? m.context_length
      : typeof m.context_window === 'number'
        ? m.context_window
        : undefined
  return { id, label, enabled: true, contextWindow: cw }
}

async function fetchModelsForPreset(input: FetchModelsInput): Promise<ModelConfig[]> {
  const { presetId, apiKey, baseUrl } = input
  if (presetId === 'anthropic') {
    const url = (baseUrl?.replace(/\/+$/, '') ?? 'https://api.anthropic.com') + '/v1/models'
    if (!apiKey) throw new Error('Anthropic API key required')
    const res = await fetch(url, {
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const json = (await res.json()) as { data?: RawModelEntry[] }
    return (json.data ?? []).map((m) => toModelConfig(m, m.id ?? ''))
  }

  if (presetId === 'openrouter') {
    const url = 'https://openrouter.ai/api/v1/models'
    const headers: Record<string, string> = { 'HTTP-Referer': 'https://folk.local' }
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`
    const res = await fetch(url, { headers })
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const json = (await res.json()) as { data?: RawModelEntry[] }
    return (json.data ?? []).map((m) => toModelConfig(m, m.id ?? ''))
  }

  if (presetId === 'opencode-free' || presetId === 'opencode-paid') {
    const url = 'https://opencode.ai/zen/v1/models'
    const token = presetId === 'opencode-free' ? 'public' : (apiKey ?? '')
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'x-opencode-client': 'desktop'
      }
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const json = (await res.json()) as { data?: RawModelEntry[]; models?: RawModelEntry[] }
    const raw = json.data ?? json.models ?? []
    const filtered =
      presetId === 'opencode-free'
        ? raw.filter((m) => typeof m.id === 'string' && m.id.endsWith('-free'))
        : raw.filter((m) => !(typeof m.id === 'string' && m.id.endsWith('-free')))
    return filtered.map((m) => toModelConfig(m, m.id ?? ''))
  }

  throw new Error(`unsupported preset: ${presetId}`)
}

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
  ipcMain.handle('sessions:backfillTitle', (_e, id: string) => agent.backfillTitle(id))
  ipcMain.handle('sessions:rename', (_e, id: string, title: string) =>
    agent.renameSession(id, title)
  )
  ipcMain.handle(
    'sessions:setPermissionMode',
    (_e, id: string, mode: PermissionMode) => agent.setPermissionMode(id, mode)
  )
  ipcMain.handle('sessions:setModel', (_e, id: string, modelId: string) =>
    agent.setModel(id, modelId)
  )

  ipcMain.handle(
    'agent:sendMessage',
    (_e, sessionId: string, text: string, attachments?: Attachment[]) =>
      agent.sendMessage(sessionId, text, attachments)
  )
  ipcMain.handle('agent:cancel', (_e, sessionId: string) => agent.cancel(sessionId))
  ipcMain.handle(
    'agent:respondPermission',
    (_e, response: import('@shared/types').PermissionResponse) =>
      agent.respondPermission(response)
  )
  ipcMain.handle(
    'agent:respondElicitation',
    (_e, response: import('@shared/types').MCPElicitationResponse) =>
      agent.respondElicitation(response)
  )
  ipcMain.handle(
    'agent:respondToolUse',
    (_e, sessionId: string, toolUseId: string, answer: string) =>
      agent.respondToolUse(sessionId, toolUseId, answer)
  )

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
    // Probe shape depends on the provider's API style.
    // Anthropic / anthropic-proxy: x-api-key + /v1/models
    // OpenAI-compatible (OpenAI, DeepSeek default, GLM, Moonshot, Qwen,
    // Gemini-OpenAI, custom): Bearer token at <baseUrl>/models (the SDK's
    // OpenAI client appends `/models` directly to baseUrl).
    const base = p.baseUrl ?? 'https://api.anthropic.com'
    const looksAnthropic =
      /anthropic/i.test(base) || base === 'https://api.anthropic.com'
    try {
      let url: string
      let headers: Record<string, string>
      if (looksAnthropic) {
        url = base.replace(/\/+$/, '') + '/v1/models'
        headers = { 'x-api-key': p.apiKey, 'anthropic-version': '2023-06-01' }
      } else {
        // baseUrl typically already includes /v1 for OpenAI-style — just append /models.
        url = base.replace(/\/+$/, '') + '/models'
        headers = { Authorization: `Bearer ${p.apiKey}` }
      }
      const res = await fetch(url, { headers })
      if (res.ok) return { ok: true }
      let body = ''
      try {
        body = (await res.text()).slice(0, 200)
      } catch {
        // ignore
      }
      return { ok: false, error: `HTTP ${res.status}${body ? `: ${body}` : ''}` }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle(
    'providers:fetchModels',
    async (
      _e,
      input: { presetId: string; apiKey?: string; baseUrl?: string }
    ) => {
      try {
        const models = await fetchModelsForPreset(input)
        return { ok: true, models }
      } catch (err) {
        return { ok: false, error: (err as Error).message, models: [] as ModelConfig[] }
      }
    }
  )

  ipcMain.handle('auth:claudeCodeStatus', () => detectClaudeCodeAuth())

  ipcMain.handle('dialog:openFolder', async (_e, defaultPath?: string) => {
    const parent = BrowserWindow.getFocusedWindow() ?? undefined
    const opts: OpenDialogOptions = {
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
  ipcMain.handle('mcpServers:listResources', (_e, id: string) => mcp.listResources(id))
  ipcMain.handle('mcpServers:readResource', (_e, id: string, uri: string) =>
    mcp.readResource(id, uri)
  )
  ipcMain.handle('mcpServers:listPrompts', (_e, id: string) => mcp.listPrompts(id))
  ipcMain.handle(
    'mcpServers:getPrompt',
    (_e, id: string, name: string, args?: Record<string, string>) =>
      mcp.getPrompt(id, name, args)
  )
  ipcMain.handle('mcpServers:signIn', (_e, id: string) => mcp.signIn(id))
  ipcMain.handle('mcpServers:signOut', (_e, id: string) => mcp.signOut(id))

  ipcMain.handle('profile:get', () => db.getProfile())
  ipcMain.handle('profile:save', (_e, p: Profile) => db.saveProfile(p))

  ipcMain.handle('discover:skills', (_e, workingDir?: string) =>
    discoverSkills(workingDir ?? null)
  )
  ipcMain.handle('discover:commands', (_e, workingDir?: string) =>
    discoverCommands(workingDir ?? null)
  )
  ipcMain.handle('discover:plugins', () => discoverPlugins())
  ipcMain.handle('discover:readCommand', async (_e, path: string) => {
    try {
      return await readFile(path, 'utf8')
    } catch (err) {
      return { error: (err as Error).message }
    }
  })

  ipcMain.handle('marketplaces:list', () => listMarketplaces())
  ipcMain.handle('marketplaces:catalog', () => listMarketplaceCatalog())
  ipcMain.handle('marketplaces:addGithub', (_e, input: string) =>
    addMarketplaceFromGithub(input)
  )
  ipcMain.handle('marketplaces:addDirectory', (_e, path: string) =>
    addMarketplaceFromDirectory(path)
  )
  ipcMain.handle('marketplaces:remove', (_e, name: string) => removeMarketplace(name))
  ipcMain.handle('marketplaces:update', (_e, name: string) => updateMarketplace(name))
  ipcMain.handle(
    'plugins:uninstall',
    (
      _e,
      target: { name: string; marketplace: string; scope: 'user' | 'project'; projectPath?: string }
    ) => uninstallPlugin(target)
  )
}
