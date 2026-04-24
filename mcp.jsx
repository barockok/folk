// mcp.jsx — MCP Servers list, detail drawer, add/edit modal with form-first editor, test-connect
// Templates make it so a non-dev can add an MCP by picking from a catalog.

const MCP_TEMPLATES = [
  { id: 'filesystem', icon: 'FS', name: 'Filesystem', desc: 'Let Claude read and write files in folders you choose.', tag: 'Official' },
  { id: 'github',     icon: 'GH', name: 'GitHub',     desc: 'Issues, pull requests, repositories.',               tag: 'Official' },
  { id: 'postgres',   icon: 'PG', name: 'Postgres',   desc: 'Query a Postgres database, read-only or writable.',   tag: 'Official' },
  { id: 'slack',      icon: 'SL', name: 'Slack',      desc: 'Read channels and send messages.',                    tag: 'Remote' },
  { id: 'notion',     icon: 'NT', name: 'Notion',     desc: 'Pages, databases, search.',                           tag: 'Remote' },
  { id: 'custom',     icon: '+',  name: 'Something else', desc: 'Paste a command or URL from documentation.',      tag: 'Custom'  },
];

// Per-template parameters shown as friendly form fields (NO JSON).
const TEMPLATE_PARAMS = {
  filesystem: [
    { key: 'folders',    label: 'Folders to share',           kind: 'paths',  hint: 'Claude will only be able to read and write inside these folders.', default: ['~/Documents', '~/Projects'] },
    { key: 'write',      label: 'Allow writing files?',       kind: 'toggle', hint: 'If off, Claude can read but not modify files.', default: true },
  ],
  github: [
    { key: 'token',      label: 'GitHub personal access token', kind: 'secret', hint: 'Create one at github.com/settings/tokens — give it repo and read:org scopes.', placeholder: 'ghp_…' },
    { key: 'org',        label: 'Default organization',         kind: 'text',   hint: 'Optional. Searches will default to this org.', placeholder: 'acme-co' },
  ],
  postgres: [
    { key: 'host',       label: 'Host',                         kind: 'text',   placeholder: 'db.internal' , default: 'localhost' },
    { key: 'port',       label: 'Port',                         kind: 'number', default: 5432 },
    { key: 'database',   label: 'Database name',                kind: 'text',   placeholder: 'analytics' },
    { key: 'user',       label: 'User',                         kind: 'text',   placeholder: 'readonly' },
    { key: 'password',   label: 'Password',                     kind: 'secret', placeholder: '••••••••' },
    { key: 'readonly',   label: 'Read-only mode',               kind: 'toggle', hint: 'Safer for production. Claude can run SELECT queries only.', default: true },
  ],
  slack: [
    { key: 'token',      label: 'Slack bot user OAuth token',   kind: 'secret', placeholder: 'xoxb-…' , hint: 'From your Slack app settings.' },
  ],
  notion: [
    { key: 'token',      label: 'Notion integration secret',    kind: 'secret', placeholder: 'secret_…' },
  ],
  custom: [
    { key: 'transport',  label: 'How does it connect?',         kind: 'choice', options: ['Local command', 'Remote (HTTP)'], default: 'Local command' },
    { key: 'command',    label: 'Command',                      kind: 'text',   placeholder: 'npx', hint: 'The program to run.', showIf: (v) => v.transport === 'Local command' },
    { key: 'args',       label: 'Arguments',                    kind: 'chips',  hint: 'Added one at a time — press Enter after each.', showIf: (v) => v.transport === 'Local command', default: ['-y', '@your-org/your-mcp'] },
    { key: 'url',        label: 'Server URL',                   kind: 'text',   placeholder: 'https://…/mcp', showIf: (v) => v.transport === 'Remote (HTTP)' },
  ],
};

const PROBE_STEPS = [
  { key: 'spawn',   label: 'Starting the server',         ok: true,  detail: 'npx -y @modelcontextprotocol/server-filesystem' },
  { key: 'hand',    label: 'Shaking hands (MCP protocol)',ok: true,  detail: 'protocol 2024-11-05' },
  { key: 'list',    label: 'Asking what it can do',       ok: true,  detail: '8 tools, 0 prompts' },
  { key: 'sample',  label: 'Running a sample tool call',  ok: true,  detail: 'list_allowed_directories → 2 folders' },
];

