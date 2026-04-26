import { useMemo, useState } from 'react'
import { Icon } from './icons'
import { useSessionStore } from '../stores/useSessionStore'
import { useUIStore } from '../stores/useUIStore'
import type { MCPElicitationRequest } from '@shared/types'

type FieldValue = string | number | boolean | string[]

interface SchemaField {
  key: string
  type: 'string' | 'number' | 'boolean' | 'enum' | 'array'
  title: string
  description?: string
  required: boolean
  enumOptions?: string[]
  default?: FieldValue
  format?: string
}

function parseSchema(schema: Record<string, unknown> | undefined): SchemaField[] {
  if (!schema) return []
  const props = schema.properties as Record<string, Record<string, unknown>> | undefined
  if (!props) return []
  const required = new Set((schema.required as string[] | undefined) ?? [])
  const out: SchemaField[] = []
  for (const [key, prop] of Object.entries(props)) {
    const rawType = prop.type as string | undefined
    const enumVals = prop.enum as string[] | undefined
    let type: SchemaField['type'] = 'string'
    if (enumVals) type = 'enum'
    else if (rawType === 'number' || rawType === 'integer') type = 'number'
    else if (rawType === 'boolean') type = 'boolean'
    else if (rawType === 'array') type = 'array'
    out.push({
      key,
      type,
      title: (prop.title as string) ?? key,
      description: prop.description as string | undefined,
      required: required.has(key),
      enumOptions: enumVals,
      default: prop.default as FieldValue | undefined,
      format: prop.format as string | undefined
    })
  }
  return out
}

function FormBody({
  fields,
  values,
  setValues
}: {
  fields: SchemaField[]
  values: Record<string, FieldValue>
  setValues: (next: Record<string, FieldValue>) => void
}) {
  const setField = (key: string, value: FieldValue) => setValues({ ...values, [key]: value })
  return (
    <>
      {fields.map((f) => (
        <div key={f.key} className="field" style={{ marginTop: 12 }}>
          <label className="label">
            {f.title}
            {f.required && <span style={{ color: 'var(--err)' }}> *</span>}
          </label>
          {f.type === 'string' && (
            <input
              className="input"
              type={f.format === 'password' ? 'password' : 'text'}
              value={(values[f.key] as string) ?? ''}
              onChange={(e) => setField(f.key, e.target.value)}
            />
          )}
          {f.type === 'number' && (
            <input
              className="input"
              type="number"
              value={(values[f.key] as number | undefined) ?? ''}
              onChange={(e) => setField(f.key, Number(e.target.value))}
            />
          )}
          {f.type === 'boolean' && (
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={(values[f.key] as boolean) ?? false}
                onChange={(e) => setField(f.key, e.target.checked)}
              />
              <span className="sub" style={{ fontSize: 13 }}>Enabled</span>
            </label>
          )}
          {f.type === 'enum' && (
            <select
              className="input"
              value={(values[f.key] as string) ?? ''}
              onChange={(e) => setField(f.key, e.target.value)}
            >
              <option value="" disabled>
                Choose…
              </option>
              {f.enumOptions?.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          )}
          {f.type === 'array' && (
            <input
              className="input mono"
              placeholder="comma-separated values"
              value={Array.isArray(values[f.key]) ? (values[f.key] as string[]).join(', ') : ''}
              onChange={(e) =>
                setField(
                  f.key,
                  e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean)
                )
              }
            />
          )}
          {f.description && <div className="hint">{f.description}</div>}
        </div>
      ))}
    </>
  )
}

function ElicitationCard({ req }: { req: MCPElicitationRequest }) {
  const remove = useSessionStore((s) => s.removeElicitationRequest)
  const toast = useUIStore((s) => s.toast)
  const fields = useMemo(() => parseSchema(req.requestedSchema), [req.requestedSchema])
  const [values, setValues] = useState<Record<string, FieldValue>>(() => {
    const init: Record<string, FieldValue> = {}
    for (const f of fields) if (f.default !== undefined) init[f.key] = f.default
    return init
  })
  const [busy, setBusy] = useState(false)

  const close = (action: 'decline' | 'cancel') => {
    void window.folk.agent.respondElicitation({ requestId: req.requestId, action })
    remove(req.sessionId, req.requestId)
  }

  const submitForm = async () => {
    for (const f of fields) {
      if (f.required && (values[f.key] === undefined || values[f.key] === '')) {
        toast({ kind: 'err', text: `${f.title} is required` })
        return
      }
    }
    setBusy(true)
    await window.folk.agent.respondElicitation({
      requestId: req.requestId,
      action: 'accept',
      content: values as Record<string, string | number | boolean | string[]>
    })
    setBusy(false)
    remove(req.sessionId, req.requestId)
  }

  const submitUrl = async () => {
    if (req.url) window.open(req.url, '_blank', 'noopener,noreferrer')
    setBusy(true)
    await window.folk.agent.respondElicitation({ requestId: req.requestId, action: 'accept' })
    setBusy(false)
    remove(req.sessionId, req.requestId)
  }

  const heading = req.title ?? `${req.serverName} requests input`

  return (
    <div className="modal-scrim" onClick={() => close('cancel')}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd">
          <div className="grow">
            <div className="eyebrow">MCP · {req.serverName}</div>
            <h2 className="h2" style={{ marginTop: 4 }}>{heading}</h2>
          </div>
          <button className="btn btn-icon btn-plain" onClick={() => close('cancel')}>
            <Icon name="x" size={14} />
          </button>
        </div>
        <div className="modal-bd">
          <div className="sub" style={{ marginBottom: 8 }}>{req.message}</div>
          {req.description && (
            <div className="hint" style={{ marginBottom: 12 }}>{req.description}</div>
          )}
          {req.mode === 'url' ? (
            <div className="src-warning" style={{ marginTop: 8 }}>
              <Icon name="external" size={13} />
              <div>
                <b>Browser-based authentication.</b> Click Continue to open the auth URL in your
                browser. After completing the flow there, return here.
                {req.url && (
                  <div className="mono" style={{ marginTop: 6, fontSize: 12, wordBreak: 'break-all' }}>
                    {req.url}
                  </div>
                )}
              </div>
            </div>
          ) : fields.length === 0 ? (
            <div className="sub">No structured fields requested.</div>
          ) : (
            <FormBody fields={fields} values={values} setValues={setValues} />
          )}
        </div>
        <div className="modal-ft">
          <button className="btn btn-plain" onClick={() => close('decline')} disabled={busy}>
            Decline
          </button>
          {req.mode === 'url' ? (
            <button className="btn btn-primary" onClick={() => void submitUrl()} disabled={busy}>
              {busy ? <span className="spinner" /> : <><Icon name="external" size={12} /> Continue</>}
            </button>
          ) : (
            <button className="btn btn-primary" onClick={() => void submitForm()} disabled={busy}>
              {busy ? <span className="spinner" /> : 'Submit'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export function MCPElicitationModal() {
  const elicitations = useSessionStore((s) => s.pendingElicitations)
  const flat = useMemo(() => Object.values(elicitations).flat(), [elicitations])
  if (flat.length === 0) return null
  // Show the oldest pending elicitation across all sessions; the others stay
  // queued and surface one-by-one as the user resolves them.
  return <ElicitationCard req={flat[0]} />
}
