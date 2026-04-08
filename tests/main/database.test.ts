import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DatabaseManager } from '@main/database'
import { join } from 'path'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'

describe('DatabaseManager', () => {
  let db: DatabaseManager
  let tmpDir: string
  let dbPath: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'folk-test-'))
    dbPath = join(tmpDir, 'test.db')
    db = new DatabaseManager(dbPath)
  })

  afterEach(() => {
    db.close()
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('creates tables on initialization', () => {
    const tables = db.listTables()
    expect(tables).toContain('conversations')
    expect(tables).toContain('messages')
    expect(tables).toContain('tool_calls')
    expect(tables).toContain('artifacts')
    expect(tables).toContain('mcp_servers')
    expect(tables).toContain('settings')
  })

  it('creates and retrieves a conversation', () => {
    const conv = db.createConversation('Test Chat', '/some/path')
    expect(conv.title).toBe('Test Chat')
    expect(conv.workspacePath).toBe('/some/path')
    expect(conv.isArchived).toBe(false)
    expect(conv.id).toBeDefined()

    const retrieved = db.getConversation(conv.id)
    expect(retrieved).not.toBeNull()
    expect(retrieved!.title).toBe('Test Chat')
    expect(retrieved!.workspacePath).toBe('/some/path')
  })

  it('lists conversations ordered by updatedAt DESC', async () => {
    const first = db.createConversation('First')
    // Small delay to ensure different timestamps
    await new Promise((r) => setTimeout(r, 10))
    const second = db.createConversation('Second')

    const list = db.listConversations()
    expect(list).toHaveLength(2)
    expect(list[0].id).toBe(second.id)
    expect(list[1].id).toBe(first.id)
  })

  it('adds and retrieves messages', () => {
    const conv = db.createConversation('Chat')
    const content = [{ type: 'text' as const, text: 'Hello' }]
    const msg = db.addMessage(conv.id, 'user', content, 5)

    expect(msg.conversationId).toBe(conv.id)
    expect(msg.role).toBe('user')
    expect(msg.content).toEqual(content)
    expect(msg.tokenCount).toBe(5)

    const messages = db.getMessages(conv.id)
    expect(messages).toHaveLength(1)
    expect(messages[0].content).toEqual(content)
  })

  it('deletes conversation cascading messages', () => {
    const conv = db.createConversation('To Delete')
    db.addMessage(conv.id, 'user', [{ type: 'text', text: 'msg' }])

    db.deleteConversation(conv.id)

    expect(db.getConversation(conv.id)).toBeNull()
    expect(db.getMessages(conv.id)).toHaveLength(0)
  })

  it('stores and retrieves settings', () => {
    db.setSetting('theme', 'dark')
    expect(db.getSetting('theme')).toBe('dark')

    db.setSetting('config', { nested: true, count: 42 })
    expect(db.getSetting('config')).toEqual({ nested: true, count: 42 })

    // Overwrite
    db.setSetting('theme', 'light')
    expect(db.getSetting('theme')).toBe('light')

    // Non-existent key
    expect(db.getSetting('nope')).toBeNull()
  })

  it('renames a conversation', () => {
    const conv = db.createConversation('Old Name')
    db.renameConversation(conv.id, 'New Name')
    const updated = db.getConversation(conv.id)
    expect(updated!.title).toBe('New Name')
  })

  it('adds and retrieves tool calls', () => {
    const conv = db.createConversation('Chat')
    const msg = db.addMessage(conv.id, 'assistant', [{ type: 'text', text: 'thinking' }])
    const tc = db.addToolCall(msg.id, 'read_file', { path: '/tmp/f' })

    expect(tc.status).toBe('running')
    expect(tc.toolName).toBe('read_file')

    db.completeToolCall(tc.id, { content: 'file data' }, 'success')
    const calls = db.getToolCalls(msg.id)
    expect(calls).toHaveLength(1)
    expect(calls[0].status).toBe('success')
    expect(calls[0].output).toEqual({ content: 'file data' })
    expect(calls[0].durationMs).toBeGreaterThanOrEqual(0)
  })

  it('adds and retrieves artifacts', () => {
    const conv = db.createConversation('Chat')
    const msg = db.addMessage(conv.id, 'assistant', [{ type: 'text', text: 'here' }])
    const art = db.addArtifact(conv.id, msg.id, 'code', 'main.ts', 'console.log(1)', null, 'typescript')

    expect(art.type).toBe('code')
    expect(art.language).toBe('typescript')

    const arts = db.getArtifacts(conv.id)
    expect(arts).toHaveLength(1)
    expect(arts[0].title).toBe('main.ts')
  })

  it('adds and lists MCP servers', () => {
    const server = db.addMCPServer({
      name: 'test-server',
      transport: 'stdio',
      command: 'node',
      url: null,
      args: ['server.js'],
      env: { KEY: 'val' },
      enabled: true
    })

    expect(server.name).toBe('test-server')
    expect(server.args).toEqual(['server.js'])

    const servers = db.listMCPServers()
    expect(servers).toHaveLength(1)
    expect(servers[0].env).toEqual({ KEY: 'val' })

    db.removeMCPServer(server.id)
    expect(db.listMCPServers()).toHaveLength(0)
  })
})
