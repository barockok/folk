// MCPDetail.tsx — full-page server detail, modeled after Claude Desktop's
// "Manage connector" pattern: identity header, configuration card with Save,
// tool permissions section, and collapsed Resources/Prompts at the bottom.
import { useEffect, useMemo, useState } from 'react'
import type {
  MCPPrompt,
  MCPPromptMessage,
  MCPResource,
  MCPResourceContent,
  MCPServer,
  ToolInfo
} from '@shared/types'
import { Icon } from '../../components/icons'
import { useMCPStore } from '../../stores/useMCPStore'
import { useUIStore } from '../../stores/useUIStore'
import {
  MCPForm,
  ModePicker,
  serverFromValues,
  valuesFromServer,
  type FormValues,
  type ConnectMode
} from './MCPForm'

interface Props {
  id: string | null
  isNew: boolean
  onBack: () => void
}

function localScopeBadge(server: MCPServer | null): { label: string; tone: 'user' | 'project' | 'plugin' } | null {
  if (!server || server.source !== 'local') return null
  const parts = server.id.split(':')
  if (parts[1] === 'plugin' && parts[2]) return { label: parts[2], tone: 'plugin' }
  if (parts[1] === 'project') return { label: 'Project', tone: 'project' }
  return { label: 'User', tone: 'user' }
}