function MCPPage({ mcps, setMcps, selected, setSelected, toast, openAddInitially, consumeAdd }) {
  const [query, setQuery] = React.useState('');
  const [scope, setScope] = React.useState('all');
  const [editing, setEditing] = React.useState(null); // { mode: 'add'|'edit', data }
  const [probe, setProbe] = React.useState(null);     // { serverId, step, success }
  const [ctxMenu, setCtxMenu] = React.useState(null); // { x, y, id }

  React.useEffect(() => {
    if (openAddInitially) { setEditing({ mode: 'add' }); consumeAdd(); }
  }, [openAddInitially, consumeAdd]);

  const filtered = mcps.filter(m => {
    if (scope !== 'all' && m.scope !== scope) return false;
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return m.name.toLowerCase().includes(q) || m.desc.toLowerCase().includes(q);
  });

  const testConnect = async (id) => {
    setProbe({ serverId: id, step: 0, success: null });
    for (let i = 0; i <= PROBE_STEPS.length; i++) {
      await new Promise(r => setTimeout(r, 550));
      setProbe({ serverId: id, step: i, success: null });
    }
    const mcp = mcps.find(m => m.id === id);
    const success = mcp?.status !== 'error';
    setProbe({ serverId: id, step: PROBE_STEPS.length, success });
    setTimeout(() => setProbe(null), 2400);
    toast(success ? 'Connected successfully' : 'Connection failed — see details', success ? 'ok' : 'err');
    if (success) setMcps(ms => ms.map(m => m.id === id ? { ...m, status: 'connected' } : m));
  };

  const toggleEnabled = (id) => setMcps(ms => ms.map(m => m.id === id ? { ...m, enabled: !m.enabled } : m));
  const remove = (id) => { setMcps(ms => ms.filter(m => m.id !== id)); if (selected === id) setSelected(null); toast('Server removed', 'ok'); };
  const duplicate = (id) => {
    const src = mcps.find(m => m.id === id); if (!src) return;
    const clone = { ...src, id: id + '-copy-' + Math.random().toString(36).slice(2, 6), name: src.name + ' (copy)' };
    setMcps(ms => [...ms, clone]); toast('Duplicated', 'ok');
  };

  const sel = mcps.find(m => m.id === selected);

  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <div className="eyebrow" style={{ marginBottom: 8 }}>Tools</div>
          <h1 className="h1">MCP Servers</h1>
          <div className="sub">Plug Claude into your tools. Pick from a catalog, paste a command, or build your own — no JSON required.</div>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing({ mode: 'add' })}>
          <Icon name="plus" size={14} /> Add server
        </button>
      </div>

      <div className="toolbar">
        <div className="search">
          <Icon name="search" size={14} className="search-ic" />
          <input className="input" placeholder="Search servers by name or what they do…"
            value={query} onChange={e => setQuery(e.target.value)} />
        </div>
        <div className="segmented" role="tablist">
          {[['all','All'],['user','Personal'],['project','This project']].map(([k,l]) => (
            <button key={k} className={scope===k?'on':''} onClick={() => setScope(k)}>{l}</button>
          ))}
        </div>
        <button className="btn btn-sm btn-plain"><Icon name="refresh" size={13} /> Refresh all</button>
      </div>

      <div className="list" style={{ ['--cols']: '1fr' }}>
        <div className="list-head" style={{ gridTemplateColumns: '1fr 140px 100px 120px 40px' }}>
          <div>Server</div><div>Kind</div><div>Tools</div><div>Status</div><div></div>
        </div>
        {filtered.length === 0 && (
          <div className="empty">
            <h3>No servers match</h3>
            <p>Try a different search, or browse the marketplace to discover one.</p>
            <button className="btn btn-primary" onClick={() => setEditing({ mode: 'add' })}>Add a server</button>
          </div>
        )}
        {filtered.map(m => (
          <div key={m.id}
            className={'list-row' + (selected === m.id ? ' selected' : '')}
            style={{ gridTemplateColumns: '1fr 140px 100px 120px 40px' }}
            onClick={() => setSelected(m.id === selected ? null : m.id)}
            onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, id: m.id }); }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
              <div className="row-ico">{m.icon}</div>
              <div style={{ minWidth: 0 }}>
                <div className="row-title">
                  <span className="trunc">{m.name}</span>
                  {!m.enabled && <span className="badge">Off</span>}
                </div>
                <div className="row-desc trunc">{m.desc}</div>
              </div>
            </div>
            <div style={{ fontSize: 13, color: 'var(--body)' }}>{m.kind}</div>
            <div className="tnum" style={{ fontSize: 13, color: 'var(--body)' }}>{m.tools}</div>
            <div>
              {m.status === 'connected' && <span className="badge badge-ok"><span className="dot dot-ok"></span> Connected</span>}
              {m.status === 'idle'      && <span className="badge"><span className="dot dot-idle"></span> Idle</span>}
              {m.status === 'error'     && <span className="badge badge-err"><span className="dot dot-err"></span> Error</span>}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
              <button className="btn btn-icon btn-sm btn-plain"
                onClick={(e) => { setCtxMenu({ x: e.clientX, y: e.clientY, id: m.id }); }}>
                <Icon name="more" size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {sel && (
        <div className="detail animate-in">
          <div className="section">
            <div className="section-head">
              <div className="grow">
                <h2 className="h2">{sel.name}</h2>
                <div style={{ fontSize: 13, color: 'var(--body)', marginTop: 4 }}>{sel.desc}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--body)' }}>{sel.enabled ? 'Enabled' : 'Disabled'}</span>
                <div className={'switch' + (sel.enabled ? ' on' : '')} onClick={() => toggleEnabled(sel.id)}></div>
              </div>
              <button className="btn btn-sm" onClick={() => testConnect(sel.id)}>
                <Icon name="bolt" size={13} /> Test connect
              </button>
              <button className="btn btn-sm" onClick={() => setEditing({ mode: 'edit', data: sel })}>
                <Icon name="edit" size={13} /> Edit
              </button>
            </div>

            {probe && probe.serverId === sel.id && (
              <div className="probe" style={{ marginBottom: 16 }}>
                {PROBE_STEPS.map((s, i) => {
                  const state = probe.step > i ? 'ok' : probe.step === i ? 'run' : 'pending';
                  const failing = probe.success === false && i === PROBE_STEPS.length - 1 && state !== 'pending';
                  return (
                    <div key={s.key} className={'probe-row' + (state === 'ok' ? ' ok' : '')}>
                      <span style={{ width: 18, display: 'inline-flex', justifyContent: 'center' }}>
                        {state === 'ok' && !failing && <Icon name="check" size={14} style={{ color: 'var(--ok)' }} />}
                        {failing && <Icon name="xCircle" size={14} style={{ color: 'var(--ruby)' }} />}
                        {state === 'run' && <span className="spinner"></span>}
                        {state === 'pending' && <span className="dot dot-idle"></span>}
                      </span>
                      <span>{s.label}</span>
                      <span className="status mono" style={{ color: failing ? 'var(--ruby)' : 'var(--fg-faint)' }}>
                        {state === 'ok' ? s.detail : state === 'run' ? 'running…' : ''}
                      </span>
                    </div>
                  );
                })}
                {probe.success === false && (
                  <div style={{ fontSize: 12.5, color: 'var(--ruby)', marginTop: 2, padding: '8px 2px 0', borderTop: '1px solid var(--border)' }}>
                    <Icon name="info" size={12} /> {sel.error || 'Unknown error'}
                  </div>
                )}
              </div>
            )}

            {sel.error && (!probe || probe.serverId !== sel.id) && (
              <div className="callout" style={{ marginBottom: 16, background: 'rgba(234,34,97,0.06)', borderColor: 'rgba(234,34,97,0.2)' }}>
                <Icon name="info" size={14} className="ico" style={{ color: 'var(--ruby)' }} />
                <div><strong style={{ color: 'var(--ruby)' }}>Last run failed:</strong> {sel.error}</div>
              </div>
            )}

            <dl className="kv">
              <dt>Transport</dt><dd>{sel.kind}</dd>
              {sel.command && <><dt>Command</dt><dd className="mono" style={{ fontSize: 12.5 }}>{sel.command} {sel.args?.join(' ')}</dd></>}
              {sel.url && <><dt>URL</dt><dd className="mono" style={{ fontSize: 12.5 }}>{sel.url}</dd></>}
              <dt>Scope</dt><dd>{sel.scope === 'user' ? 'Personal (all projects)' : 'This project only'}</dd>
              <dt>Tools exposed</dt><dd className="tnum">{sel.tools}</dd>
              <dt>Last activity</dt><dd style={{ color: 'var(--body)' }}>{sel.lastUsed}</dd>
              {sel.env?.length > 0 && (
                <>
                  <dt>Secrets</dt>
                  <dd>
                    {sel.env.map(e => (
                      <div key={e.key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span className="mono" style={{ fontSize: 12, color: 'var(--label)' }}>{e.key}</span>
                        <span className="mono" style={{ fontSize: 12, color: 'var(--body)' }}>{e.value}</span>
                        <Icon name="key" size={12} style={{ color: 'var(--fg-faint)' }} />
                      </div>
                    ))}
                  </dd>
                </>
              )}
            </dl>
          </div>
        </div>
      )}

      {editing && <MCPEditor editing={editing} onClose={() => setEditing(null)}
        onSave={(mcp) => {
          if (editing.mode === 'add') { setMcps(ms => [...ms, mcp]); toast('Server added', 'ok'); setSelected(mcp.id); }
          else { setMcps(ms => ms.map(m => m.id === mcp.id ? mcp : m)); toast('Saved', 'ok'); }
          setEditing(null);
        }} />}

      {ctxMenu && <ContextMenu x={ctxMenu.x} y={ctxMenu.y} onClose={() => setCtxMenu(null)}
        items={[
          { label: 'Test connect', kbd: '⌘T', icon: 'bolt', action: () => testConnect(ctxMenu.id) },
          { label: 'Edit', kbd: '⌘E', icon: 'edit', action: () => { const m = mcps.find(x=>x.id===ctxMenu.id); setEditing({ mode:'edit', data: m }); } },
          { label: 'Duplicate', kbd: '⌘D', icon: 'copy', action: () => duplicate(ctxMenu.id) },
          { label: 'Copy as shell command', icon: 'copy', action: () => { navigator.clipboard?.writeText('# example'); toast('Copied', 'ok'); } },
          { sep: true },
          { label: 'Remove', kbd: '⌘⌫', icon: 'trash', danger: true, action: () => remove(ctxMenu.id) },
        ]} />}
    </div>
  );
}

