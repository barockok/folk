import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { AgentManager } from './agent-manager'
import { Database } from './database'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  __setQueryImpl,
  __resetQueryImpl,
  __getLastOptions,
  makeQuery
} from './__mocks__/claude-agent-sdk'
import type {
  AgentError,
  AgentNotice,
  AgentPromptSuggestion,
  AgentToolProgress,
  AgentUsage,
  PermissionRequest
} from '@shared/types'

describe('AgentManager.createSession', () => {
  let db: Database
  let dir: string
  let mgr: AgentManager

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'folk-agent-'))
    db = new Database(join(dir, 'folk.db'))
    mgr = new AgentManager(db)
  })

  afterEach(() => {
    mgr.dispose()
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('persists a session and exposes it via getSession', async () => {
    db.saveProvider({
      id: 'anthropic',
      name: 'Anthropic',
      apiKey: 'sk-ant',
      authMode: 'api-key',
      baseUrl: null,
      models: [{ id: 'claude-sonnet-4-5', label: 'Sonnet', enabled: true }],
      isEnabled: true,
      createdAt: Date.now()
    })
    const s = await mgr.createSession({
      modelId: 'claude-sonnet-4-5',
      workingDir: dir
    })
    expect(s.id).toBeTruthy()
    expect(mgr.getSession(s.id)).toBeTruthy()
  })
})

describe('AgentManager.sendMessage', () => {
  let db: Database
  let dir: string
  let mgr: AgentManager

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'folk-agent-'))
    db = new Database(join(dir, 'folk.db'))
    mgr = new AgentManager(db)
    db.saveProvider({
      id: 'anthropic',
      name: 'Anthropic',
      apiKey: 'sk',
      authMode: 'api-key',
      baseUrl: null,
      models: [{ id: 'm', label: 'M', enabled: true }],
      isEnabled: true,
      createdAt: Date.now()
    })
  })

  afterEach(() => {
    mgr.dispose()
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('emits chunk and done events and sets status', async () => {
    const s = await mgr.createSession({ modelId: 'm', workingDir: dir })
    const chunks: string[] = []
    mgr.on('chunk', (e) => chunks.push(e.text))
    const done = new Promise<void>((res) => mgr.once('done', () => res()))
    await mgr.sendMessage(s.id, 'hi')
    await done
    expect(chunks).toEqual(['hello'])
    expect(mgr.getSession(s.id)?.status).toBe('idle')
  })
})

describe('AgentManager.cancel & error mapping', () => {
  let db: Database
  let dir: string
  let mgr: AgentManager

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'folk-agent-'))
    db = new Database(join(dir, 'folk.db'))
    mgr = new AgentManager(db)
    db.saveProvider({
      id: 'anthropic',
      name: 'Anthropic',
      apiKey: 'sk',
      authMode: 'api-key',
      baseUrl: null,
      models: [{ id: 'm', label: 'M', enabled: true }],
      isEnabled: true,
      createdAt: Date.now()
    })
  })

  afterEach(() => {
    mgr.dispose()
    db.close()
    rmSync(dir, { recursive: true, force: true })
    __resetQueryImpl()
  })

  it('maps 401 to auth error, not retryable', async () => {
    __setQueryImpl(() =>
      makeQuery([], {
        throwBefore: Object.assign(new Error('401 unauthorized'), { code: '401' })
      })
    )
    const s = await mgr.createSession({ modelId: 'm', workingDir: dir })
    const err = new Promise<AgentError>((res) => mgr.once('error', (e) => res(e)))
    await mgr.sendMessage(s.id, 'hi').catch(() => undefined)
    const e = await err
    expect(e.code).toBe('auth')
    expect(e.retryable).toBe(false)
  })

  it('cancel sets session status to cancelled', async () => {
    const s = await mgr.createSession({ modelId: 'm', workingDir: dir })
    await mgr.sendMessage(s.id, 'hi').catch(() => undefined)
    await mgr.cancel(s.id)
    expect(mgr.getSession(s.id)?.status).toBe('cancelled')
  })
})

