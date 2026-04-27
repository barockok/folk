// Mode-driven MCP form. Two paths:
//   • Local program (stdio) — Run this command + secret values
//   • Online service (http) — URL + API key + custom headers
// Replaces the old template-driven flow.

import { useEffect, useMemo, useState } from 'react'
import type { MCPServer } from '@shared/types'
import { Icon } from '../../components/icons'

export type ConnectMode = 'stdio' | 'http'

interface KVRow {
  key: string
  value: string
}

export interface FormValues {
  name: string
  mode: ConnectMode
  // stdio
  commandLine: string
  envRows: KVRow[]
  // http
  url: string
  apiKey: string
  headerRows: KVRow[]
  oauthClientId: string
  oauthClientSecret: string
}

const AUTH_HEADER = 'Authorization'
const TOKEN_PREFIX = 'Bearer '

// Best-effort split of a single command line into command + args. Quotes are
// preserved so users can paste `node "/path with spaces/script.js"` and have
// it round-trip. We don't try to be a full shell parser.
export function splitCommandLine(line: string): { command: string; args: string[] } {
  const tokens: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  for (const ch of line) {
    if (quote) {
      if (ch === quote) quote = null
      else current += ch
    } else if (ch === '"' || ch === "'") {
      quote = ch
    } else if (ch === ' ' || ch === '\t') {
      if (current) {
        tokens.push(current)
        current = ''
      }
    } else {
      current += ch
    }
  }
  if (current) tokens.push(current)
  if (tokens.length === 0) return { command: '', args: [] }
  return { command: tokens[0], args: tokens.slice(1) }
}

export function joinCommandLine(command: string | null, args: string[] | null): string {
  const parts: string[] = []
  if (command) parts.push(command.includes(' ') ? `"${command}"` : command)
  for (const a of args ?? []) parts.push(/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a)
  return parts.join(' ')
}

function rowsFrom(record: Record<string, string> | null | undefined): KVRow[] {
  if (!record) return []
  return Object.entries(record).map(([key, value]) => ({ key, value }))
}

function recordFromRows(rows: KVRow[]): Record<string, string> | null {
  const out: Record<string, string> = {}
  for (const r of rows) {
    if (!r.key.trim()) continue
    out[r.key] = r.value
  }
  return Object.keys(out).length > 0 ? out : null
}

export function valuesFromServer(server: MCPServer | null): FormValues {
  if (!server) {
    return {
      name: '',
      mode: 'stdio',
      commandLine: '',
      envRows: [],
      url: '',
      apiKey: '',
      headerRows: [],
      oauthClientId: '',
      oauthClientSecret: ''
    }
  }
  const headerRows = rowsFrom(server.headers)
  const authIndex = headerRows.findIndex((r) => r.key.toLowerCase() === AUTH_HEADER.toLowerCase())
  let apiKey = ''
  if (authIndex >= 0) {
    const v = headerRows[authIndex].value
    apiKey = v.startsWith(TOKEN_PREFIX) ? v.slice(TOKEN_PREFIX.length) : v
    headerRows.splice(authIndex, 1)
  }
  return {
    name: server.name ?? '',
    mode: server.transport === 'http' ? 'http' : 'stdio',
    commandLine: joinCommandLine(server.command, server.args),
    envRows: rowsFrom(server.env),
    url: server.url ?? '',
    apiKey,
    headerRows,
    oauthClientId: server.oauthClientId ?? '',
    oauthClientSecret: server.oauthClientSecret ?? ''
  }
}

export function serverFromValues(base: MCPServer | null, v: FormValues): MCPServer {
  const id = base?.id ?? crypto.randomUUID()
  const createdAt = base?.createdAt ?? Date.now()
  if (v.mode === 'http') {
    const headerRows = [...v.headerRows]
    if (v.apiKey.trim()) {
      headerRows.unshift({ key: AUTH_HEADER, value: TOKEN_PREFIX + v.apiKey.trim() })
    }
    return {
      id,
      name: v.name.trim() || 'Untitled server',
      template: null,
      transport: 'http',
      command: null,
      args: null,
      env: null,
      url: v.url.trim() || null,
      headers: recordFromRows(headerRows),
      // OAuth credentials in the form take precedence over baseline; an empty
      // string clears the field so the next sign-in does Dynamic Client
      // Registration again.
      oauthClientId: v.oauthClientId.trim() || base?.oauthClientId || null,
      oauthClientSecret: v.oauthClientSecret.trim() || base?.oauthClientSecret || null,
      oauthMetadata: base?.oauthMetadata ?? null,
      oauthStatus: base?.oauthStatus ?? null,
      isEnabled: base?.isEnabled ?? true,
      status: base?.status ?? 'stopped',
      lastError: null,
      toolCount: base?.toolCount ?? null,
      createdAt
    }
  }
  const { command, args } = splitCommandLine(v.commandLine.trim())
  return {
    id,
    name: v.name.trim() || 'Untitled server',
    template: null,
    transport: 'stdio',
    command: command || null,
    args: args.length > 0 ? args : null,
    env: recordFromRows(v.envRows),
    url: null,
    headers: null,
    oauthClientId: null,
    oauthClientSecret: null,
    oauthMetadata: null,
    oauthStatus: null,
    isEnabled: base?.isEnabled ?? true,
    status: base?.status ?? 'stopped',
    lastError: null,
    toolCount: base?.toolCount ?? null,
    createdAt
  }
}