export function MCPDetail({ id, isNew, onBack }: Props) {
  const { servers, save, remove, setEnabled, test } = useMCPStore()
  const toast = useUIStore((s) => s.toast)
  const existing = id ? servers.find((s) => s.id === id) ?? null : null
  const isLocal = existing?.source === 'local'

  const [stage, setStage] = useState<'pick' | 'form'>(isNew ? 'pick' : 'form')
  const [values, setValues] = useState<FormValues>(() => valuesFromServer(existing))
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [tools, setTools] = useState<ToolInfo[] | null>(null)
  const [reauthSignal, setReauthSignal] = useState(0)
  const [signingIn, setSigningIn] = useState(false)

  useEffect(() => {
    setValues(valuesFromServer(existing))
  }, [existing?.id])

  const dirty = useMemo(() => {
    if (isNew) return values.name.trim().length > 0
    if (!existing) return false
    const baseline = valuesFromServer(existing)
    return JSON.stringify(baseline) !== JSON.stringify(values)
  }, [existing, isNew, values])

  const pick = (m: ConnectMode) => {
    setValues((v) => ({ ...v, mode: m }))
    setStage('form')
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const server = serverFromValues(existing, values)
      await save(server)
      toast({ kind: 'ok', text: isNew ? 'Server added' : 'Changes saved' })
      if (isNew) onBack()
    } catch (err) {
      toast({ kind: 'err', text: `Save failed: ${(err as Error).message}` })
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async () => {
    if (!existing) return
    if (!window.confirm(`Uninstall ${existing.name}? This removes the server from folk.`)) return
    await remove(existing.id)
    toast({ kind: 'ok', text: `Removed ${existing.name}` })
    onBack()
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
        setTools(res.tools)
        toast({ kind: 'ok', text: `Connected — ${res.tools.length} tool${res.tools.length === 1 ? '' : 's'} found` })
      } else {
        setTools([])
        toast({ kind: 'err', text: res.error ?? 'Connection failed' })
      }
    } catch (err) {
      toast({ kind: 'err', text: (err as Error).message })
    } finally {
      setTesting(false)
    }
  }

  const handleReauth = () => {
    setValues((v) => ({ ...v, apiKey: '' }))
    setReauthSignal((n) => n + 1)
    toast({ kind: 'warn', text: 'Paste your new key, then Save.' })
  }

  const handleSignIn = async () => {
    if (!existing) return
    if (dirty) {
      toast({ kind: 'warn', text: 'Save your changes first, then sign in.' })
      return
    }
    setSigningIn(true)
    try {
      const res = await window.folk.mcp.signIn(existing.id)
      if (res.ok) {
        toast({ kind: 'ok', text: `Signed in to ${existing.name}` })
        // Reload the server list so the form picks up the freshly stored
        // metadata + clientId.
        await useMCPStore.getState().load()
      } else {
        toast({ kind: 'err', text: res.error ?? 'Sign-in failed' })
      }
    } finally {
      setSigningIn(false)
    }
  }

  const handleSignOut = async () => {
    if (!existing) return
    const res = await window.folk.mcp.signOut(existing.id)
    if (res.ok) {
      toast({ kind: 'ok', text: `Signed out of ${existing.name}` })
      await useMCPStore.getState().load()
    } else {
      toast({ kind: 'err', text: res.error ?? 'Sign-out failed' })
    }
  }

  const canReauth =
    !isNew &&
    !isLocal &&
    values.mode === 'http' &&
    valuesFromServer(existing).apiKey.length > 0

  const scope = localScopeBadge(existing)
  const heading = isNew
    ? stage === 'pick'
      ? 'Add a server'
      : values.mode === 'http' ? 'New online service' : 'New local program'
    : existing?.name ?? 'Server'

  return (
    <div className="page mcp-detail">
      <button className="mcp-detail-back" onClick={onBack} type="button">
        <Icon name="chevronLeft" size={13} />
        All servers
      </button>

      {/* Identity row */}
      <div className="mcp-detail-identity">
        <div
          className={
            'mcp-detail-logo ' +
            (values.mode === 'http' ? 'mcp-detail-logo-online' : 'mcp-detail-logo-local')
          }
        >
          <Icon name={values.mode === 'http' ? 'globe' : 'puzzle'} size={20} />
        </div>
        <div className="mcp-detail-id">
          <h1 className="mcp-detail-title">{heading}</h1>
          <div className="mcp-detail-meta">
            {scope ? (
              <span className={
                'badge ' +
                (scope.tone === 'plugin'
                  ? 'badge-magenta'
                  : scope.tone === 'project'
                    ? 'badge-ac'
                    : '')
              }>
                {scope.label}
              </span>
            ) : (
              <span className="mcp-detail-meta-tag">
                {values.mode === 'http' ? 'Online service' : 'Local program'}
              </span>
            )}
            {!isNew && existing && (
              <span className="mcp-detail-meta-sub mono trunc" title={existing.id}>
                {existing.id}
              </span>
            )}
          </div>
        </div>
        {!isNew && existing && (
          <div className="mcp-detail-actions">
            {!isLocal && (
              <button
                type="button"
                role="switch"
                aria-checked={existing.isEnabled}
                onClick={() => void setEnabled(existing.id, !existing.isEnabled)}
                className={'toggle-w-label ' + (existing.isEnabled ? 'on' : '')}
              >
                <span className={'toggle' + (existing.isEnabled ? ' on' : '')}>
                  <span className="toggle-thumb" />
                </span>
                <span className="toggle-w-label-text">
                  {existing.isEnabled ? 'Enabled' : 'Disabled'}
                </span>
              </button>
            )}
            {!isLocal && (
              <button className="btn btn-plain" onClick={() => void handleRemove()} title="Remove this server from folk">
                <Icon name="trash" size={13} /> Uninstall
              </button>
            )}
          </div>
        )}
      </div>

      {/* Read-only banner */}
      {isLocal && existing && (
        <div className="mcp-managed-banner" style={{ marginBottom: 24 }}>
          <Icon name="puzzle" size={14} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="mcp-managed-title">Managed by Claude Code</div>
            <div className="mcp-managed-path mono">{existing.sourcePath ?? ''}</div>
          </div>
        </div>
      )}

      {/* Mode pick (new only) */}
      {isNew && stage === 'pick' && (
        <section className="mcp-card">
          <header className="mcp-card-hd">
            <h2 className="mcp-card-h">How does this server run?</h2>
            <p className="mcp-card-sub">Pick the connection style — folk handles the rest.</p>
          </header>
          <div className="mcp-card-bd">
            <ModePicker onPick={pick} />
          </div>
        </section>
      )}

      {/* Configuration card */}
      {(stage === 'form' || !isNew) && (
        <section className="mcp-card">
          <header className="mcp-card-hd">
            <h2 className="mcp-card-h">Configuration</h2>
            <p className="mcp-card-sub">
              {isLocal
                ? 'View-only — defined in a Claude Code config file.'
                : "Update the server's connection details. Changes apply on Save."}
            </p>
          </header>
          <div className="mcp-card-bd">
            <MCPForm
              values={values}
              onChange={setValues}
              readOnly={isLocal}
              focusApiKey={reauthSignal}
            />
          </div>
          {!isLocal && (
            <footer className="mcp-card-ft">
              <div className="grow" />
              {canReauth && (
                <button className="btn btn-plain" onClick={handleReauth}>
                  <Icon name="refresh" size={13} /> Refresh authorization
                </button>
              )}
              {isNew && stage === 'form' && (
                <button className="btn btn-plain" onClick={() => setStage('pick')}>
                  <Icon name="chevronLeft" size={13} /> Back
                </button>
              )}
              <button
                className="btn btn-primary"
                onClick={() => void handleSave()}
                disabled={!values.name.trim() || saving || (!isNew && !dirty)}
              >
                <Icon name="check" size={13} />
                {saving ? 'Saving…' : isNew ? 'Add server' : dirty ? 'Save changes' : 'Saved'}
              </button>
            </footer>
          )}
        </section>
      )}

      {/* OAuth — only for HTTP servers, only after first save */}
      {!isNew && existing && !isLocal && existing.transport === 'http' && (
        <section className="mcp-card">
          <header className="mcp-card-hd">
            <h2 className="mcp-card-h">Sign-in</h2>
            <p className="mcp-card-sub">
              {existing.oauthStatus === 'authorized'
                ? 'Connected via OAuth. Tokens refresh automatically.'
                : 'Sign in if this server uses OAuth. Skip if you provided an API key in Advanced settings.'}
            </p>
          </header>
          <div className="mcp-card-bd">
            <SignInRow
              status={existing.oauthStatus}
              signingIn={signingIn}
              hasUrl={values.url.trim().length > 0}
              onSignIn={() => void handleSignIn()}
              onSignOut={() => void handleSignOut()}
            />
          </div>
        </section>
      )}

      {/* Tool permissions — only meaningful for existing servers */}
      {!isNew && existing && (
        <section className="mcp-card" style={{ marginTop: 20 }}>
          <header className="mcp-card-hd">
            <h2 className="mcp-card-h">Tool permissions</h2>
            <p className="mcp-card-sub">
              Tools the server exposes. Test the connection to fetch the list.
            </p>
          </header>
          <div className="mcp-card-bd">
            <ToolPermissionsList
              server={existing}
              tools={tools}
              testing={testing}
              onTest={() => void handleTest()}
            />
          </div>
        </section>
      )}

      {/* Browse Resources / Prompts (collapsed by default) */}
      {!isNew && existing && (
        <>
          <BrowseSection title="Resources" hint="Files and data exposed by this server.">
            <ResourcesPane serverId={existing.id} />
          </BrowseSection>
          <BrowseSection title="Prompts" hint="Pre-built prompt templates the server provides.">
            <PromptsPane serverId={existing.id} />
          </BrowseSection>
        </>
      )}
    </div>
  )
}

