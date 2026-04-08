import { useState, useEffect } from 'react'
import { Plus, Trash2, X, Zap, Terminal, Globe } from 'lucide-react'
import type { MCPServer } from '../../../../shared/types'

interface AddServerFormData {
  name: string
  transport: 'stdio' | 'sse'
  command: string
  url: string
  args: string
  env: string
}

const EMPTY_FORM: AddServerFormData = {
  name: '',
  transport: 'stdio',
  command: '',
  url: '',
  args: '',
  env: '',
}

function AddServerModal({
  onClose,
  onSave,
}: {
  onClose: () => void
  onSave: (data: AddServerFormData) => void
}): React.JSX.Element {
  const [form, setForm] = useState<AddServerFormData>(EMPTY_FORM)
  const [error, setError] = useState<string | null>(null)

  const update = (field: keyof AddServerFormData, value: string): void => {
    setForm((f) => ({ ...f, [field]: value }))
    setError(null)
  }

  const handleSubmit = (): void => {
    if (!form.name.trim()) {
      setError('Name is required')
      return
    }
    if (form.transport === 'stdio' && !form.command.trim()) {
      setError('Command is required for stdio transport')
      return
    }
    if (form.transport === 'sse' && !form.url.trim()) {
      setError('URL is required for SSE transport')
      return
    }
    onSave(form)
  }

  const inputClass =
    'w-full bg-transparent border border-border-mist-10 rounded-default px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-signal-blue focus:outline-none transition-colors'
  const labelClass = 'block text-xs text-text-secondary mb-1.5'

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-pure-black border border-border-mist-10 rounded-default w-[460px] max-h-[85vh] overflow-y-auto shadow-floating">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-mist-06">
          <h3 className="text-base font-medium text-text-primary">Add MCP Server</h3>
          <button
            onClick={onClose}
            className="p-1 text-text-muted hover:text-text-primary transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Name */}
          <div>
            <label className={labelClass}>Server Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              placeholder="e.g. Filesystem, Slack, GitHub"
              className={inputClass}
              autoFocus
            />
          </div>

          {/* Transport */}
          <div>
            <label className={labelClass}>Transport</label>
            <div className="flex gap-2">
              <button
                onClick={() => update('transport', 'stdio')}
                className={`flex items-center gap-2 flex-1 px-3 py-2.5 rounded-default border text-sm transition-colors cursor-pointer ${
                  form.transport === 'stdio'
                    ? 'border-electric-cyan bg-cyan-glow-12 text-text-primary'
                    : 'border-border-mist-10 text-text-tertiary hover:text-text-secondary'
                }`}
              >
                <Terminal size={14} />
                stdio
              </button>
              <button
                onClick={() => update('transport', 'sse')}
                className={`flex items-center gap-2 flex-1 px-3 py-2.5 rounded-default border text-sm transition-colors cursor-pointer ${
                  form.transport === 'sse'
                    ? 'border-electric-cyan bg-cyan-glow-12 text-text-primary'
                    : 'border-border-mist-10 text-text-tertiary hover:text-text-secondary'
                }`}
              >
                <Globe size={14} />
                SSE / HTTP
              </button>
            </div>
          </div>

          {/* stdio fields */}
          {form.transport === 'stdio' && (
            <>
              <div>
                <label className={labelClass}>Command</label>
                <input
                  type="text"
                  value={form.command}
                  onChange={(e) => update('command', e.target.value)}
                  placeholder="e.g. npx -y @modelcontextprotocol/server-filesystem"
                  className={`${inputClass} font-mono text-xs`}
                />
                <p className="text-xs text-text-muted mt-1">
                  The command to spawn the MCP server process
                </p>
              </div>

              <div>
                <label className={labelClass}>Arguments (one per line)</label>
                <textarea
                  value={form.args}
                  onChange={(e) => update('args', e.target.value)}
                  placeholder={`/Users/me/allowed-directory\n/tmp`}
                  rows={3}
                  className={`${inputClass} font-mono text-xs resize-none`}
                />
              </div>
            </>
          )}

          {/* SSE fields */}
          {form.transport === 'sse' && (
            <div>
              <label className={labelClass}>Server URL</label>
              <input
                type="text"
                value={form.url}
                onChange={(e) => update('url', e.target.value)}
                placeholder="e.g. https://mcp.composio.dev/api/v1/sse"
                className={`${inputClass} font-mono text-xs`}
              />
              <p className="text-xs text-text-muted mt-1">
                HTTP SSE endpoint URL (supports OAuth / API key auth)
              </p>
            </div>
          )}

          {/* Environment Variables */}
          <div>
            <label className={labelClass}>Environment Variables (KEY=VALUE, one per line)</label>
            <textarea
              value={form.env}
              onChange={(e) => update('env', e.target.value)}
              placeholder={`API_KEY=sk-xxx\nDATABASE_URL=postgres://...`}
              rows={3}
              className={`${inputClass} font-mono text-xs resize-none`}
            />
          </div>

          {/* Error */}
          {error && <p className="text-sm text-error">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-5 py-4 border-t border-border-mist-06">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-text-secondary border border-border-mist-10 rounded-default hover:bg-surface-hover transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-white text-black font-medium rounded-default hover:bg-white/90 transition-colors cursor-pointer"
          >
            <Zap size={14} />
            Add Server
          </button>
        </div>
      </div>
    </div>
  )
}