function ContextMenu({ x, y, items, onClose }) {
  React.useEffect(() => {
    const h = () => onClose();
    document.addEventListener('mousedown', h);
    document.addEventListener('scroll', h, true);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('scroll', h, true); };
  }, [onClose]);
  return (
    <div className="ctx-menu" style={{ left: Math.min(x, window.innerWidth - 220), top: Math.min(y, window.innerHeight - 260) }}
      onMouseDown={e => e.stopPropagation()}>
      {items.map((it, i) => it.sep ? <div key={i} className="ctx-sep" /> : (
        <div key={i} className={'ctx-item' + (it.danger ? ' danger' : '')}
          onClick={() => { it.action?.(); onClose(); }}>
          {it.icon && <Icon name={it.icon} size={13} />}
          <span>{it.label}</span>
          {it.kbd && <span className="trail">{it.kbd}</span>}
        </div>
      ))}
    </div>
  );
}

function MCPEditor({ editing, onClose, onSave }) {
  const isAdd = editing.mode === 'add';
  const initTemplate = isAdd ? null : guessTemplate(editing.data);
  const [template, setTemplate] = React.useState(initTemplate);
  const [name, setName] = React.useState(editing.data?.name || '');
  const [scope, setScope] = React.useState(editing.data?.scope || 'user');
  const [params, setParams] = React.useState(() => initFromData(editing.data, initTemplate));
  const [step, setStep] = React.useState(isAdd && !initTemplate ? 0 : 1);
  const [showAdvanced, setShowAdvanced] = React.useState(false);

  const selectTemplate = (tpl) => {
    setTemplate(tpl.id);
    setName(tpl.name);
    const defaults = {};
    TEMPLATE_PARAMS[tpl.id]?.forEach(p => { if (p.default !== undefined) defaults[p.key] = p.default; });
    setParams(defaults);
    setStep(1);
  };

  const tplParams = template ? TEMPLATE_PARAMS[template] : [];

  const handleSave = () => {
    const id = editing.data?.id || (template + '-' + Math.random().toString(36).slice(2, 6));
    const merged = buildMcpFromForm({ id, name, scope, template, params, base: editing.data });
    onSave(merged);
  };

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal modal-wide" onClick={e => e.stopPropagation()}>
        <div className="modal-hd">
          <div className="hero-accent" style={{ width: 40, height: 40, fontSize: 18, borderRadius: 6 }}>
            {template ? (MCP_TEMPLATES.find(t=>t.id===template)?.icon || '+') : '+'}
          </div>
          <div className="grow">
            <h2 className="h2">{isAdd ? (step === 0 ? 'Add a server' : `New ${MCP_TEMPLATES.find(t=>t.id===template)?.name} server`) : `Edit ${name}`}</h2>
            <div style={{ fontSize: 13, color: 'var(--body)', marginTop: 2 }}>
              {step === 0 ? 'Pick what you want Claude to be able to do.' : 'Fill in the details below — we\'ll handle the technical bits.'}
            </div>
          </div>
          <button className="btn btn-icon btn-plain" onClick={onClose}><Icon name="x" size={14} /></button>
        </div>

        <div className="modal-bd">
          {step === 0 && (
            <>
              <div className="label" style={{ marginBottom: 10 }}>Templates</div>
              <div className="tpl-grid">
                {MCP_TEMPLATES.map(t => (
                  <button key={t.id} className="tpl" onClick={() => selectTemplate(t)}>
                    <div className="tpl-hd">
                      <div className="tpl-ic">{t.icon}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="tpl-name trunc">{t.name}</div>
                        <div className="tpl-tag">{t.tag}</div>
                      </div>
                    </div>
                    <div className="tpl-desc">{t.desc}</div>
                  </button>
                ))}
              </div>
              <div className="drop-zone" style={{ marginTop: 14 }}>
                <Icon name="download" size={16} style={{ color: 'var(--stripe-purple)' }} />
                <span style={{ marginLeft: 8 }}>or drop a <span className="mono" style={{ fontSize: 12.5 }}>claude_desktop_config.json</span> here to import</span>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <div className="field">
                <label className="label">Name</label>
                <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Give it a friendly name" />
                <div className="hint">Shown in your list and in the command menu.</div>
              </div>

              {tplParams.map(p => (
                (!p.showIf || p.showIf(params)) && (
                  <FormField key={p.key} def={p} value={params[p.key]}
                    onChange={(v) => setParams(prev => ({ ...prev, [p.key]: v }))} />
                )
              ))}

              <div className="field">
                <label className="label">Where should this server live?</label>
                <div className="segmented" style={{ display: 'flex' }}>
                  <button className={scope==='user'?'on':''} onClick={() => setScope('user')}>Personal · all projects</button>
                  <button className={scope==='project'?'on':''} onClick={() => setScope('project')}>This project only</button>
                </div>
              </div>

              <div style={{ marginTop: 22, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                <button className="btn btn-plain btn-sm" onClick={() => setShowAdvanced(s => !s)}>
                  <Icon name={showAdvanced ? 'chevronDown' : 'chevronRight'} size={12} /> Advanced
                </button>
                {showAdvanced && (
                  <div style={{ marginTop: 12, background: 'var(--bg-sub)', padding: 14, borderRadius: 6, border: '1px solid var(--border)' }}>
                    <div className="label">Raw configuration</div>
                    <pre className="mono" style={{ margin: 0, fontSize: 12, color: 'var(--label)', background: '#0d253d', padding: 14, borderRadius: 4, color: '#e6edf5', overflowX: 'auto', lineHeight: 2 }}>
{JSON.stringify(previewJson({ name, template, params }), null, 2)}
                    </pre>
                    <div className="hint">Shown for reference. Editing details above will update this.</div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="modal-ft">
          {step === 1 && isAdd && <button className="btn btn-plain" onClick={() => setStep(0)}><Icon name="chevronLeft" size={13} /> Back</button>}
          <div className="grow"></div>
          <button className="btn" onClick={onClose}>Cancel</button>
          {step === 1 && (
            <button className="btn btn-primary" onClick={handleSave} disabled={!name.trim()}>
              <Icon name="check" size={13} /> {isAdd ? 'Add server' : 'Save changes'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function FormField({ def, value, onChange }) {
  const [chipDraft, setChipDraft] = React.useState('');
  const [reveal, setReveal] = React.useState(false);

  return (
    <div className="field">
      <label className="label">{def.label}</label>
      {def.kind === 'text' && (
        <input className="input" value={value ?? ''} placeholder={def.placeholder || ''}
          onChange={e => onChange(e.target.value)} />
      )}
      {def.kind === 'number' && (
        <input className="input tnum" type="number" value={value ?? ''} placeholder={def.placeholder || ''}
          onChange={e => onChange(Number(e.target.value))} />
      )}
      {def.kind === 'secret' && (
        <div style={{ position: 'relative' }}>
          <input className="input mono" type={reveal ? 'text' : 'password'} value={value ?? ''}
            placeholder={def.placeholder || 'Paste the secret here'} onChange={e => onChange(e.target.value)} style={{ paddingRight: 36 }} />
          <button className="btn btn-icon btn-sm btn-plain" style={{ position: 'absolute', right: 3, top: 3 }}
            onClick={() => setReveal(r => !r)}>
            <Icon name={reveal ? 'eyeOff' : 'eye'} size={13} />
          </button>
        </div>
      )}
      {def.kind === 'toggle' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className={'switch' + (value ? ' on' : '')} onClick={() => onChange(!value)}></div>
          <span style={{ fontSize: 13, color: 'var(--body)' }}>{value ? 'Yes' : 'No'}</span>
        </div>
      )}
      {def.kind === 'choice' && (
        <div className="segmented" style={{ display: 'flex' }}>
          {def.options.map(o => (
            <button key={o} className={value === o ? 'on' : ''} onClick={() => onChange(o)}>{o}</button>
          ))}
        </div>
      )}
      {(def.kind === 'paths' || def.kind === 'chips') && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
            {(value || []).map((v, i) => (
              <span key={i} className="badge" style={{ fontFamily: 'var(--ff-mono)', fontSize: 11.5, height: 22, padding: '2px 6px', background: 'var(--bg-sub)' }}>
                {v}
                <button className="btn btn-icon" style={{ height: 16, width: 16, border: 0, boxShadow: 'none', padding: 0, background: 'transparent', color: 'var(--fg-faint)' }}
                  onClick={() => onChange((value || []).filter((_, j) => j !== i))}>
                  <Icon name="x" size={11} />
                </button>
              </span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input className="input mono" value={chipDraft}
              placeholder={def.kind === 'paths' ? '~/path/to/folder' : 'add a value…'}
              onChange={e => setChipDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && chipDraft.trim()) { e.preventDefault(); onChange([...(value || []), chipDraft.trim()]); setChipDraft(''); }
              }} />
            <button className="btn btn-sm" onClick={() => { if (chipDraft.trim()) { onChange([...(value || []), chipDraft.trim()]); setChipDraft(''); } }}>
              <Icon name="plus" size={12} /> Add
            </button>
          </div>
        </>
      )}
      {def.hint && <div className="hint">{def.hint}</div>}
    </div>
  );
}

function guessTemplate(data) {
  if (!data) return 'custom';
  const joined = (data.args || []).join(' ');
  if (joined.includes('filesystem')) return 'filesystem';
  if (joined.includes('github')) return 'github';
  if (joined.includes('postgres')) return 'postgres';
  if ((data.url || '').includes('slack')) return 'slack';
  if ((data.url || '').includes('notion')) return 'notion';
  return 'custom';
}

function initFromData(data, tpl) {
  if (!data) return {};
  if (tpl === 'filesystem') {
    const folders = (data.args || []).filter(a => a.startsWith('~') || a.startsWith('/'));
    return { folders: folders.length ? folders : ['~/Documents'], write: true };
  }
  if (tpl === 'github') return { token: data.env?.[0]?.value || '', org: '' };
  if (tpl === 'postgres') return { host: 'db.internal', port: 5432, database: 'analytics', user: 'readonly', password: '••••', readonly: true };
  if (tpl === 'slack') return { token: data.env?.[0]?.value || '' };
  if (tpl === 'notion') return { token: '' };
  return { transport: data.transport === 'http' ? 'Remote (HTTP)' : 'Local command', command: data.command, args: data.args || [], url: data.url };
}

function buildMcpFromForm({ id, name, scope, template, params, base }) {
  const patch = { id, name, scope, enabled: true, status: 'idle', tools: 0, lastUsed: 'just now' };
  if (template === 'filesystem') {
    patch.kind = 'Local command'; patch.transport = 'stdio'; patch.command = 'npx';
    patch.args = ['-y', '@modelcontextprotocol/server-filesystem', ...(params.folders || [])];
    patch.env = [];
    patch.desc = (params.folders || []).slice(0,2).join(', ');
    patch.icon = 'FS';
  } else if (template === 'github') {
    patch.kind = 'Local command'; patch.transport = 'stdio'; patch.command = 'npx';
    patch.args = ['-y', '@modelcontextprotocol/server-github'];
    patch.env = params.token ? [{ key: 'GITHUB_TOKEN', value: maskSecret(params.token), secret: true }] : [];
    patch.desc = 'Issues, pull requests, repositories';
    patch.icon = 'GH';
  } else if (template === 'postgres') {
    patch.kind = 'Local command'; patch.transport = 'stdio'; patch.command = 'npx';
    patch.args = ['-y', '@modelcontextprotocol/server-postgres', `postgres://${params.user}:${maskSecret(params.password)}@${params.host}:${params.port}/${params.database}`];
    patch.env = []; patch.desc = `${params.database} on ${params.host}`; patch.icon = 'PG';
  } else if (template === 'slack') {
    patch.kind = 'Remote (HTTP)'; patch.transport = 'http'; patch.url = 'https://mcp.slack.com/v1';
    patch.env = [{ key: 'SLACK_BOT_TOKEN', value: maskSecret(params.token), secret: true }];
    patch.desc = 'Channels & messages'; patch.icon = 'SL';
  } else if (template === 'notion') {
    patch.kind = 'Remote (HTTP)'; patch.transport = 'http'; patch.url = 'https://mcp.notion.com/v1';
    patch.env = [{ key: 'NOTION_TOKEN', value: maskSecret(params.token), secret: true }];
    patch.desc = 'Pages & databases'; patch.icon = 'NT';
  } else {
    const isHttp = params.transport === 'Remote (HTTP)';
    patch.kind = isHttp ? 'Remote (HTTP)' : 'Local command';
    patch.transport = isHttp ? 'http' : 'stdio';
    if (isHttp) patch.url = params.url; else { patch.command = params.command; patch.args = params.args; }
    patch.env = []; patch.desc = isHttp ? (params.url || 'Custom remote') : (params.command || 'Custom command');
    patch.icon = (name || '?').slice(0,2).toUpperCase();
  }
  return { ...(base || {}), ...patch };
}

function maskSecret(s) {
  if (!s) return '';
  if (s.length < 8) return '••••';
  return s.slice(0, 4) + '••••' + s.slice(-4);
}

function previewJson({ name, template, params }) {
  const built = buildMcpFromForm({ id: 'preview', name, scope: 'user', template, params });
  const entry = {};
  if (built.transport === 'stdio') {
    entry.command = built.command; entry.args = built.args;
    if (built.env?.length) entry.env = Object.fromEntries(built.env.map(e => [e.key, e.value]));
  } else {
    entry.url = built.url;
    if (built.env?.length) entry.headers = Object.fromEntries(built.env.map(e => [e.key, e.value]));
  }
  return { mcpServers: { [name || 'new-server']: entry } };
}

Object.assign(window, { MCPPage });