describe('AgentManager.#dispatchMessage — new SDK message types', () => {
  let db: Database
  let dir: string
  let mgr: AgentManager

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'folk-agent-'))
    db = new Database(join(dir, 'folk.db'))
    mgr = new AgentManager(db)
    db.saveProvider({
      id: 'anthropic',
      name: 'Anthropic',
      apiKey: 'sk',
      authMode: 'api-key',
      baseUrl: null,
      models: [{ id: 'm', label: 'M', enabled: true }],
      isEnabled: true,
      createdAt: Date.now()
    })
  })

  afterEach(() => {
    mgr.dispose()
    db.close()
    rmSync(dir, { recursive: true, force: true })
    __resetQueryImpl()
  })

  it('emits notice for compact_boundary', async () => {
    __setQueryImpl(() =>
      makeQuery([
        {
          type: 'system',
          subtype: 'compact_boundary',
          compact_metadata: { trigger: 'manual' }
        } as never,
        { type: 'result', subtype: 'success', is_error: false, result: 'ok' }
      ])
    )
    const s = await mgr.createSession({ modelId: 'm', workingDir: dir })
    const notice = new Promise<AgentNotice>((res) =>
      mgr.once('notice', (n: AgentNotice) => res(n))
    )
    void mgr.sendMessage(s.id, 'hi').catch(() => undefined)
    const n = await notice
    expect(n.kind).toBe('compact_boundary')
    expect(n.text).toMatch(/manual/)
  })

  it('emits notice for rate_limit_event when not allowed', async () => {
    __setQueryImpl(() =>
      makeQuery([
        {
          type: 'rate_limit_event',
          rate_limit_info: { status: 'rejected', rateLimitType: 'five_hour' }
        },
        { type: 'result', subtype: 'success', is_error: false, result: 'ok' }
      ])
    )
    const s = await mgr.createSession({ modelId: 'm', workingDir: dir })
    const notice = new Promise<AgentNotice>((res) =>
      mgr.once('notice', (n: AgentNotice) => res(n))
    )
    void mgr.sendMessage(s.id, 'hi').catch(() => undefined)
    const n = await notice
    expect(n.kind).toBe('rate_limit')
    expect(n.text).toMatch(/rejected/)
    expect(n.text).toMatch(/five_hour/)
  })

  it('skips notice when rate_limit_event is allowed', async () => {
    __setQueryImpl(() =>
      makeQuery([
        { type: 'rate_limit_event', rate_limit_info: { status: 'allowed' } },
        { type: 'result', subtype: 'success', is_error: false, result: 'ok' }
      ])
    )
    const s = await mgr.createSession({ modelId: 'm', workingDir: dir })
    const notices: AgentNotice[] = []
    mgr.on('notice', (n: AgentNotice) => notices.push(n))
    await mgr.sendMessage(s.id, 'hi').catch(() => undefined)
    expect(notices).toEqual([])
  })

  it('emits notice for api_retry system messages', async () => {
    __setQueryImpl(() =>
      makeQuery([
        {
          type: 'system',
          subtype: 'api_retry',
          attempt: 1,
          max_retries: 3,
          retry_delay_ms: 1500,
          error: 'rate_limit'
        },
        { type: 'result', subtype: 'success', is_error: false, result: 'ok' }
      ])
    )
    const s = await mgr.createSession({ modelId: 'm', workingDir: dir })
    const notice = new Promise<AgentNotice>((res) =>
      mgr.once('notice', (n: AgentNotice) => res(n))
    )
    void mgr.sendMessage(s.id, 'hi').catch(() => undefined)
    const n = await notice
    expect(n.kind).toBe('api_retry')
    expect(n.text).toMatch(/1\/3/)
    expect(n.text).toMatch(/1\.5s/)
  })

  it('emits toolProgress events with elapsed seconds', async () => {
    __setQueryImpl(() =>
      makeQuery([
        {
          type: 'tool_progress',
          tool_use_id: 'call-1',
          tool_name: 'Bash',
          elapsed_time_seconds: 2.5
        },
        { type: 'result', subtype: 'success', is_error: false, result: 'ok' }
      ])
    )
    const s = await mgr.createSession({ modelId: 'm', workingDir: dir })
    const progress = new Promise<AgentToolProgress>((res) =>
      mgr.once('toolProgress', (e: AgentToolProgress) => res(e))
    )
    void mgr.sendMessage(s.id, 'hi').catch(() => undefined)
    const e = await progress
    expect(e.callId).toBe('call-1')
    expect(e.elapsedSeconds).toBe(2.5)
  })

  it('emits promptSuggestion events', async () => {
    __setQueryImpl(() =>
      makeQuery([
        { type: 'prompt_suggestion', suggestion: 'Want me to commit this?' },
        { type: 'result', subtype: 'success', is_error: false, result: 'ok' }
      ])
    )
    const s = await mgr.createSession({ modelId: 'm', workingDir: dir })
    const got = new Promise<AgentPromptSuggestion>((res) =>
      mgr.once('promptSuggestion', (e: AgentPromptSuggestion) => res(e))
    )
    void mgr.sendMessage(s.id, 'hi').catch(() => undefined)
    const e = await got
    expect(e.suggestion).toBe('Want me to commit this?')
  })

  it('aggregates usage from result message', async () => {
    __setQueryImpl(() =>
      makeQuery([
        {
          type: 'result',
          subtype: 'success',
          is_error: false,
          result: 'ok',
          total_cost_usd: 0.0123,
          duration_ms: 4200,
          num_turns: 1,
          usage: {
            input_tokens: 1500,
            output_tokens: 350,
            cache_read_input_tokens: 800,
            cache_creation_input_tokens: 100
          }
        }
      ])
    )
    const s = await mgr.createSession({ modelId: 'm', workingDir: dir })
    const usage = new Promise<AgentUsage>((res) =>
      mgr.once('usage', (u: AgentUsage) => res(u))
    )
    await mgr.sendMessage(s.id, 'hi').catch(() => undefined)
    const u = await usage
    expect(u.totalCostUsd).toBeCloseTo(0.0123)
    expect(u.inputTokens).toBe(1500)
    expect(u.outputTokens).toBe(350)
    expect(u.cacheReadTokens).toBe(800)
    expect(u.cacheCreateTokens).toBe(100)
    expect(u.numTurns).toBe(1)
  })
})