export default function MCPSettings(): React.JSX.Element {
  const [servers, setServers] = useState<MCPServer[]>([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [testing, setTesting] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; error?: string }>>({})

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

  const handleTest = async (id: string): Promise<void> => {
    setTesting(id)
    try {
      const result = await window.folk.testMCPConnection(id)
      setTestResults((prev) => ({ ...prev, [id]: result }))
    } catch {
      setTestResults((prev) => ({ ...prev, [id]: { ok: false, error: 'Test failed' } }))
    }
    setTesting(null)
  }

  const handleSave = async (data: AddServerFormData): Promise<void> => {
    // Parse args from newline-separated string
    const args = data.args
      .split('\n')
      .map((a) => a.trim())
      .filter(Boolean)

    // Parse env from KEY=VALUE lines
    const envObj: Record<string, string> = {}
    data.env
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => {
        const eqIdx = line.indexOf('=')
        if (eqIdx > 0) {
          envObj[line.slice(0, eqIdx)] = line.slice(eqIdx + 1)
        }
      })

    await window.folk.addMCPServer({
      name: data.name.trim(),
      transport: data.transport,
      command: data.transport === 'stdio' ? data.command.trim() : null,
      url: data.transport === 'sse' ? data.url.trim() : null,
      args: args.length > 0 ? args : null,
      env: Object.keys(envObj).length > 0 ? envObj : null,
      enabled: true,
    })

    setShowAddModal(false)
    await loadServers()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-text-primary">MCP Servers</h3>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary border border-border-mist-10 rounded-default hover:border-border-mist-12 transition-colors cursor-pointer"
        >
          <Plus size={12} />
          Add Server
        </button>
      </div>

      {servers.length === 0 && (
        <div className="text-center py-8">
          <p className="text-sm text-text-muted mb-1">No MCP servers configured</p>
          <p className="text-xs text-text-muted">
            Add servers to connect Folk to Slack, Gmail, databases, and more
          </p>
        </div>
      )}

      <div className="space-y-2">
        {servers.map((server) => (
          <div
            key={server.id}
            className="bg-pure-black border border-border-mist-08 rounded-default p-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    testResults[server.id]?.ok
                      ? 'bg-success'
                      : testResults[server.id]
                        ? 'bg-error'
                        : server.enabled
                          ? 'bg-warning'
                          : 'bg-text-muted'
                  }`}
                />
                <div>
                  <p className="text-sm text-text-primary">{server.name}</p>
                  <p className="text-xs font-mono text-text-muted">
                    {server.transport === 'stdio' ? server.command : server.url}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleTest(server.id)}
                  disabled={testing === server.id}
                  className="text-xs text-text-muted hover:text-text-primary px-2 py-1 border border-border-mist-06 rounded-default transition-colors cursor-pointer disabled:opacity-50"
                >
                  {testing === server.id ? 'Testing...' : 'Test'}
                </button>
                <button
                  onClick={() => handleRemove(server.id)}
                  className="text-text-muted hover:text-error transition-colors cursor-pointer p-1"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            {testResults[server.id] && !testResults[server.id].ok && (
              <p className="text-xs text-error mt-2 pl-5">
                {testResults[server.id].error}
              </p>
            )}
            {testResults[server.id]?.ok && (
              <p className="text-xs text-success mt-2 pl-5">Connected successfully</p>
            )}
          </div>
        ))}
      </div>

      {showAddModal && (
        <AddServerModal onClose={() => setShowAddModal(false)} onSave={handleSave} />
      )}
    </div>
  )
}