// ── Mode picker ──────────────────────────────────────────────────────────────

export function ModePicker({ onPick }: { onPick: (m: ConnectMode) => void }) {
  return (
    <div className="mcp-mode-grid">
      <button className="mcp-mode-card" onClick={() => onPick('stdio')} type="button">
        <span className="mcp-mode-ic mcp-mode-ic-local">
          <Icon name="puzzle" size={20} />
        </span>
        <div className="mcp-mode-title">Local program</div>
        <div className="mcp-mode-desc">
          A program on your computer that Claude can call. Runs only when needed.
        </div>
        <div className="mcp-mode-eg">
          <span className="mcp-mode-eg-lbl">Example</span>
          <code>npx -y @modelcontextprotocol/server-postgres …</code>
        </div>
      </button>
      <button className="mcp-mode-card" onClick={() => onPick('http')} type="button">
        <span className="mcp-mode-ic mcp-mode-ic-online">
          <Icon name="globe" size={20} />
        </span>
        <div className="mcp-mode-title">Online service</div>
        <div className="mcp-mode-desc">
          A URL Claude reaches over the internet. Often needs an API key.
        </div>
        <div className="mcp-mode-eg">
          <span className="mcp-mode-eg-lbl">Example</span>
          <code>https://mcp.example.com/v1</code>
        </div>
      </button>
    </div>
  )
}

// ── Form fields ──────────────────────────────────────────────────────────────

interface MCPFormProps {
  values: FormValues
  onChange: (next: FormValues) => void
  readOnly?: boolean
  // When the server has a saved API key, the parent can ask the form to
  // surface a "re-authorize" affordance. We expose a focus-key-trigger via ref
  // mechanics through the form's internal state — simpler: parent passes
  // `focusKey` which, when changed, focuses + clears the field.
  focusApiKey?: number
}

export function MCPForm({ values, onChange, readOnly, focusApiKey }: MCPFormProps) {
  const set = <K extends keyof FormValues>(key: K, v: FormValues[K]): void => {
    onChange({ ...values, [key]: v })
  }

  const isHttp = values.mode === 'http'

  return (
    <div className="mcp-form">
      <Field label="Display name" hint="Shown in your list and in the command menu.">
        <input
          className="input"
          value={values.name}
          placeholder={isHttp ? 'My API service' : 'My local helper'}
          onChange={(e) => set('name', e.target.value)}
          disabled={readOnly}
        />
      </Field>

      {isHttp ? (
        <>
          <Field label="Remote MCP server URL" hint="The full URL of the MCP server.">
            <input
              className="input mono"
              value={values.url}
              placeholder="https://mcp.example.com/v1"
              onChange={(e) => set('url', e.target.value)}
              disabled={readOnly}
            />
          </Field>

          <Collapsible
            label="Advanced settings"
            hint="API keys, OAuth, custom headers"
            defaultOpen={
              values.apiKey.length > 0 ||
              values.oauthClientId.length > 0 ||
              values.headerRows.length > 0
            }
          >
            <SecretField
              label="API key"
              hint="Static bearer token, sent as Authorization header. Skip this if the server uses OAuth."
              value={values.apiKey}
              onChange={(v) => set('apiKey', v)}
              placeholder="Paste your API key or token"
              disabled={readOnly}
              focusSignal={focusApiKey}
            />

            <Field
              label="OAuth Client ID (optional)"
              hint="Leave empty to let folk register itself with the server when you sign in."
            >
              <input
                className="input mono"
                value={values.oauthClientId}
                placeholder="e.g. lin_app_…"
                onChange={(e) => set('oauthClientId', e.target.value)}
                disabled={readOnly}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
            </Field>

            <SecretField
              label="OAuth Client Secret (optional)"
              hint="Only required for confidential OAuth clients."
              value={values.oauthClientSecret}
              onChange={(v) => set('oauthClientSecret', v)}
              placeholder="Paste your OAuth client secret"
              disabled={readOnly}
            />

            <div className="field">
              <label className="label">Custom headers</label>
              <KVList
                rows={values.headerRows}
                onChange={(rows) => set('headerRows', rows)}
                keyPlaceholder="Header name"
                valuePlaceholder="Header value"
                addLabel="Add header"
                disabled={readOnly}
              />
              <div className="hint">Only if the service requires extra headers.</div>
            </div>
          </Collapsible>
        </>
      ) : (
        <>
          <Field
            label="Run this command"
            hint="What folk should execute when Claude needs the tool. Paste the full command line."
          >
            <input
              className="input mono"
              value={values.commandLine}
              placeholder='npx -y @some/server "/path/to/data"'
              onChange={(e) => set('commandLine', e.target.value)}
              disabled={readOnly}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </Field>

          <Collapsible
            label="Secret values"
            hint="API keys, tokens, passwords. Passed to the program as environment variables."
            defaultOpen={values.envRows.length > 0}
          >
            <KVList
              rows={values.envRows}
              onChange={(rows) => set('envRows', rows)}
              keyPlaceholder="MY_API_KEY"
              valuePlaceholder="value"
              addLabel="Add value"
              maskValues
              disabled={readOnly}
            />
          </Collapsible>
        </>
      )}
    </div>
  )
}