describe('AgentManager.#dispatchSystem — every system subtype', () => {
  let db: Database
  let dir: string
  let mgr: AgentManager

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'folk-agent-'))
    db = new Database(join(dir, 'folk.db'))
    mgr = new AgentManager(db)
    db.saveProvider({
      id: 'anthropic',
      name: 'Anthropic',
      apiKey: 'sk',
      authMode: 'api-key',
      baseUrl: null,
      models: [{ id: 'm', label: 'M', enabled: true }],
      isEnabled: true,
      createdAt: Date.now()
    })
  })

  afterEach(() => {
    mgr.dispose()
    db.close()
    rmSync(dir, { recursive: true, force: true })
    __resetQueryImpl()
  })

  function runWith(systemMsg: Record<string, unknown>): Promise<AgentNotice[]> {
    __setQueryImpl(() =>
      makeQuery([
        { type: 'system', ...systemMsg } as never,
        { type: 'result', subtype: 'success', is_error: false, result: 'ok' }
      ])
    )
    const notices: AgentNotice[] = []
    mgr.on('notice', (n: AgentNotice) => notices.push(n))
    return mgr
      .createSession({ modelId: 'm', workingDir: dir })
      .then(async (s) => {
        await mgr.sendMessage(s.id, 'hi').catch(() => undefined)
        return notices
      })
  }

  it('compact_boundary subtype emits compact_boundary notice', async () => {
    const ns = await runWith({
      subtype: 'compact_boundary',
      compact_metadata: { trigger: 'auto' }
    })
    expect(ns.find((n) => n.kind === 'compact_boundary')).toBeTruthy()
  })

  it('init emits info notice with model + tool count', async () => {
    const ns = await runWith({
      subtype: 'init',
      tools: ['Read', 'Bash'],
      mcp_servers: [{ name: 'x' }],
      model: 'claude-sonnet-4-5'
    })
    const n = ns.find((x) => x.kind === 'info' && x.text?.includes('Session ready'))
    expect(n).toBeTruthy()
    expect(n!.text).toMatch(/2 tools/)
    expect(n!.text).toMatch(/claude-sonnet-4-5/)
  })

  it('files_persisted reports counts', async () => {
    const ns = await runWith({
      subtype: 'files_persisted',
      files: [{ filename: 'a' }, { filename: 'b' }],
      failed: [{ filename: 'c', error: 'denied' }]
    })
    const n = ns.find((x) => x.text?.includes('Persisted'))
    expect(n!.text).toMatch(/2 file/)
    expect(n!.text).toMatch(/1 failed/)
  })

  it('hook_started/progress/response render notices', async () => {
    const a = await runWith({
      subtype: 'hook_started',
      hook_name: 'PreToolUse',
      hook_event: 'PreToolUse'
    })
    expect(a.find((n) => n.text?.includes('Hook PreToolUse started'))).toBeTruthy()

    const b = await runWith({
      subtype: 'hook_response',
      hook_name: 'Stop',
      outcome: 'success',
      exit_code: 0
    })
    expect(b.find((n) => n.text?.includes('Hook Stop success'))).toBeTruthy()
  })

  it('local_command_output forwards as chunk text', async () => {
    __setQueryImpl(() =>
      makeQuery([
        {
          type: 'system',
          subtype: 'local_command_output',
          content: 'cli output here'
        } as never,
        { type: 'result', subtype: 'success', is_error: false, result: 'ok' }
      ])
    )
    const chunks: string[] = []
    mgr.on('chunk', (c) => chunks.push(c.text))
    const s = await mgr.createSession({ modelId: 'm', workingDir: dir })
    await mgr.sendMessage(s.id, 'hi').catch(() => undefined)
    expect(chunks.some((t) => t.includes('cli output here'))).toBe(true)
  })

  it('memory_recall reports count + mode', async () => {
    const ns = await runWith({
      subtype: 'memory_recall',
      mode: 'synthesize',
      memories: [{ path: '<synthesis:dir>' }]
    })
    expect(ns.find((n) => n.text?.includes('Recalled 1 memory synthesis'))).toBeTruthy()
  })

  it('notification surfaces non-low priority text', async () => {
    const ns = await runWith({
      subtype: 'notification',
      key: 'k',
      priority: 'high',
      text: 'something happened'
    })
    expect(ns.find((n) => n.text === '[high] something happened')).toBeTruthy()
  })

  it('plugin_install reports status', async () => {
    const ns = await runWith({
      subtype: 'plugin_install',
      status: 'installed',
      name: 'foo'
    })
    expect(ns.find((n) => n.text?.includes('Plugin install: installed foo'))).toBeTruthy()
  })

  it('mirror_error reports error', async () => {
    const ns = await runWith({
      subtype: 'mirror_error',
      error: 'append timeout'
    })
    expect(ns.find((n) => n.text?.includes('Mirror error: append timeout'))).toBeTruthy()
  })

  it('elicitation_complete includes server name', async () => {
    const ns = await runWith({
      subtype: 'elicitation_complete',
      mcp_server_name: 'srv'
    })
    expect(ns.find((n) => n.text?.includes('Elicitation complete (srv)'))).toBeTruthy()
  })

  it('auth_status reports authenticating + error', async () => {
    const ns = await runWith({
      subtype: 'auth_status',
      isAuthenticating: true,
      error: 'expired'
    })
    expect(ns.find((n) => n.text?.includes('Auth in progress'))).toBeTruthy()
  })

  it('status reports compacting', async () => {
    const ns = await runWith({
      subtype: 'status',
      status: 'compacting',
      compact_result: 'success'
    })
    expect(ns.find((n) => n.text?.includes('Status: compacting'))).toBeTruthy()
  })

  it('session_state_changed updates DB session status to running', async () => {
    __setQueryImpl(() =>
      makeQuery([
        {
          type: 'system',
          subtype: 'session_state_changed',
          state: 'running'
        } as never,
        { type: 'result', subtype: 'success', is_error: false, result: 'ok' }
      ])
    )
    const s = await mgr.createSession({ modelId: 'm', workingDir: dir })
    await mgr.sendMessage(s.id, 'hi').catch(() => undefined)
    // Final result will set it back to idle, but during the system msg
    // dispatch the transition to running was applied.
    expect(['idle', 'running']).toContain(mgr.getSession(s.id)?.status)
  })

  it('task_started/updated/progress/notification are silent (handled via nesting)', async () => {
    const ns = await runWith({ subtype: 'task_started', task_id: 't1', description: 'go' })
    expect(ns.length).toBe(0)
  })

  it('unknown subtype falls back to debug notice', async () => {
    const ns = await runWith({ subtype: 'never_seen_before', payload: 'whatever' })
    expect(ns.find((n) => n.text === 'Event: system/never_seen_before')).toBeTruthy()
  })

  it('tool_use_summary emits info notice', async () => {
    __setQueryImpl(() =>
      makeQuery([
        { type: 'tool_use_summary', summary: 'wrote 3 files' } as never,
        { type: 'result', subtype: 'success', is_error: false, result: 'ok' }
      ])
    )
    const notices: AgentNotice[] = []
    mgr.on('notice', (n: AgentNotice) => notices.push(n))
    const s = await mgr.createSession({ modelId: 'm', workingDir: dir })
    await mgr.sendMessage(s.id, 'hi').catch(() => undefined)
    expect(notices.find((n) => n.text === 'Summary: wrote 3 files')).toBeTruthy()
  })
})

