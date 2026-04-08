import { useState, useEffect } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { MCPServer } from '../../../../shared/types'

export default function MCPSettings(): React.JSX.Element {
  const [servers, setServers] = useState<MCPServer[]>([])

  const loadServers = async (): Promise<void> => {
    const list = await window.folk.listMCPServers()
    setServers(list)
  }

  useEffect(() => {
    loadServers()
  }, [])

  const handleRemove = async (id: string): Promise<void> => {
    await window.folk.removeMCPServer(id)
    await loadServers()
  }

  const handleAdd = async (): Promise<void> => {
    await window.folk.addMCPServer({
      name: 'New Server',
      transport: 'stdio',
      command: '',
      url: null,
      args: null,
      env: null,
      enabled: true
    })
    await loadServers()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-text-primary">MCP Servers</h3>
        <button
          onClick={handleAdd}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary border border-border-mist-10 rounded-default hover:border-border-mist-12 transition-colors cursor-pointer"
        >
          <Plus size={12} />
          Add Server
        </button>
      </div>

      {servers.length === 0 && (
        <p className="text-sm text-text-muted">No MCP servers configured</p>
      )}

      <div className="space-y-2">
        {servers.map((server) => (
          <div
            key={server.id}
            className="flex items-center justify-between bg-pure-black border border-border-mist-08 rounded-default p-3"
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-2 h-2 rounded-full ${
                  server.enabled ? 'bg-success' : 'bg-text-muted'
                }`}
              />
              <div>
                <p className="text-sm text-text-primary">{server.name}</p>
                <p className="text-xs text-text-muted">{server.transport}</p>
              </div>
            </div>
            <button
              onClick={() => handleRemove(server.id)}
              className="text-text-muted hover:text-error transition-colors cursor-pointer p-1"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