// ── Field building blocks ────────────────────────────────────────────────────

function Field({
  label,
  hint,
  children
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="field">
      <label className="label">{label}</label>
      {children}
      {hint && <div className="hint">{hint}</div>}
    </div>
  )
}

function SecretField({
  label,
  hint,
  value,
  onChange,
  placeholder,
  disabled,
  focusSignal
}: {
  label: string
  hint?: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  disabled?: boolean
  focusSignal?: number
}) {
  const [reveal, setReveal] = useState(false)
  const inputRef = useMemo(() => ({ current: null as HTMLInputElement | null }), [])

  useEffect(() => {
    if (focusSignal && focusSignal > 0) {
      const el = inputRef.current
      if (el) {
        el.focus()
        el.select()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusSignal])

  return (
    <div className="field">
      <label className="label">{label}</label>
      <div style={{ position: 'relative' }}>
        <input
          ref={(el) => {
            inputRef.current = el
          }}
          className="input mono"
          type={reveal ? 'text' : 'password'}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          style={{ paddingRight: 36 }}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
        <button
          type="button"
          className="btn btn-icon btn-sm btn-plain"
          style={{ position: 'absolute', right: 3, top: 3 }}
          onClick={() => setReveal((r) => !r)}
          tabIndex={-1}
          disabled={disabled}
          aria-label={reveal ? 'Hide value' : 'Reveal value'}
        >
          <Icon name={reveal ? 'eyeOff' : 'eye'} size={13} />
        </button>
      </div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  )
}

function Collapsible({
  label,
  hint,
  defaultOpen,
  children
}: {
  label: string
  hint?: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(!!defaultOpen)
  return (
    <div className="mcp-collapse">
      <button
        type="button"
        className="mcp-collapse-hd"
        onClick={() => setOpen((s) => !s)}
        aria-expanded={open}
      >
        <Icon name={open ? 'chevronDown' : 'chevronRight'} size={12} />
        <span>{label}</span>
        {hint && <span className="mcp-collapse-hint">{hint}</span>}
      </button>
      {open && <div className="mcp-collapse-bd">{children}</div>}
    </div>
  )
}

function KVList({
  rows,
  onChange,
  keyPlaceholder,
  valuePlaceholder,
  addLabel,
  maskValues,
  disabled
}: {
  rows: KVRow[]
  onChange: (rows: KVRow[]) => void
  keyPlaceholder: string
  valuePlaceholder: string
  addLabel: string
  maskValues?: boolean
  disabled?: boolean
}) {
  const update = (i: number, patch: Partial<KVRow>) => {
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }
  const add = () => onChange([...rows, { key: '', value: '' }])
  const remove = (i: number) => onChange(rows.filter((_, idx) => idx !== i))

  return (
    <div className="kv-list">
      {rows.map((row, i) => (
        <div className="kv-row" key={i}>
          <input
            className="input mono"
            placeholder={keyPlaceholder}
            value={row.key}
            onChange={(e) => update(i, { key: e.target.value })}
            disabled={disabled}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <input
            className="input mono"
            type={maskValues ? 'password' : 'text'}
            placeholder={valuePlaceholder}
            value={row.value}
            onChange={(e) => update(i, { value: e.target.value })}
            disabled={disabled}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <button
            type="button"
            className="btn btn-icon btn-sm btn-plain"
            onClick={() => remove(i)}
            disabled={disabled}
            aria-label="Remove"
          >
            <Icon name="x" size={12} />
          </button>
        </div>
      ))}
      {!disabled && (
        <button type="button" className="kv-add" onClick={add}>
          <Icon name="plus" size={12} />
          {addLabel}
        </button>
      )}
    </div>
  )
}
