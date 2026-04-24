import { describe, it, expect } from 'vitest'
import { MCP_TEMPLATES, templateToServer } from './mcp-manager'

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