// ── OAuth sign-in row ────────────────────────────────────────────────────────

function SignInRow({
  status,
  signingIn,
  hasUrl,
  onSignIn,
  onSignOut
}: {
  status: MCPServer['oauthStatus']
  signingIn: boolean
  hasUrl: boolean
  onSignIn: () => void
  onSignOut: () => void
}) {
  if (status === 'authorized') {
    return (
      <div className="oauth-row">
        <div className="oauth-row-lhs">
          <span className="dot dot-ok" />
          <div>
            <div className="oauth-row-title">Signed in</div>
            <div className="oauth-row-sub">folk holds an active OAuth token in the macOS Keychain.</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-plain btn-sm" onClick={onSignIn} disabled={signingIn}>
            {signingIn ? <span className="spinner" /> : <Icon name="refresh" size={12} />}
            Re-sign in
          </button>
          <button className="btn btn-plain btn-sm" onClick={onSignOut}>
            <Icon name="x" size={12} />
            Sign out
          </button>
        </div>
      </div>
    )
  }
  return (
    <div className="oauth-row">
      <div className="oauth-row-lhs">
        <span className={'dot ' + (status === 'error' ? 'dot-err' : 'dot-idle')} />
        <div>
          <div className="oauth-row-title">
            {status === 'error' ? 'Sign-in failed' : 'Not signed in'}
          </div>
          <div className="oauth-row-sub">
            {status === 'error'
              ? 'The last sign-in attempt failed. Try again or check the URL.'
              : 'A browser window will open so you can authorize folk on the server.'}
          </div>
        </div>
      </div>
      <button
        className="btn btn-primary btn-sm"
        onClick={onSignIn}
        disabled={signingIn || !hasUrl}
        title={!hasUrl ? 'Set a server URL first' : undefined}
      >
        {signingIn ? <span className="spinner" /> : <Icon name="globe" size={12} />}
        {signingIn ? 'Opening browser…' : 'Sign in with OAuth'}
      </button>
    </div>
  )
}

