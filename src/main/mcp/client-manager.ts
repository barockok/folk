import { spawn, ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import type { MCPServer } from '../../shared/types'

interface MCPConnection {
  server: MCPServer
  process: ChildProcess | null
  status: 'connected' | 'disconnected' | 'error'
  tools: MCPToolDefinition[]
  headers?: Record<string, string>
  baseUrl?: string
}

interface MCPToolDefinition {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

export class MCPClientManager extends EventEmitter {
  private connections: Map<string, MCPConnection> = new Map()
  private tokenProvider?: (serverId: string) => Promise<any>

  setTokenProvider(provider: (serverId: string) => Promise<any>): void {
    this.tokenProvider = provider
  }

  async connect(server: MCPServer): Promise<void> {
    if (server.transport === 'sse') {
      await this.connectSSE(server)
      return
    }

    if (server.transport !== 'stdio' || !server.command) {
      throw new Error(`Unsupported transport: ${server.transport}`)
    }

    const args = server.args || []
    const env = { ...process.env, ...(server.env || {}) }

    const child = spawn(server.command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env,
    })

    const connection: MCPConnection = {
      server,
      process: child,
      status: 'connected',
      tools: [],
    }

    child.on('exit', () => {
      connection.status = 'disconnected'
      connection.process = null
      this.emit('status-change', server.id, 'disconnected')
    })

    child.on('error', (err) => {
      connection.status = 'error'
      this.emit('status-change', server.id, 'error')
      this.emit('error', server.id, err.message)
    })

    this.connections.set(server.id, connection)

    // Send initialize request via JSON-RPC
    try {
      await this.sendRequest(server.id, 'initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'Folk', version: '1.0.0' },
      })

      // Send initialized notification
      this.sendNotification(server.id, 'notifications/initialized', {})

      // List available tools
      const toolsResult = await this.sendRequest(server.id, 'tools/list', {})
      if (toolsResult?.tools) {
        connection.tools = toolsResult.tools
      }

      this.emit('status-change', server.id, 'connected')
    } catch (err: any) {
      connection.status = 'error'
      this.emit('status-change', server.id, 'error')
      throw err
    }
  }

  async disconnect(serverId: string): Promise<void> {
    const conn = this.connections.get(serverId)
    if (!conn) return
    if (conn.process) {
      conn.process.kill('SIGTERM')
    }
    this.connections.delete(serverId)
  }

  async disconnectAll(): Promise<void> {
    for (const [id] of this.connections) {
      await this.disconnect(id)
    }
  }

  getStatus(serverId: string): string {
    return this.connections.get(serverId)?.status || 'disconnected'
  }

  getTools(serverId: string): MCPToolDefinition[] {
    return this.connections.get(serverId)?.tools || []
  }

  getAllTools(): { serverId: string; tool: MCPToolDefinition }[] {
    const result: { serverId: string; tool: MCPToolDefinition }[] = []
    for (const [serverId, conn] of this.connections) {
      for (const tool of conn.tools) {
        result.push({ serverId, tool })
      }
    }
    return result
  }

  async callTool(serverId: string, toolName: string, args: Record<string, unknown>): Promise<unknown> {
    const conn = this.connections.get(serverId)
    if (!conn) throw new Error('Not connected')

    if (conn.baseUrl) {
      return this.sendHttpRequest(serverId, 'tools/call', { name: toolName, arguments: args })
    }
    return this.sendRequest(serverId, 'tools/call', { name: toolName, arguments: args })
  }

  async testConnection(server: MCPServer): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.connect(server)
      const status = this.getStatus(server.id)
      await this.disconnect(server.id)
      return { ok: status === 'connected' }
    } catch (err: any) {
      return { ok: false, error: err.message }
    }
  }

  private async connectSSE(server: MCPServer): Promise<void> {
    const connection: MCPConnection = {
      server,
      process: null,
      status: 'connecting' as any,
      tools: [],
    }
    this.connections.set(server.id, connection)

    // Build headers with OAuth token if available
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (this.tokenProvider) {
      const tokens = await this.tokenProvider(server.id)
      if (tokens?.access_token) {
        headers['Authorization'] = `${tokens.token_type || 'Bearer'} ${tokens.access_token}`
      }
    }

    // Store headers and base URL for HTTP requests
    connection.headers = headers
    connection.baseUrl = server.url!

    // Try to initialize
    try {
      await this.sendHttpRequest(server.id, 'initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'Folk', version: '1.0.0' },
      })

      await this.sendHttpRequest(server.id, 'notifications/initialized', {})

      const toolsResult = await this.sendHttpRequest(server.id, 'tools/list', {})
      if (toolsResult?.tools) {
        connection.tools = toolsResult.tools
      }

      connection.status = 'connected'
      this.emit('status-change', server.id, 'connected')
    } catch (err: any) {
      connection.status = 'error'
      this.emit('status-change', server.id, 'error')
      throw err
    }
  }

  private async sendHttpRequest(serverId: string, method: string, params: unknown): Promise<any> {
    const conn = this.connections.get(serverId)
    if (!conn?.baseUrl) throw new Error('Not connected via HTTP')

    const id = ++this.requestId
    const res = await fetch(conn.baseUrl, {
      method: 'POST',
      headers: conn.headers || { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    })

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${await res.text()}`)
    }

    const response = await res.json()
    if (response.error) {
      throw new Error(response.error.message || JSON.stringify(response.error))
    }
    return response.result
  }

  private requestId = 0

  private sendRequest(serverId: string, method: string, params: unknown): Promise<any> {
    return new Promise((resolve, reject) => {
      const conn = this.connections.get(serverId)
      if (!conn?.process?.stdin || !conn.process.stdout) {
        return reject(new Error('Not connected'))
      }

      const id = ++this.requestId
      const request = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'

      let buffer = ''
      const onData = (data: Buffer): void => {
        buffer += data.toString()
        const lines = buffer.split('\n')
        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const response = JSON.parse(line)
            if (response.id === id) {
              conn.process?.stdout?.removeListener('data', onData)
              if (response.error) {
                reject(new Error(response.error.message))
              } else {
                resolve(response.result)
              }
              return
            }
          } catch {
            // Not complete JSON yet
          }
        }
        buffer = lines[lines.length - 1]
      }

      conn.process.stdout.on('data', onData)

      // Timeout after 10s
      setTimeout(() => {
        conn.process?.stdout?.removeListener('data', onData)
        reject(new Error('Request timed out'))
      }, 10000)

      conn.process.stdin.write(request)
    })
  }

  private sendNotification(serverId: string, method: string, params: unknown): void {
    const conn = this.connections.get(serverId)
    if (!conn?.process?.stdin) return
    const notification = JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n'
    conn.process.stdin.write(notification)
  }
}