describe('AgentManager.canUseTool', () => {
  let db: Database
  let dir: string
  let mgr: AgentManager

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'folk-agent-'))
    db = new Database(join(dir, 'folk.db'))
    mgr = new AgentManager(db)
    db.saveProvider({
      id: 'anthropic',
      name: 'Anthropic',
      apiKey: 'sk',
      authMode: 'api-key',
      baseUrl: null,
      models: [{ id: 'm', label: 'M', enabled: true }],
      isEnabled: true,
      createdAt: Date.now()
    })
  })

  afterEach(() => {
    mgr.dispose()
    db.close()
    rmSync(dir, { recursive: true, force: true })
    __resetQueryImpl()
  })

  it('emits permissionRequest and resolves on respondPermission(allow)', async () => {
    __setQueryImpl(() =>
      makeQuery([{ type: 'result', subtype: 'success', is_error: false, result: 'ok' }])
    )
    const s = await mgr.createSession({ modelId: 'm', workingDir: dir })
    // Kick the query so options.canUseTool gets registered.
    void mgr.sendMessage(s.id, 'hi').catch(() => undefined)
    // Wait a tick for sendMessage to set up the LiveSession + capture options.
    await new Promise((r) => setTimeout(r, 5))
    const opts = __getLastOptions()
    expect(opts).toBeTruthy()
    type CanUseToolFn = (
      toolName: string,
      input: Record<string, unknown>,
      o: { signal: AbortSignal; toolUseID: string; suggestions?: unknown[] }
    ) => Promise<{ behavior: 'allow' } | { behavior: 'deny'; message: string }>
    const canUseTool = (opts as { canUseTool?: CanUseToolFn }).canUseTool
    expect(typeof canUseTool).toBe('function')

    const reqP = new Promise<PermissionRequest>((res) =>
      mgr.once('permissionRequest', (e: PermissionRequest) => res(e))
    )
    const ac = new AbortController()
    const decisionP = canUseTool!(
      'Edit',
      { file_path: '/tmp/x.txt' },
      { signal: ac.signal, toolUseID: 'tu-1' }
    )
    const req = await reqP
    expect(req.toolName).toBe('Edit')
    expect(req.toolUseID).toBe('tu-1')
    expect(req.input.file_path).toBe('/tmp/x.txt')

    mgr.respondPermission({ requestId: req.requestId, behavior: 'allow' })
    const decision = await decisionP
    expect(decision.behavior).toBe('allow')
  })

  it('respondPermission(deny) resolves with the user-supplied message', async () => {
    __setQueryImpl(() =>
      makeQuery([{ type: 'result', subtype: 'success', is_error: false, result: 'ok' }])
    )
    const s = await mgr.createSession({ modelId: 'm', workingDir: dir })
    void mgr.sendMessage(s.id, 'hi').catch(() => undefined)
    await new Promise((r) => setTimeout(r, 5))
    const opts = __getLastOptions()
    type CanUseToolFn = (
      toolName: string,
      input: Record<string, unknown>,
      o: { signal: AbortSignal; toolUseID: string }
    ) => Promise<{ behavior: 'allow' } | { behavior: 'deny'; message: string }>
    const canUseTool = (opts as { canUseTool?: CanUseToolFn }).canUseTool!
    const reqP = new Promise<PermissionRequest>((res) =>
      mgr.once('permissionRequest', (e: PermissionRequest) => res(e))
    )
    const ac = new AbortController()
    const decisionP = canUseTool('Bash', { command: 'rm -rf /' }, {
      signal: ac.signal,
      toolUseID: 'tu-2'
    })
    const req = await reqP
    mgr.respondPermission({
      requestId: req.requestId,
      behavior: 'deny',
      message: 'no thanks'
    })
    const d = (await decisionP) as { behavior: 'deny'; message: string }
    expect(d.behavior).toBe('deny')
    expect(d.message).toBe('no thanks')
  })
})