// ── Tool permissions list ────────────────────────────────────────────────────

function ToolPermissionsList({
  server,
  tools,
  testing,
  onTest
}: {
  server: MCPServer
  tools: ToolInfo[] | null
  testing: boolean
  onTest: () => void
}) {
  if (tools === null) {
    if (server.toolCount != null && server.toolCount > 0) {
      return (
        <div className="mcp-tools-empty">
          <div>
            Last test detected <strong>{server.toolCount}</strong> tool{server.toolCount === 1 ? '' : 's'}.
            Click below to fetch the latest list.
          </div>
          <button className="btn btn-plain btn-sm" onClick={onTest} disabled={testing}>
            <Icon name="bolt" size={12} />
            {testing ? 'Connecting…' : 'Test connection'}
          </button>
        </div>
      )
    }
    return (
      <div className="mcp-tools-empty">
        <div>Test the connection to see the tools this server exposes.</div>
        <button className="btn btn-plain btn-sm" onClick={onTest} disabled={testing}>
          <Icon name="bolt" size={12} />
          {testing ? 'Connecting…' : 'Test connection'}
        </button>
      </div>
    )
  }
  if (tools.length === 0) {
    return <div className="mcp-tools-empty"><div>This server doesn't expose any tools.</div></div>
  }
  return (
    <div className="mcp-tools-list">
      {tools.map((t) => (
        <div key={t.name} className="mcp-tools-row">
          <div className="mcp-tools-row-body">
            <div className="mcp-tools-row-name mono">{t.name}</div>
            {t.description && <div className="mcp-tools-row-desc">{t.description}</div>}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Browse: collapsible Resources / Prompts ──────────────────────────────────

function BrowseSection({
  title,
  hint,
  children
}: {
  title: string
  hint: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <section className="mcp-card mcp-browse">
      <button
        type="button"
        className="mcp-browse-hd"
        onClick={() => setOpen((s) => !s)}
        aria-expanded={open}
      >
        <Icon name={open ? 'chevronDown' : 'chevronRight'} size={13} />
        <span className="mcp-browse-title">{title}</span>
        <span className="mcp-browse-hint">{hint}</span>
      </button>
      {open && <div className="mcp-card-bd">{children}</div>}
    </section>
  )
}

function ResourcesPane({ serverId }: { serverId: string }) {
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

function PromptsPane({ serverId }: { serverId: string }) {
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
