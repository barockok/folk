// MCPConfigDrawer.tsx — MCP config editor (modal, template-driven)
import { useState, useEffect, useCallback } from 'react'
import type {
  MCPPrompt,
  MCPPromptMessage,
  MCPResource,
  MCPResourceContent,
  MCPTemplate
} from '@shared/types'
import { useMCPStore } from '../../stores/useMCPStore'
import { useUIStore } from '../../stores/useUIStore'
import { Icon } from '../../components/icons'
import {
  guessTemplate,
  initFromData,
  buildServerFromForm,
  buildPreviewJson,
  type ParamValues
} from './utils'

interface MCPConfigDrawerProps {
  id: string | null
  isNew: boolean
  onClose: () => void
}

// ─── FormField ────────────────────────────────────────────────────────────────

interface FieldDef {
  key: string
  label: string
  placeholder?: string
  secret?: boolean
}

function FormField({
  def,
  value,
  onChange
}: {
  def: FieldDef
  value: string
  onChange: (v: string) => void
}) {
  const [reveal, setReveal] = useState(false)

  if (def.secret) {
    return (
      <div className="field">
        <label className="label">{def.label}</label>
        <div style={{ position: 'relative' }}>
          <input
            className="input mono"
            type={reveal ? 'text' : 'password'}
            value={value}
            placeholder={def.placeholder ?? 'Paste secret here'}
            onChange={(e) => onChange(e.target.value)}
            style={{ paddingRight: 36 }}
          />
          <button
            type="button"
            className="btn btn-icon btn-sm btn-plain"
            style={{ position: 'absolute', right: 3, top: 3 }}
            onClick={() => setReveal((r) => !r)}
          >
            <Icon name={reveal ? 'eyeOff' : 'eye'} size={13} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="field">
      <label className="label">{def.label}</label>
      <input
        className="input"
        value={value}
        placeholder={def.placeholder ?? ''}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

// ─── Template picker card ─────────────────────────────────────────────────────

const TEMPLATE_META: Record<string, { icon: string; desc: string; tag: string }> = {
  filesystem: { icon: 'FS', desc: 'Let Claude read and write files in folders you choose.', tag: 'Official' },
  github: { icon: 'GH', desc: 'Issues, pull requests, repositories.', tag: 'Official' },
  postgres: { icon: 'PG', desc: 'Query a Postgres database.', tag: 'Official' },
  slack: { icon: 'SL', desc: 'Read channels and send messages.', tag: 'Official' },
  notion: { icon: 'NT', desc: 'Pages, databases, search.', tag: 'Remote' },
  custom: { icon: '+', desc: 'Paste a command or URL from documentation.', tag: 'Custom' }
}

// ─── Resources tab ────────────────────────────────────────────────────────────

function ResourcesTab({ serverId }: { serverId: string }) {
  const toast = useUIStore((s) => s.toast)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [resources, setResources] = useState<MCPResource[]>([])
  const [openUri, setOpenUri] = useState<string | null>(null)
  const [contents, setContents] = useState<MCPResourceContent[]>([])
  const [reading, setReading] = useState(false)

  useEffect(() => {
    setLoading(true)
    setError(null)
    void window.folk.mcp.listResources(serverId).then((r) => {
      setLoading(false)
      if (r.ok) setResources(r.resources)
      else setError(r.error ?? 'Failed to list resources')
    })
  }, [serverId])

  const open = async (uri: string) => {
    setOpenUri(uri)
    setReading(true)
    setContents([])
    const r = await window.folk.mcp.readResource(serverId, uri)
    setReading(false)
    if (r.ok) setContents(r.contents)
    else toast({ kind: 'err', text: r.error ?? 'Read failed' })
  }

  if (loading) return <div className="sub">Connecting…</div>
  if (error) return <div className="sub" style={{ color: 'var(--err)' }}>{error}</div>
  if (resources.length === 0) return <div className="sub">No resources exposed.</div>

  return (
    <div style={{ display: 'flex', gap: 16, minHeight: 0 }}>
      <div style={{ flex: '0 0 240px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {resources.map((r) => (
          <button
            key={r.uri}
            className={'mk-cat' + (openUri === r.uri ? ' on' : '')}
            onClick={() => void open(r.uri)}
            style={{ textAlign: 'left' }}
            title={r.description}
          >
            <div style={{ fontWeight: 500 }}>{r.name}</div>
            <div className="hint" style={{ fontSize: 11 }}>{r.uri}</div>
          </button>
        ))}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {!openUri && <div className="sub">Select a resource to view its contents.</div>}
        {openUri && reading && <div className="sub">Reading…</div>}
        {openUri && !reading && contents.length === 0 && (
          <div className="sub">No content returned.</div>
        )}
        {openUri && !reading && contents.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {contents.map((c, i) => (
              <div
                key={i}
                style={{
                  background: 'var(--bg-sub)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  padding: 12
                }}
              >
                <div className="hint" style={{ marginBottom: 6 }}>
                  {c.mimeType ?? 'unknown'} · {c.uri}
                </div>
                {c.text !== undefined ? (
                  <pre
                    className="mono"
                    style={{
                      margin: 0,
                      fontSize: 12,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      maxHeight: 360,
                      overflow: 'auto'
                    }}
                  >
                    {c.text}
                  </pre>
                ) : (
                  <div className="sub">Binary content ({c.blob?.length ?? 0} bytes base64)</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Prompts tab ──────────────────────────────────────────────────────────────

function PromptsTab({ serverId }: { serverId: string }) {
  const toast = useUIStore((s) => s.toast)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [prompts, setPrompts] = useState<MCPPrompt[]>([])
  const [openName, setOpenName] = useState<string | null>(null)
  const [args, setArgs] = useState<Record<string, string>>({})
  const [messages, setMessages] = useState<MCPPromptMessage[]>([])
  const [description, setDescription] = useState<string | null>(null)
  const [running, setRunning] = useState(false)

  useEffect(() => {
    setLoading(true)
    setError(null)
    void window.folk.mcp.listPrompts(serverId).then((r) => {
      setLoading(false)
      if (r.ok) setPrompts(r.prompts)
      else setError(r.error ?? 'Failed to list prompts')
    })
  }, [serverId])

  const select = (p: MCPPrompt) => {
    setOpenName(p.name)
    setMessages([])
    setDescription(null)
    const init: Record<string, string> = {}
    for (const a of p.arguments ?? []) init[a.name] = ''
    setArgs(init)
  }

  const run = async () => {
    if (!openName) return
    setRunning(true)
    const r = await window.folk.mcp.getPrompt(serverId, openName, args)
    setRunning(false)
    if (r.ok) {
      setMessages(r.messages)
      setDescription(r.description ?? null)
    } else {
      toast({ kind: 'err', text: r.error ?? 'Failed to render prompt' })
    }
  }

  if (loading) return <div className="sub">Connecting…</div>
  if (error) return <div className="sub" style={{ color: 'var(--err)' }}>{error}</div>
  if (prompts.length === 0) return <div className="sub">No prompts exposed.</div>

  const current = prompts.find((p) => p.name === openName)

  return (
    <div style={{ display: 'flex', gap: 16, minHeight: 0 }}>
      <div style={{ flex: '0 0 240px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {prompts.map((p) => (
          <button
            key={p.name}
            className={'mk-cat' + (openName === p.name ? ' on' : '')}
            onClick={() => select(p)}
            style={{ textAlign: 'left' }}
            title={p.description}
          >
            <div style={{ fontWeight: 500 }}>{p.name}</div>
            {p.description && (
              <div className="hint" style={{ fontSize: 11 }}>{p.description}</div>
            )}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {!openName && <div className="sub">Select a prompt to view its template.</div>}
        {current && (
          <>
            {(current.arguments ?? []).length > 0 && (
              <div style={{ marginBottom: 12 }}>
                {(current.arguments ?? []).map((a) => (
                  <div key={a.name} className="field" style={{ marginTop: 8 }}>
                    <label className="label">
                      {a.name}
                      {a.required && <span style={{ color: 'var(--err)' }}> *</span>}
                    </label>
                    <input
                      className="input"
                      value={args[a.name] ?? ''}
                      onChange={(e) => setArgs((p) => ({ ...p, [a.name]: e.target.value }))}
                    />
                    {a.description && <div className="hint">{a.description}</div>}
                  </div>
                ))}
              </div>
            )}
            <button className="btn btn-primary btn-sm" onClick={() => void run()} disabled={running}>
              {running ? <span className="spinner" /> : 'Render prompt'}
            </button>
            {description && (
              <div className="sub" style={{ marginTop: 12 }}>{description}</div>
            )}
            {messages.length > 0 && (
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {messages.map((m, i) => (
                  <div
                    key={i}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      padding: 10,
                      background: 'var(--bg-sub)'
                    }}
                  >
                    <div className="eyebrow" style={{ marginBottom: 6 }}>{m.role}</div>
                    {m.content && (m.content as { type?: string }).type === 'text' ? (
                      <pre
                        className="mono"
                        style={{
                          margin: 0,
                          fontSize: 12,
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word'
                        }}
                      >
                        {(m.content as { text: string }).text}
                      </pre>
                    ) : (
                      <div className="sub">Non-text content</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

type DrawerTab = 'settings' | 'resources' | 'prompts'

// ─── MCPConfigDrawer ─────────────────────────────────────────────────────────

export function MCPConfigDrawer({ id, isNew, onClose }: MCPConfigDrawerProps) {
  const { servers, save, test } = useMCPStore()
  const toast = useUIStore((s) => s.toast)

  const existing = id ? servers.find((s) => s.id === id) ?? null : null

  const [templates, setTemplates] = useState<Record<string, MCPTemplate>>({})
  const [tplId, setTplId] = useState<string | null>(() => {
    if (!isNew && existing) return guessTemplate(existing)
    return null
  })
  const [step, setStep] = useState<0 | 1>(() => (!isNew && existing ? 1 : 0))
  const [name, setName] = useState(existing?.name ?? '')
  const [params, setParams] = useState<ParamValues>(() => {
    if (!isNew && existing && tplId) return initFromData(existing, tplId)
    return {}
  })
  const [showRaw, setShowRaw] = useState(false)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const isLocal = existing?.source === 'local'
  const [tab, setTab] = useState<DrawerTab>(isLocal ? 'resources' : 'settings')

  // Load templates from main process once
  useEffect(() => {
    window.folk.mcp.templates().then(setTemplates).catch(console.error)
  }, [])

  // Escape key closes
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const selectTemplate = useCallback(
    (id: string, tpl: MCPTemplate) => {
      setTplId(id)
      setName(tpl.label)
      setParams({})
      setStep(1)
    },
    []
  )

  const handleSave = async () => {
    if (!tplId) return
    setSaving(true)
    try {
      const tpl = templates[tplId]
      const server = buildServerFromForm(existing, tplId, tpl, name, params)
      await save(server)
      toast({ kind: 'ok', text: isNew ? 'Server added' : 'Changes saved' })
      onClose()
    } catch (err) {
      toast({ kind: 'err', text: `Save failed: ${(err as Error).message}` })
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    if (!existing?.id) {
      toast({ kind: 'warn', text: 'Save the server first, then test it.' })
      return
    }
    setTesting(true)
    try {
      const res = await test(existing.id)
      if (res.ok) {
        toast({ kind: 'ok', text: `Connected — ${res.tools.length} tool(s) found` })
      } else {
        toast({ kind: 'err', text: res.error ?? 'Connection failed' })
      }
    } catch (err) {
      toast({ kind: 'err', text: (err as Error).message })
    } finally {
      setTesting(false)
    }
  }

  const currentTpl = tplId ? templates[tplId] : undefined
  const fields = currentTpl?.fields ?? []

  const rawJson =
    tplId && step === 1
      ? buildPreviewJson(name, tplId, currentTpl, params)
      : ''

  const hasAllTemplates = Object.keys(templates).length > 0

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-hd">
          <div
            className="hero-accent"
            style={{ width: 40, height: 40, fontSize: 18, borderRadius: 6 }}
          >
            {tplId ? (TEMPLATE_META[tplId]?.icon ?? '+') : '+'}
          </div>
          <div className="grow">
            <h2 className="h2">
              {isNew
                ? step === 0
                  ? 'Add a server'
                  : `New ${currentTpl?.label ?? ''} server`
                : `Edit ${name}`}
            </h2>
            <div style={{ fontSize: 13, color: 'var(--body)', marginTop: 2 }}>
              {step === 0
                ? 'Pick what you want Claude to be able to do.'
                : "Fill in the details below — we'll handle the technical bits."}
            </div>
          </div>
          <button className="btn btn-icon btn-plain" onClick={onClose}>
            <Icon name="x" size={14} />
          </button>
        </div>

        {/* Tabs (existing servers only) */}
        {!isNew && existing && (
          <div className="mk-kind-tabs" style={{ paddingLeft: 24, paddingRight: 24 }}>
            <button
              className={'mk-kind-tab' + (tab === 'settings' ? ' on' : '')}
              onClick={() => setTab('settings')}
            >
              <span>{isLocal ? 'Source' : 'Settings'}</span>
            </button>
            <button
              className={'mk-kind-tab' + (tab === 'resources' ? ' on' : '')}
              onClick={() => setTab('resources')}
            >
              <span>Resources</span>
            </button>
            <button
              className={'mk-kind-tab' + (tab === 'prompts' ? ' on' : '')}
              onClick={() => setTab('prompts')}
            >
              <span>Prompts</span>
            </button>
          </div>
        )}

        {/* Body */}
        <div className="modal-bd">
          {!isNew && existing && tab === 'resources' && (
            <ResourcesTab serverId={existing.id} />
          )}
          {!isNew && existing && tab === 'prompts' && (
            <PromptsTab serverId={existing.id} />
          )}
          {!isNew && existing && isLocal && tab === 'settings' && (
            <div>
              <div className="sub" style={{ marginBottom: 12 }}>
                Read-only — defined in a Claude Code config file.
              </div>
              <div className="field">
                <label className="label">Source file</label>
                <input className="input mono" value={existing.sourcePath ?? ''} readOnly />
              </div>
              {existing.command && (
                <div className="field">
                  <label className="label">Command</label>
                  <input className="input mono" value={existing.command} readOnly />
                </div>
              )}
              {existing.args && existing.args.length > 0 && (
                <div className="field">
                  <label className="label">Args</label>
                  <input className="input mono" value={existing.args.join(' ')} readOnly />
                </div>
              )}
              {existing.url && (
                <div className="field">
                  <label className="label">URL</label>
                  <input className="input mono" value={existing.url} readOnly />
                </div>
              )}
              {existing.env && Object.keys(existing.env).length > 0 && (
                <div className="field">
                  <label className="label">Env vars</label>
                  <pre
                    className="mono"
                    style={{
                      margin: 0,
                      background: 'var(--bg-sub)',
                      padding: 10,
                      borderRadius: 6,
                      border: '1px solid var(--border)',
                      fontSize: 12
                    }}
                  >
                    {Object.keys(existing.env).join('\n')}
                  </pre>
                </div>
              )}
            </div>
          )}
          {(isNew || (tab === 'settings' && !isLocal)) && (
          <>
          {/* Step 0: template picker */}
          {step === 0 && (
            <>
              <div className="label" style={{ marginBottom: 10 }}>
                Templates
              </div>
              {hasAllTemplates ? (
                <div className="tpl-grid">
                  {Object.entries(templates).map(([tid, tpl]) => {
                    const meta = TEMPLATE_META[tid] ?? { icon: '+', desc: '', tag: 'Custom' }
                    return (
                      <button
                        key={tid}
                        className="tpl"
                        onClick={() => selectTemplate(tid, tpl)}
                      >
                        <div className="tpl-hd">
                          <div className="tpl-ic">{meta.icon}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="tpl-name trunc">{tpl.label}</div>
                            <div className="tpl-tag">{meta.tag}</div>
                          </div>
                        </div>
                        <div className="tpl-desc">{meta.desc}</div>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div style={{ color: 'var(--body)', fontSize: 13 }}>Loading templates…</div>
              )}
            </>
          )}

          {/* Step 1: form fields */}
          {step === 1 && (
            <>
              {/* Name */}
              <div className="field">
                <label className="label">Name</label>
                <input
                  className="input"
                  value={name}
                  placeholder="Give it a friendly name"
                  onChange={(e) => setName(e.target.value)}
                />
                <div className="hint">Shown in your list and in the command menu.</div>
              </div>

              {/* Template fields */}
              {fields.map((f) => (
                <FormField
                  key={f.key}
                  def={f}
                  value={String(params[f.key] ?? '')}
                  onChange={(v) => setParams((prev) => ({ ...prev, [f.key]: v }))}
                />
              ))}

              {/* Raw JSON toggle */}
              <div
                style={{
                  marginTop: 22,
                  borderTop: '1px solid var(--border)',
                  paddingTop: 14
                }}
              >
                <button
                  type="button"
                  className="btn btn-plain btn-sm"
                  onClick={() => setShowRaw((s) => !s)}
                >
                  <Icon name={showRaw ? 'chevronDown' : 'chevronRight'} size={12} />
                  Raw config
                </button>
                {showRaw && (
                  <div
                    style={{
                      marginTop: 12,
                      background: 'var(--bg-sub)',
                      padding: 14,
                      borderRadius: 6,
                      border: '1px solid var(--border)'
                    }}
                  >
                    <div className="label">Generated configuration</div>
                    <pre
                      className="mono"
                      style={{
                        margin: '8px 0 0',
                        fontSize: 12,
                        background: '#0d253d',
                        color: '#e6edf5',
                        padding: 14,
                        borderRadius: 4,
                        overflowX: 'auto',
                        lineHeight: 1.7
                      }}
                    >
                      {rawJson}
                    </pre>
                    <div className="hint" style={{ marginTop: 8 }}>
                      Editing fields above will update this automatically.
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
          </>
          )}
        </div>

        {/* Footer */}
        <div className="modal-ft">
          {tab === 'settings' && step === 1 && isNew && (
            <button className="btn btn-plain" onClick={() => setStep(0)}>
              <Icon name="chevronLeft" size={13} /> Back
            </button>
          )}
          {tab === 'settings' && step === 1 && !isNew && existing && (
            <button
              type="button"
              className="btn btn-plain"
              onClick={handleTest}
              disabled={testing}
            >
              <Icon name="bolt" size={13} />
              {testing ? 'Testing…' : 'Test connect'}
            </button>
          )}
          <div className="grow" />
          <button className="btn" onClick={onClose}>
            {tab === 'settings' ? 'Cancel' : 'Close'}
          </button>
          {tab === 'settings' && step === 1 && !isLocal && (
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={!name.trim() || saving}
            >
              <Icon name="check" size={13} />
              {saving ? 'Saving…' : isNew ? 'Add server' : 'Save changes'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
