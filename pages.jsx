// pages.jsx — Skills, Plugins, Sessions, Marketplace, Keybindings, Model & API

function SkillsPage({ skills, setSkills, toast }) {
  const [query, setQuery] = React.useState('');
  const [dragId, setDragId] = React.useState(null);
  const [overId, setOverId] = React.useState(null);

  const filtered = skills.filter(s => !query.trim() || s.name.toLowerCase().includes(query.toLowerCase()) || s.desc.toLowerCase().includes(query.toLowerCase()));

  const onDrop = (toId) => {
    if (!dragId || dragId === toId) return;
    setSkills(prev => {
      const copy = [...prev];
      const fromIdx = copy.findIndex(s => s.id === dragId);
      const toIdx = copy.findIndex(s => s.id === toId);
      const [m] = copy.splice(fromIdx, 1);
      copy.splice(toIdx, 0, m);
      return copy;
    });
    setDragId(null); setOverId(null);
    toast('Reordered', 'ok');
  };

  const toggle = (id) => setSkills(prev => prev.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s));

  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <div className="eyebrow" style={{ marginBottom: 8 }}>Agent</div>
          <h1 className="h1">Skills</h1>
          <div className="sub">Named behaviors Claude will follow when a trigger matches. Drag to reorder — the first match wins.</div>
        </div>
        <button className="btn btn-primary"><Icon name="plus" size={14} /> New skill</button>
      </div>

      <div className="toolbar">
        <div className="search">
          <Icon name="search" size={14} className="search-ic" />
          <input className="input" placeholder="Search skills" value={query} onChange={e => setQuery(e.target.value)} />
        </div>
        <div className="segmented">
          <button className="on">All</button>
          <button>Yours</button>
          <button>Installed</button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.map(s => (
          <div key={s.id}
            className={'skill-row' + (dragId === s.id ? ' dragging' : '') + (overId === s.id && dragId !== s.id ? ' drop-target' : '')}
            draggable onDragStart={() => setDragId(s.id)}
            onDragOver={(e) => { e.preventDefault(); setOverId(s.id); }}
            onDragLeave={() => setOverId(null)}
            onDrop={() => onDrop(s.id)}
            onDragEnd={() => { setDragId(null); setOverId(null); }}>
            <div className="skill-handle"><Icon name="drag" size={14} /></div>
            <div className="skill-body">
              <div className="skill-title">
                {s.name}
                {s.author === 'you' && <span className="badge badge-ac">Yours</span>}
                {s.author === 'anthropic' && <span className="badge badge-magenta">Anthropic</span>}
                {s.author === 'community' && <span className="badge">Community</span>}
              </div>
              <div className="skill-desc">{s.desc}</div>
              <div style={{ marginTop: 6, fontSize: 12, color: 'var(--fg-faint)', fontFamily: 'var(--ff-mono)' }}>
                <Icon name="zap" size={11} /> triggers on: {s.trigger}
              </div>
            </div>
            <div className={'switch' + (s.enabled ? ' on' : '')} onClick={() => toggle(s.id)}></div>
            <button className="btn btn-icon btn-sm btn-plain"><Icon name="more" size={14} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

function PluginsPage({ plugins, setPlugins, toast }) {
  const toggle = (id) => setPlugins(prev => prev.map(p => p.id === id ? { ...p, status: p.status === 'enabled' ? 'disabled' : 'enabled' } : p));
  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <div className="eyebrow" style={{ marginBottom: 8 }}>Extensions</div>
          <h1 className="h1">Plugins</h1>
          <div className="sub">Longer-running integrations that run alongside Claude. Manage versions, toggle on/off, and grant permissions.</div>
        </div>
        <button className="btn"><Icon name="download" size={13} /> Install from file</button>
        <button className="btn btn-primary"><Icon name="store" size={13} /> Browse marketplace</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {plugins.map(p => (
          <div key={p.id} className="plugin-row">
            <div className="plugin-ic">{p.name.slice(0,2).toUpperCase()}</div>
            <div>
              <div className="plugin-name">
                {p.name}
                {p.status === 'update' && <span className="badge badge-warn">Update available</span>}
              </div>
              <div className="plugin-desc">{p.desc}</div>
              <div style={{ marginTop: 4 }}>
                <span className="plugin-meta">v{p.ver} · by {p.author}</span>
              </div>
            </div>
            <div className={'switch' + (p.status === 'enabled' ? ' on' : '')} onClick={() => toggle(p.id)}></div>
            <button className="btn btn-icon btn-sm btn-plain"><Icon name="more" size={14} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

// Tool-call helper: { k:'tool', server, name, status:'done'|'running'|'failed', duration, steps?:[{label,state}], body? }
const SESSION_SEED = [
  { id: 'rename', name: 'rename-usr.ts', preview: 'Rename usr → user across repo', status: 'active', when: 'now', group: 'Today',
    history: [
      { k: 'user', text: 'help me rename the variable `usr` to `user` across the repo and open a PR' },
      { k: 'assist', blocks: [
        { t: 'p', text: "I'll find every occurrence, run the rename, verify tests pass, and open a PR. Starting now." },
      ]},
      { k: 'tool', server: 'Filesystem', name: 'search_files', status: 'done', duration: '0.9s',
        steps: [
          { label: 'Scanning src/ and tests/', state: 'ok' },
          { label: 'Matching pattern \\busr\\b', state: 'ok' },
          { label: '47 matches across 12 files', state: 'ok' },
        ]},
      { k: 'tool', server: 'Filesystem', name: 'batch_edit', status: 'done', duration: '1.4s',
        steps: [
          { label: 'Applying renames in 12 files', state: 'ok' },
          { label: 'Preserving comments & docstrings', state: 'ok' },
          { label: '✓ 12 files updated', state: 'ok' },
        ]},
      { k: 'tool', server: 'Bash', name: 'npm test', status: 'done', duration: '12.4s',
        body: '$ npm test\n\n  ✓ auth routes (34 tests)\n  ✓ user store (58 tests)\n  ✓ api/users (42 tests)\n  ...\n\n✓ 248 passing · 0 failing' },
      { k: 'tool', server: 'GitHub', name: 'create_pr', status: 'done', duration: '0.6s',
        steps: [
          { label: 'Pushed branch rename/usr-to-user', state: 'ok' },
          { label: 'Opened PR #1284', state: 'ok' },
        ]},
      { k: 'assist', blocks: [
        { t: 'p', text: "All done. Here's the summary — tests are green and the PR is up." },
        { t: 'h3', text: 'Changes' },
        { t: 'table', cols: ['File', 'Changes', 'Type'], align: [null, 'num', null], rows: [
          ['src/auth.ts', '14', 'rename'],
          ['src/api/users.ts', '9', 'rename'],
          ['src/store/session.ts', '7', 'rename'],
          ['tests/auth.test.ts', '11', 'rename'],
          ['8 more files', '6', '—'],
        ]},
        { t: 'link', href: 'https://github.com/acme/web/pull/1284', title: '#1284 — Rename usr → user across codebase', url: 'github.com/acme/web/pull/1284' },
        { t: 'p', text: 'Anything else you want wired in — changelog entry, reviewers, or a backport?' },
      ]},
    ]},
  { id: 'release', name: 'draft-release-notes', preview: 'Summarize v2.3 commits', status: 'idle', when: '2h ago', group: 'Today',
    history: [
      { k: 'user', text: 'draft release notes for v2.3 from the last 40 commits' },
      { k: 'tool', server: 'Git', name: 'log', status: 'done', duration: '0.3s',
        body: '$ git log v2.2..HEAD --oneline\n\n→ 40 commits · 14 authors · 6 days' },
      { k: 'assist', blocks: [
        { t: 'h2', text: 'Release v2.3 — Draft' },
        { t: 'p', text: "This release focuses on **performance** and **payments reliability**. Below is a first pass — tell me what to cut or expand." },
        { t: 'h3', text: '✨ Features' },
        { t: 'ul', items: [
          'Saved views in the dashboard — pin your most-used filters',
          'Bulk refund tool for disputed charges',
          'New `--watch` flag on the CLI for live log streaming',
        ]},
        { t: 'h3', text: '🐛 Fixes' },
        { t: 'ul', items: [
          'Timezone drift when exporting CSV reports',
          'Flicker on the onboarding carousel in Safari',
          'Race condition in the webhook retry queue',
        ]},
        { t: 'h3', text: 'Internal' },
        { t: 'p', text: 'Upgraded our Node runtime to 22, shaved ~18% off cold-start time. See the linked PR for the full migration notes.' },
        { t: 'link', href: 'https://github.com/acme/web/pull/1279', title: 'Upgrade Node 20 → 22', url: 'github.com/acme/web/pull/1279' },
      ]},
    ]},
  { id: 'invoices', name: 'october-invoices', preview: 'Send month-end invoices', status: 'idle', when: 'yesterday', group: 'Yesterday',
    history: [
      { k: 'user', text: 'send october invoices to all active customers using the template' },
      { k: 'tool', server: 'Stripe', name: 'list_customers', status: 'done', duration: '0.5s',
        body: 'filter: active=true\n→ 34 customers' },
      { k: 'tool', server: 'Gmail', name: 'send_batch', status: 'done', duration: '4.1s',
        steps: [
          { label: 'Rendered invoice template × 34', state: 'ok' },
          { label: 'Queued 34 emails', state: 'ok' },
          { label: '✓ All delivered', state: 'ok' },
        ]},
      { k: 'assist', blocks: [
        { t: 'p', text: "All **34 invoices** went out. Here's the summary:" },
        { t: 'table', cols: ['Segment', 'Sent', 'Total'], align: [null, 'num', 'num'], rows: [
          ['Enterprise', '6', '$48,200'],
          ['Growth', '14', '$21,450'],
          ['Starter', '14', '$4,340'],
          ['Total', '34', '$73,990'],
        ]},
        { t: 'p', text: "I logged the batch in your Notion workspace under *October Ops*." },
      ]},
    ]},
  { id: 'trip', name: 'tokyo-itinerary', preview: '5-day Tokyo trip plan', status: 'idle', when: '3d ago', group: 'This week',
    history: [
      { k: 'user', text: 'plan a 5-day tokyo trip, mid-range budget, likes design and ramen' },
      { k: 'assist', blocks: [
        { t: 'h2', text: 'Tokyo — 5 days' },
        { t: 'p', text: "Here's a neighborhood-by-neighborhood pass. I kept it design-leaning with a ramen anchor each day." },
        { t: 'img', alt: 'Tokyo neighborhoods map', caption: 'Shibuya → Nakameguro → Shimokitazawa → Yanaka → Ginza' },
        { t: 'table', cols: ['Day', 'Area', 'Highlight', 'Ramen'], rows: [
          ['Mon', 'Shibuya · Harajuku', 'PARCO, Design Museum Gifts', 'Afuri (yuzu shio)'],
          ['Tue', 'Nakameguro', 'Meguro river walk, COW BOOKS', 'Mensho Tokyo'],
          ['Wed', 'Shimokitazawa', 'Vintage lanes, Reload complex', 'Ramen Nagi Niboshi'],
          ['Thu', 'Yanaka · Nezu', 'Old-town backstreets, SCAI', 'Kagari (tori paitan)'],
          ['Fri', 'Ginza', 'Itoya, Ginza Six basement food hall', 'Tsuta (once Michelin)'],
        ]},
      ]},
    ]},
  { id: 'audit', name: 'security-audit-api', preview: 'Review auth routes', status: 'idle', when: 'Apr 18', group: 'Earlier',
    history: [
      { k: 'user', text: 'audit /api/auth routes for common security mistakes' },
      { k: 'tool', server: 'Filesystem', name: 'read', status: 'done', duration: '0.2s',
        body: 'read src/api/auth.ts (412 lines)' },
      { k: 'assist', blocks: [
        { t: 'p', text: "Flagged **3 issues** — one high-severity. Details below." },
        { t: 'h3', text: 'Findings' },
        { t: 'ul', items: [
          '**High** — bcrypt rounds set to 6; should be ≥ 12 (src/api/auth.ts:84)',
          '**Medium** — login endpoint has no rate limiter (src/api/auth.ts:132)',
          '**Low** — error messages leak whether email is registered (src/api/auth.ts:201)',
        ]},
        { t: 'p', text: "Want me to open PRs for any of these? The high-severity one is a 2-line change." },
      ]},
    ]},
];

function SessionsPage({ toast, model, setModel, mcps, configuredProviders }) {
  const [sessions, setSessions] = React.useState(SESSION_SEED);
  const [activeId, setActiveId] = React.useState(SESSION_SEED[0].id);
  const [query, setQuery] = React.useState('');
  const [input, setInput] = React.useState('');
  const [modelPickOpen, setModelPickOpen] = React.useState(false);
  const [attachments, setAttachments] = React.useState([]);
  const [dragging, setDragging] = React.useState(false);
  const dragCounter = React.useRef(0);
  const fileInputRef = React.useRef();
  const bodyRef = React.useRef();

  const fileKind = (file) => {
    const name = (file.name || '').toLowerCase();
    const type = file.type || '';
    if (type.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp|heic|avif)$/.test(name)) return 'image';
    if (type.startsWith('video/') || /\.(mp4|mov|webm|mkv|avi)$/.test(name)) return 'video';
    if (type.startsWith('audio/') || /\.(mp3|wav|flac|m4a|ogg)$/.test(name)) return 'audio';
    if (/\.(pdf)$/.test(name)) return 'pdf';
    if (/\.(zip|tar|gz|bz2|7z|rar)$/.test(name)) return 'archive';
    if (/\.(md|markdown|txt|rst|log)$/.test(name)) return 'doc';
    if (/\.(js|jsx|ts|tsx|py|rb|go|rs|java|c|cpp|h|hpp|css|scss|html|vue|svelte|json|yaml|yml|toml|sh|bash|zsh|swift|kt)$/.test(name)) return 'code';
    return 'file';
  };

  const fmtSize = (b) => {
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return (b / 1024).toFixed(b < 10 * 1024 ? 1 : 0) + ' KB';
    if (b < 1024 * 1024 * 1024) return (b / 1024 / 1024).toFixed(b < 10 * 1024 * 1024 ? 1 : 0) + ' MB';
    return (b / 1024 / 1024 / 1024).toFixed(1) + ' GB';
  };

  const addFiles = (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const next = files.map(f => {
      const kind = fileKind(f);
      const id = 'att-' + Math.random().toString(36).slice(2, 8);
      const att = { id, name: f.name, size: f.size, kind, file: f, preview: null };
      if (kind === 'image') {
        try { att.preview = URL.createObjectURL(f); } catch {}
      }
      return att;
    });
    setAttachments(a => [...a, ...next]);
    toast(files.length === 1 ? `Attached ${files[0].name}` : `Attached ${files.length} files`, 'ok');
  };

  const removeAttachment = (id) => {
    setAttachments(a => {
      const gone = a.find(x => x.id === id);
      if (gone?.preview) { try { URL.revokeObjectURL(gone.preview); } catch {} }
      return a.filter(x => x.id !== id);
    });
  };

  const active = sessions.find(s => s.id === activeId) || sessions[0];

  React.useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [active?.history]);

  const filtered = sessions.filter(s =>
    !query.trim() || s.name.toLowerCase().includes(query.toLowerCase()) || s.preview.toLowerCase().includes(query.toLowerCase())
  );
  const groups = {};
  filtered.forEach(s => { (groups[s.group] = groups[s.group] || []).push(s); });

  const send = () => {
    if (!input.trim() && !attachments.length) return;
    const q = input;
    const atts = attachments.map(a => ({ id: a.id, name: a.name, size: a.size, kind: a.kind, preview: a.preview }));
    setSessions(all => all.map(s => s.id === activeId
      ? { ...s, history: [...s.history, { k: 'user', text: q, attachments: atts }] } : s));
    setInput('');
    setAttachments([]);
    setTimeout(() => {
      const ackBits = [];
      if (q.trim()) ackBits.push(`"${q.slice(0, 60)}${q.length > 60 ? '…' : ''}"`);
      if (atts.length) ackBits.push(`${atts.length} attachment${atts.length === 1 ? '' : 's'}`);
      setSessions(all => all.map(s => s.id === activeId
        ? { ...s, history: [...s.history, { k: 'assist', blocks: [{ t: 'p', text: `On it — looking at ${ackBits.join(' + ')}.` }] }] } : s));
    }, 600);
  };

  const startBrainstorm = () => {
    const wizId = 'wiz-' + Math.random().toString(36).slice(2, 6);
    const wizard = {
      k: 'wizard',
      id: wizId,
      title: 'Let\'s shape this together',
      sub: 'A few quick questions so I can point the work in the right direction. You can skip any of them.',
      questions: [
        { id: 'what', kind: 'text', label: 'What are we making?',
          placeholder: 'e.g. a landing page, an internal tool, a pitch deck…' },
        { id: 'who', kind: 'single', label: 'Who\'s the audience?',
          options: ['Technical / engineers', 'Product & design', 'Business / execs', 'End users / public', 'Mixed'] },
        { id: 'vibe', kind: 'multi', label: 'What should it feel like?',
          hint: 'Pick as many as fit.',
          options: ['Polished & professional', 'Playful', 'Minimal', 'Dense & data-rich', 'Editorial', 'Bold & opinionated'] },
        { id: 'scope', kind: 'slider', label: 'How ambitious?',
          hint: 'A rough nudge — 1 is a quick sketch, 10 is swing for the fences.',
          min: 1, max: 10, default: 5, step: 1 },
        { id: 'extra', kind: 'textarea', label: 'Anything else I should know?',
          placeholder: 'Constraints, references, existing code, favorite examples…', optional: true },
      ],
    };
    setSessions(all => all.map(s => s.id === activeId
      ? { ...s, history: [...s.history, wizard] } : s));
  };

  const handleWizardSubmit = (wizId, answers) => {
    // mark the wizard turn submitted
    setSessions(all => all.map(s => s.id === activeId
      ? { ...s, history: s.history.map(h => h.id === wizId ? { ...h, submitted: true, answers } : h) }
      : s));

    if (answers === null) {
      // skipped
      setTimeout(() => {
        setSessions(all => all.map(s => s.id === activeId
          ? { ...s, history: [...s.history, { k: 'assist', blocks: [{ t: 'p', text: 'No worries — I\'ll take a first pass and we can iterate.' }] }] }
          : s));
      }, 400);
      return;
    }

    // build a user-visible summary of what they answered
    setTimeout(() => {
      setSessions(all => all.map(s => s.id === activeId
        ? { ...s, history: [...s.history, {
            k: 'assist',
            blocks: [
              { t: 'p', text: 'Got it — locked in. Here\'s what I\'m running with:' },
              { t: 'ul', items: [
                answers.what ? `**Making** — ${answers.what}` : null,
                answers.who ? `**Audience** — ${answers.who}` : null,
                (answers.vibe && answers.vibe.length) ? `**Vibe** — ${answers.vibe.join(', ')}` : null,
                answers.scope ? `**Ambition** — ${answers.scope}/10` : null,
                answers.extra ? `**Also** — ${answers.extra}` : null,
              ].filter(Boolean) },
              { t: 'p', text: 'Starting now. I\'ll check in when I have a first draft to look at.' },
            ],
          }] }
        : s));
    }, 500);
  };

  const newSession = () => {
    const id = 'new-' + Math.random().toString(36).slice(2, 6);
    const fresh = { id, name: 'untitled', preview: 'New session', status: 'active', when: 'now', group: 'Today',
      needsSetup: true, history: [] };
    setSessions(s => [fresh, ...s]);
    setActiveId(id);
  };

  const completeSetup = ({ folder, goal, model: pickedModel, yolo, rawFlags }) => {
    if (pickedModel) setModel(pickedModel);
    const folderName = folder.split('/').filter(Boolean).pop() || folder;
    const goalGreeting = {
      general: "Ready when you are — what should we talk about?",
      code: `Working in \`${folder}\`. What should we change first?`,
      research: `Working in \`${folder}\`. What are we looking into?`,
      brainstorm: `Working in \`${folder}\`. Want me to ask a few setup questions first, or just start sketching?`,
    }[goal] || "Ready when you are.";
    const greetingBlocks = [{ t: 'p', text: goalGreeting }];
    if (yolo) greetingBlocks.unshift({ t: 'p', text: "⚠︎ Started with `--dangerously-skip-permissions` — I won't prompt before file writes or shell commands. Say the word and I'll stop." });
    setSessions(all => all.map(s => s.id === activeId
      ? { ...s, needsSetup: false, name: folderName, preview: folder, folder, yolo: !!yolo, rawFlags: rawFlags || '',
          history: [{ k: 'assist', blocks: greetingBlocks }] }
      : s));
    toast(yolo ? `Session started in ${folderName} — permissions skipped` : `Session started in ${folderName}`, 'ok');
  };

  const cancelSetup = () => {
    setSessions(all => all.filter(s => s.id !== activeId));
    const remaining = sessions.filter(s => s.id !== activeId);
    if (remaining.length) setActiveId(remaining[0].id);
  };

  return (
    <div className="sess-wrap">
      <aside className="sess-rail">
        <div className="sess-rail-hd">
          <h3>Sessions</h3>
          <button className="btn btn-sm btn-primary" onClick={newSession}><Icon name="plus" size={12} /> New</button>
        </div>
        <div className="sess-search">
          <div className="search">
            <Icon name="search" size={13} className="search-ic" />
            <input className="input" style={{ height: 30 }} placeholder="Search history"
              value={query} onChange={e => setQuery(e.target.value)} />
          </div>
        </div>
        <div className="sess-list scroll">
          {Object.entries(groups).map(([g, arr]) => (
            <div key={g}>
              <div className="sess-group">{g}</div>
              {arr.map(s => (
                <div key={s.id} className={'sess-item' + (s.id === activeId ? ' on' : '')}
                  onClick={() => setActiveId(s.id)}>
                  <div className="sess-top">
                    <span className={'dot ' + (s.status === 'active' ? 'dot-ok' : 'dot-idle')}></span>
                    <span className="sess-name">{s.name}</span>
                    <span className="sess-time">{s.when}</span>
                  </div>
                  <div className="sess-preview">{s.preview}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </aside>

      <section className="sess-main">
        <div className="sess-bar">
          <div>
            <div className="title">
              <span className={'dot ' + (active.status === 'active' ? 'dot-ok' : 'dot-idle')}></span>
              {active.name}
              {active.yolo && (
                <span className="ss-adv-pill warn" style={{ marginLeft: 8, fontSize: 10 }} title="This session was started with --dangerously-skip-permissions">
                  skip-permissions
                </span>
              )}
            </div>
            <div className="sub">{model} · {mcps.filter(m => m.enabled && m.status === 'connected').length} tools ready{active.folder ? ` · ${active.folder}` : ''}</div>
          </div>
          <div style={{ flex: 1 }}></div>
          <button className="btn btn-sm btn-plain"><Icon name="refresh" size={12} /> Resume</button>
          <button className="btn btn-sm btn-plain"><Icon name="external" size={12} /> Share</button>
          <button className="btn btn-sm btn-plain"><Icon name="more" size={14} /></button>
        </div>

        <div className="sess-body-wrap">
          {active.needsSetup ? (
            <SessionSetup
              model={model}
              setModel={setModel}
              configuredProviders={configuredProviders}
              onStart={completeSetup}
              onCancel={cancelSetup}
            />
          ) : (
            <>
              <div className="conv" ref={bodyRef}>
                <div className="conv-inner">
                  {active.history.map((h, i) => <TurnBlock key={i} turn={h} currentModel={model} onWizardSubmit={handleWizardSubmit} />)}
                </div>
              </div>

              <div className={'composer' + (dragging ? ' is-dragging' : '')}
                onDragEnter={(e) => {
                  if (e.dataTransfer?.types?.includes('Files')) {
                    e.preventDefault(); e.stopPropagation();
                    dragCounter.current += 1;
                    setDragging(true);
                  }
                }}
                onDragOver={(e) => {
                  if (e.dataTransfer?.types?.includes('Files')) {
                    e.preventDefault(); e.stopPropagation();
                    e.dataTransfer.dropEffect = 'copy';
                  }
                }}
                onDragLeave={(e) => {
                  e.preventDefault(); e.stopPropagation();
                  dragCounter.current = Math.max(0, dragCounter.current - 1);
                  if (dragCounter.current === 0) setDragging(false);
                }}
                onDrop={(e) => {
                  e.preventDefault(); e.stopPropagation();
                  dragCounter.current = 0;
                  setDragging(false);
                  if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
                }}
              >
                <div className="composer-inner">
                  {attachments.length > 0 && (
                    <div className="composer-atts">
                      {attachments.map(a => <AttachChip key={a.id} att={a} onRemove={() => removeAttachment(a.id)} fmtSize={fmtSize} />)}
                    </div>
                  )}
                  <textarea value={input} onChange={e => setInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                    onPaste={(e) => {
                      const items = e.clipboardData?.items;
                      if (!items) return;
                      const pasted = [];
                      for (const item of items) {
                        if (item.kind === 'file') {
                          const f = item.getAsFile();
                          if (f) pasted.push(f);
                        }
                      }
                      if (pasted.length) { e.preventDefault(); addFiles(pasted); }
                    }}
                    placeholder={dragging ? 'Drop files to attach…' : 'Describe what you want — plain English is fine. Drag files in, or paste screenshots.'} rows={2} />
                  <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }}
                    onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
                  <div className="composer-row">
                    <div className="composer-attach" style={{ position: 'relative' }}>
                      <button className="btn btn-icon btn-sm btn-plain" title="Attach files"
                        onClick={() => fileInputRef.current?.click()}>
                        <Icon name="plus" size={13} />
                      </button>
                      <button className="btn btn-sm btn-plain" title="Model" onClick={() => setModelPickOpen(o => !o)}>
                        <Icon name="sparkle" size={12} /> {model} <Icon name="chevronDown" size={11} />
                      </button>
                      {modelPickOpen && (
                        <ModelPickerPop
                          configured={configuredProviders}
                          current={model}
                          onPick={(m) => { setModel(m); setModelPickOpen(false); toast(`Using ${m}`, 'ok'); }}
                          onClose={() => setModelPickOpen(false)}
                        />
                      )}
                      <button className="btn btn-sm btn-plain" title="Tools"><Icon name="wrench" size={12} /> {mcps.filter(m => m.enabled && m.status === 'connected').length}</button>
                      <span style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 4px' }}></span>
                      <button className="btn btn-sm btn-plain" title="Brainstorm — walk me through questions before starting"
                        onClick={startBrainstorm}>
                        <Icon name="wand" size={12} /> Brainstorm
                      </button>
                    </div>
                    <span className="hint"><span className="kbd">↵</span> to send · <span className="kbd">⇧↵</span> newline</span>
                    <button className="btn btn-sm composer-send" onClick={send} disabled={!input.trim() && !attachments.length}>
                      <Icon name="send" size={12} /> Send
                    </button>
                  </div>
                </div>

                {dragging && (
                  <div className="composer-drop">
                    <div className="composer-drop-inner">
                      <Icon name="download" size={22} />
                      <div className="composer-drop-title">Drop to attach</div>
                      <div className="composer-drop-sub">Images, PDFs, code, anything folk can read.</div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function AttachChip({ att, onRemove, fmtSize, compact }) {
  const kindIcon = {
    image: 'image', video: 'image', audio: 'audio',
    pdf: 'book', archive: 'layers', doc: 'book', code: 'terminal', file: 'download',
  }[att.kind] || 'download';

  return (
    <div className={'attach-chip' + (compact ? ' compact' : '')} title={att.name}>
      {att.preview ? (
        <div className="attach-chip-img" style={{ backgroundImage: `url(${att.preview})` }} />
      ) : (
        <div className="attach-chip-ic"><Icon name={kindIcon} size={14} /></div>
      )}
      <div className="attach-chip-meta">
        <div className="attach-chip-name trunc">{att.name}</div>
        <div className="attach-chip-sub">
          <span className="attach-chip-kind">{att.kind}</span>
          {att.size != null && <span>· {fmtSize(att.size)}</span>}
        </div>
      </div>
      {onRemove && (
        <button className="attach-chip-x" onClick={onRemove} title="Remove">
          <Icon name="x" size={11} />
        </button>
      )}
    </div>
  );
}

function TurnBlock({ turn, currentModel, onWizardSubmit }) {
  if (turn.k === 'user') {
    return (
      <div className="msg">
        <div className="msg-avatar user">You</div>
        <div className="msg-content">
          <div className="msg-name">You</div>
          {turn.attachments && turn.attachments.length > 0 && (
            <div className="msg-atts">
              {turn.attachments.map(a => {
                const fmtSize = (b) => b < 1024 ? b+' B' : b < 1048576 ? (b/1024).toFixed(b<10240?1:0)+' KB' : (b/1048576).toFixed(b<10485760?1:0)+' MB';
                return <AttachChip key={a.id} att={a} fmtSize={fmtSize} compact />;
              })}
            </div>
          )}
          {turn.text && <div className="md"><p>{turn.text}</p></div>}
        </div>
      </div>
    );
  }
  if (turn.k === 'wizard') {
    return (
      <div className="msg">
        <div className="msg-avatar assist">✦</div>
        <div className="msg-content">
          <div className="msg-name">folk <span className="when">· {currentModel || 'sonnet-4.5'}</span></div>
          <WizardCard turn={turn} onSubmit={onWizardSubmit} />
        </div>
      </div>
    );
  }
  if (turn.k === 'assist') {
    return (
      <div className="msg">
        <div className="msg-avatar assist">✦</div>
        <div className="msg-content">
          <div className="msg-name">folk <span className="when">· {turn.model || currentModel || 'sonnet-4.5'}</span></div>
          <div className="md">
            {(turn.blocks || []).map((b, i) => <MDBlock key={i} b={b} />)}
          </div>
        </div>
      </div>
    );
  }
  // tool
  return (
    <div className="msg">
      <div className="msg-avatar assist" style={{ background: 'var(--bg-sub)', color: 'var(--stripe-purple)', border: '1px solid var(--border)' }}>
        <Icon name="wrench" size={13} />
      </div>
      <div className="msg-content">
        <ToolCard tool={turn} />
      </div>
    </div>
  );
}

function WizardCard({ turn, onSubmit }) {
  const [answers, setAnswers] = React.useState(() => {
    const a = {};
    (turn.questions || []).forEach(q => {
      if (q.kind === 'multi') a[q.id] = [];
      else if (q.kind === 'single') a[q.id] = q.default || '';
      else a[q.id] = '';
    });
    return a;
  });
  const [done, setDone] = React.useState(!!turn.submitted);

  const setA = (id, v) => setAnswers(p => ({ ...p, [id]: v }));
  const toggle = (id, v) => setAnswers(p => {
    const arr = p[id] || [];
    return { ...p, [id]: arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v] };
  });

  const allAnswered = (turn.questions || []).every(q => {
    const v = answers[q.id];
    if (q.optional) return true;
    if (q.kind === 'multi') return v && v.length > 0;
    return v && String(v).trim().length > 0;
  });

  const submit = () => {
    setDone(true);
    onSubmit && onSubmit(turn.id, answers);
  };

  return (
    <div className="wiz">
      <div className="wiz-hd">
        <div className="wiz-hd-icon"><Icon name="sparkles" size={13} /></div>
        <div style={{ flex: 1 }}>
          <div className="wiz-title">{turn.title}</div>
          {turn.sub && <div className="wiz-sub">{turn.sub}</div>}
        </div>
        {done && <span className="badge badge-ac"><Icon name="check" size={10} /> Submitted</span>}
      </div>

      <div className="wiz-body">
        {(turn.questions || []).map(q => (
          <div key={q.id} className="wiz-q">
            <div className="wiz-q-label">
              <span>{q.label}</span>
              {q.optional && <span className="wiz-q-opt">optional</span>}
            </div>
            {q.hint && <div className="wiz-q-hint">{q.hint}</div>}

            {q.kind === 'single' && (
              <div className="wiz-opts">
                {q.options.map(opt => (
                  <button key={opt} type="button"
                    disabled={done}
                    className={'wiz-opt' + (answers[q.id] === opt ? ' on' : '')}
                    onClick={() => setA(q.id, opt)}>
                    <span className="wiz-opt-radio"></span>
                    <span>{opt}</span>
                  </button>
                ))}
              </div>
            )}

            {q.kind === 'multi' && (
              <div className="wiz-opts">
                {q.options.map(opt => (
                  <button key={opt} type="button"
                    disabled={done}
                    className={'wiz-opt wiz-opt-check' + ((answers[q.id] || []).includes(opt) ? ' on' : '')}
                    onClick={() => toggle(q.id, opt)}>
                    <span className="wiz-opt-check-box">
                      {(answers[q.id] || []).includes(opt) && <Icon name="check" size={10} />}
                    </span>
                    <span>{opt}</span>
                  </button>
                ))}
              </div>
            )}

            {q.kind === 'text' && (
              <input className="input" disabled={done}
                placeholder={q.placeholder || ''}
                value={answers[q.id] || ''}
                onChange={e => setA(q.id, e.target.value)} />
            )}

            {q.kind === 'textarea' && (
              <textarea className="input" disabled={done}
                rows={3}
                placeholder={q.placeholder || ''}
                value={answers[q.id] || ''}
                onChange={e => setA(q.id, e.target.value)}
                style={{ resize: 'vertical', fontFamily: 'inherit', padding: 10 }} />
            )}

            {q.kind === 'slider' && (
              <div className="wiz-slider">
                <input type="range" disabled={done}
                  min={q.min || 0} max={q.max || 100} step={q.step || 1}
                  value={answers[q.id] || q.default || q.min || 0}
                  onChange={e => setA(q.id, e.target.value)} />
                <span className="wiz-slider-val tnum">{answers[q.id] || q.default || q.min || 0}{q.suffix || ''}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="wiz-foot">
        <span className="hint" style={{ fontSize: 12, color: 'var(--fg-faint)' }}>
          {done ? 'Thanks — using your answers.' : 'Your answers help tailor the output.'}
        </span>
        <span style={{ flex: 1 }}></span>
        {!done && <button className="btn btn-sm btn-plain" onClick={() => onSubmit && onSubmit(turn.id, null)}>Skip</button>}
        <button className="btn btn-sm composer-send" onClick={submit}
          disabled={done || !allAnswered}>
          <Icon name="check" size={12} /> {done ? 'Submitted' : 'Continue'}
        </button>
      </div>
    </div>
  );
}

function MDBlock({ b }) {
  if (b.t === 'p') return <p dangerouslySetInnerHTML={{ __html: renderInline(b.text) }} />;
  if (b.t === 'h2') return <h2>{b.text}</h2>;
  if (b.t === 'h3') return <h3>{b.text}</h3>;
  if (b.t === 'ul') return <ul>{b.items.map((it, i) => <li key={i} dangerouslySetInnerHTML={{ __html: renderInline(it) }} />)}</ul>;
  if (b.t === 'ol') return <ol>{b.items.map((it, i) => <li key={i} dangerouslySetInnerHTML={{ __html: renderInline(it) }} />)}</ol>;
  if (b.t === 'code') return <pre><code>{b.text}</code></pre>;
  if (b.t === 'quote') return <blockquote>{b.text}</blockquote>;
  if (b.t === 'table') return (
    <table>
      <thead><tr>{b.cols.map((c, i) => <th key={i}>{c}</th>)}</tr></thead>
      <tbody>{b.rows.map((r, i) => (
        <tr key={i}>{r.map((cell, j) => {
          const cls = b.align && b.align[j] === 'num' ? 'num' : '';
          return <td key={j} className={cls} dangerouslySetInnerHTML={{ __html: renderInline(String(cell)) }} />;
        })}</tr>
      ))}</tbody>
    </table>
  );
  if (b.t === 'img') return (
    <>
      <div className="md-img" style={{ aspectRatio: b.ratio || '16/9', display: 'grid', placeItems: 'center', color: 'var(--fg-faint)', fontSize: 12 }}>
        <div style={{ textAlign: 'center' }}>
          <Icon name="image" size={24} />
          <div style={{ marginTop: 6, fontFamily: 'var(--ff-mono)' }}>{b.alt}</div>
        </div>
      </div>
      {b.caption && <div className="md-img-caption">{b.caption}</div>}
    </>
  );
  if (b.t === 'link') return (
    <a className="md-link-card" href={b.href} target="_blank" rel="noreferrer">
      <div className="favicon"><Icon name="external" size={14} /></div>
      <div className="lc-body">
        <div className="lc-title">{b.title}</div>
        <div className="lc-url">{b.url}</div>
      </div>
    </a>
  );
  return null;
}

// Minimal inline renderer: **bold**, *italic*, `code`
function renderInline(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

function ToolCard({ tool }) {
  const [open, setOpen] = React.useState(tool.status === 'running' || tool.status === 'failed');
  const cls = 'tool-card ' + (tool.status || 'done');
  const statusEl =
    tool.status === 'running' ? <><span className="spinner"></span><span>running…</span></> :
    tool.status === 'failed' ? <><span className="dot dot-err"></span><span>failed</span></> :
    <><span className="dot dot-ok"></span><span>{tool.duration || 'done'}</span></>;

  return (
    <div className={cls} data-open={open ? 'true' : 'false'}>
      <div className="tool-hd" onClick={() => setOpen(!open)}>
        <div className="tool-ic"><Icon name="wrench" size={12} /></div>
        <span className="tool-srv">{tool.server}</span>
        <span className="tool-name">{tool.name}</span>
        <div className="tool-status">{statusEl}</div>
        <Icon name="chevronRight" size={12} className="tool-caret" />
      </div>
      {open && tool.steps && (
        <div className="tool-steps">
          {tool.steps.map((s, i) => (
            <div key={i} className={'tool-step ' + (s.state || 'ok')}>
              <span className="ic">{s.state === 'run' ? <span className="spinner"></span> : s.state === 'err' ? '✗' : '✓'}</span>
              <span>{s.label}</span>
            </div>
          ))}
        </div>
      )}
      {open && tool.body && <div className="tool-body">{tool.body}</div>}
    </div>
  );
}

function _SessionsLegacyEnd() { return null; }

function ModelPickerPop({ configured, current, onPick, onClose }) {
  const ref = React.useRef();
  React.useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);

  return (
    <div className="model-pop" ref={ref}>
      <div className="model-pop-hd">
        <Icon name="sparkle" size={11} /> Switch model
      </div>
      <div className="model-pop-list">
        {configured.map(prov => {
          const def = PROVIDERS.find(p => p.id === prov.id);
          if (!def) return null;
          const models = def.defaultModels.filter(m => prov.enabledModels.includes(m.id));
          if (models.length === 0) return null;
          return (
            <div key={prov.id}>
              <div className="model-pop-group">
                <span className={'prov-logo ' + def.logoClass}>{def.logoText}</span>
                <span>{def.name}</span>
              </div>
              {models.map(m => (
                <div key={m.id}
                  className={'model-pop-item' + (current === m.id ? ' on' : '')}
                  onClick={() => onPick(m.id)}>
                  <div className="m-main">
                    <div className="m-disp">{m.display}</div>
                    <div className="m-id">{m.id} · {m.ctx}</div>
                  </div>
                  {current === m.id && <Icon name="check" size={14} />}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MarketplacePage({ toast }) {
  const [installing, setInstalling] = React.useState({});
  const [kind, setKind] = React.useState('all'); // all | mcp | skill | plugin
  const [cat, setCat] = React.useState('All');
  const [q, setQ] = React.useState('');
  const [addOpen, setAddOpen] = React.useState(false);

  const install = (id, name) => {
    setInstalling(p => ({ ...p, [id]: 'loading' }));
    setTimeout(() => {
      setInstalling(p => ({ ...p, [id]: 'done' }));
      toast(`${name} installed`, 'ok');
    }, 900);
  };

  const matchKind = (it) => kind === 'all' || it.kind === kind;
  const matchCat = (it) => cat === 'All' || (it.cats || []).includes(cat);
  const matchQ = (it) => !q.trim() || (it.name + ' ' + it.desc + ' ' + it.author).toLowerCase().includes(q.toLowerCase());
  const filtered = MARKET_ITEMS.filter(it => matchKind(it) && matchCat(it) && matchQ(it));
  const featured = filtered.filter(it => it.featured);
  const rest = filtered.filter(it => !it.featured);

  const kindLabel = { mcp: 'MCP server', skill: 'Skill', plugin: 'Plugin' };
  const kindIcon = { mcp: 'server', skill: 'sparkles', plugin: 'puzzle' };

  const MkCard = ({ it, featured }) => (
    <div className={'mk-card' + (featured ? ' mk-card-hero' : '')}>
      <div className="mk-card-hd">
        <div className={'mk-ic mk-ic-' + it.kind}>{it.icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="mk-name trunc">{it.name}</div>
          <div className="mk-author trunc">
            <span className="mk-kind-pill">
              <Icon name={kindIcon[it.kind]} size={10} />
              {kindLabel[it.kind]}
            </span>
            <span className="mk-dot">·</span>
            {it.author}
          </div>
        </div>
        {it.tag === 'Verified' && <span className="badge badge-ac" title="Official — published by the company itself">Official</span>}
        {it.tag === 'Popular' && <span className="badge badge-magenta">{it.tag}</span>}
        {it.tag === 'Trending' && <span className="badge badge-warn">{it.tag}</span>}
      </div>
      <div className="mk-desc">{it.desc}</div>
      <div className="mk-meta">
        <span className="tnum"><Icon name="download" size={11} /> {it.downloads}</span>
        <span className="tnum">★ {it.rating}</span>
        <span className="grow"></span>
        {installing[it.id] === 'loading' ? (
          <button className="btn btn-sm" disabled><span className="spinner"></span> Installing</button>
        ) : installing[it.id] === 'done' ? (
          <button className="btn btn-sm" style={{ color: 'var(--ok-text)' }}><Icon name="check" size={12} /> Installed</button>
        ) : (
          <button className="btn btn-sm btn-primary" onClick={() => install(it.id, it.name)}>Install</button>
        )}
      </div>
    </div>
  );

  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <div className="eyebrow" style={{ marginBottom: 8 }}>Discover</div>
          <h1 className="h1">Marketplace</h1>
          <div className="sub">A community-curated list of skills, plugins, and MCP servers. folk doesn't endorse or review these — check the source before installing.</div>
        </div>
        <button className="btn btn-primary" onClick={() => setAddOpen(true)}><Icon name="plus" size={13} /> Add from source</button>
      </div>

      <div className="mk-kind-tabs">
        {[
          { id: 'all', label: 'All', icon: 'store', count: MARKET_ITEMS.length },
          { id: 'mcp', label: 'MCP servers', icon: 'server', count: MARKET_ITEMS.filter(i => i.kind === 'mcp').length },
          { id: 'skill', label: 'Skills', icon: 'sparkles', count: MARKET_ITEMS.filter(i => i.kind === 'skill').length },
          { id: 'plugin', label: 'Plugins', icon: 'puzzle', count: MARKET_ITEMS.filter(i => i.kind === 'plugin').length },
        ].map(t => (
          <button key={t.id} className={'mk-kind-tab' + (kind === t.id ? ' on' : '')} onClick={() => setKind(t.id)}>
            <Icon name={t.icon} size={14} />
            <span>{t.label}</span>
            <span className="mk-kind-count">{t.count}</span>
          </button>
        ))}
      </div>

      <div className="mk-body">
        <aside className="mk-cats">
          <div className="sb-group" style={{ paddingLeft: 4, marginBottom: 6 }}>Categories</div>
          {MARKET_CATS.map(c => (
            <button key={c} className={'mk-cat' + (cat === c ? ' on' : '')} onClick={() => setCat(c)}>{c}</button>
          ))}
          <div className="sb-group" style={{ paddingLeft: 4, marginTop: 18, marginBottom: 6 }}>Filter</div>
          <button className="mk-cat">Official only</button>
          <button className="mk-cat">Free</button>
          <button className="mk-cat">Recently updated</button>
        </aside>

        <div className="mk-main">
          <div className="toolbar" style={{ marginBottom: 16 }}>
            <div className="search" style={{ flex: 1 }}>
              <Icon name="search" size={14} className="search-ic" />
              <input className="input" placeholder="Search marketplace" value={q} onChange={e => setQ(e.target.value)} />
            </div>
            <div className="segmented">
              <button className="on">Popular</button>
              <button>New</button>
              <button>Top rated</button>
            </div>
          </div>

          {featured.length > 0 && kind === 'all' && !q.trim() && cat === 'All' && (
            <>
              <div className="mk-section-hd">
                <h3 className="mk-section-h">Featured</h3>
                <span className="sub" style={{ fontSize: 13 }}>Popular this week</span>
              </div>
              <div className="mk-featured-grid">
                {featured.map(it => <MkCard key={it.id} it={it} featured />)}
              </div>
            </>
          )}

          <div className="mk-section-hd" style={{ marginTop: featured.length > 0 && kind === 'all' && !q.trim() && cat === 'All' ? 28 : 0 }}>
            <h3 className="mk-section-h">
              {kind === 'all' ? 'All' : kindLabel[kind] + 's'}
              {cat !== 'All' && <span className="mk-section-h-sub"> · {cat}</span>}
            </h3>
            <span className="sub" style={{ fontSize: 13 }}>{rest.length} {rest.length === 1 ? 'item' : 'items'}</span>
          </div>
          <div className="card-grid">
            {rest.map(it => <MkCard key={it.id} it={it} />)}
          </div>
          {rest.length === 0 && (
            <div className="empty">
              <Icon name="search" size={22} style={{ color: 'var(--fg-faint)' }} />
              <div style={{ fontSize: 14, color: 'var(--heading)', marginTop: 10 }}>Nothing matches that.</div>
              <div className="sub" style={{ fontSize: 13 }}>Try a different category or broaden your search.</div>
            </div>
          )}
        </div>
      </div>

      {addOpen && <AddFromSourceModal onClose={() => setAddOpen(false)} toast={toast} />}
    </div>
  );
}

function AddFromSourceModal({ onClose, toast }) {
  const [source, setSource] = React.useState('github'); // github | local | url
  const [val, setVal] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const placeholder = {
    github: 'github.com/acme/mcp-internal-tools',
    local: '~/code/my-skill',
    url: 'https://example.com/manifest.json',
  }[source];

  const hint = {
    github: 'Any public or private repo. folk will read the manifest, pin to the current commit, and ask before installing.',
    local: 'Point at a folder on this machine. Great for skills and plugins you\'re building yourself — changes hot-reload.',
    url: 'Install from a direct manifest URL. The URL must be reachable; folk will fetch and validate before installing.',
  }[source];

  const submit = () => {
    if (!val.trim()) return;
    setBusy(true);
    setTimeout(() => {
      toast(`Added "${val}" — review the manifest to finish installing`, 'ok');
      onClose();
    }, 800);
  };

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 580 }} onClick={e => e.stopPropagation()}>
        <div className="modal-hd">
          <div className="grow">
            <div className="eyebrow">Install</div>
            <h2 className="h2" style={{ marginTop: 4 }}>Add from source</h2>
          </div>
          <button className="btn btn-icon btn-plain" onClick={onClose}><Icon name="x" size={14} /></button>
        </div>
        <div className="modal-bd">
          <div className="sub" style={{ marginBottom: 16 }}>
            The marketplace is community-curated — anyone can publish. If something isn't listed, install it directly.
          </div>

          <div className="source-tabs">
            {[
              { id: 'github', label: 'GitHub', icon: 'external', sub: 'From a repo URL' },
              { id: 'local', label: 'Local directory', icon: 'folder', sub: 'From your machine' },
              { id: 'url', label: 'Direct URL', icon: 'link', sub: 'Manifest file' },
            ].map(s => (
              <button key={s.id} className={'source-tab' + (source === s.id ? ' on' : '')}
                onClick={() => { setSource(s.id); setVal(''); }}>
                <Icon name={s.icon} size={14} />
                <div>
                  <div className="source-tab-label">{s.label}</div>
                  <div className="source-tab-sub">{s.sub}</div>
                </div>
              </button>
            ))}
          </div>

          <div className="field" style={{ marginTop: 16 }}>
            <label className="label">
              {source === 'github' && 'Repository URL'}
              {source === 'local' && 'Folder path'}
              {source === 'url' && 'Manifest URL'}
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="input mono" placeholder={placeholder}
                value={val} onChange={e => setVal(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submit()}
                style={{ flex: 1 }} autoFocus />
              {source === 'local' && (
                <button className="btn btn-sm btn-plain" onClick={() => setVal('~/code/my-skill')}>
                  <Icon name="folder" size={12} /> Browse…
                </button>
              )}
            </div>
            <div className="hint">{hint}</div>
          </div>

          <div className="src-warning">
            <Icon name="bolt" size={13} />
            <div>
              <b>folk doesn't review community content.</b> Read the manifest, check the author, and only install things you trust — especially plugins and MCP servers, which can read your files and make network calls.
            </div>
          </div>
        </div>
        <div className="modal-ft">
          <button className="btn btn-plain" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={!val.trim() || busy}>
            {busy ? <><span className="spinner"></span> Fetching…</> : <>Continue</>}
          </button>
        </div>
      </div>
    </div>
  );
}

function KeybindingsPage() {
  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <div className="eyebrow" style={{ marginBottom: 8 }}>Controls</div>
          <h1 className="h1">Keybindings</h1>
          <div className="sub">Every shortcut in folk. Click a row to customize — we'll warn about conflicts.</div>
        </div>
        <button className="btn"><Icon name="refresh" size={13} /> Reset to defaults</button>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <table className="kb-table">
          <thead>
            <tr><th>Action</th><th>Scope</th><th style={{ textAlign: 'right' }}>Shortcut</th></tr>
          </thead>
          <tbody>
            {KEYBINDINGS.map((k, i) => (
              <tr key={i}>
                <td>{k.action}</td>
                <td style={{ color: 'var(--body)' }}>{k.scope}</td>
                <td style={{ textAlign: 'right' }}>
                  <span style={{ display: 'inline-flex', gap: 4 }}>
                    {k.keys.map((key, j) => <span key={j} className="kbd">{key}</span>)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const PROVIDERS = [
  { id: 'anthropic', name: 'Anthropic', logoClass: 'lg-anthropic', logoText: 'AN', baseUrl: 'https://api.anthropic.com/v1', keyLabel: 'Anthropic API key', keyPrefix: 'sk-ant-',
    defaultModels: [
      { id: 'claude-sonnet-4-5', display: 'Claude Sonnet 4.5', ctx: '200K', cost: '$3/$15', caps: ['tools', 'vision'] },
      { id: 'claude-opus-4', display: 'Claude Opus 4', ctx: '200K', cost: '$15/$75', caps: ['tools', 'vision', 'extended'] },
      { id: 'claude-haiku-4-5', display: 'Claude Haiku 4.5', ctx: '200K', cost: '$1/$5', caps: ['tools', 'vision'] },
    ]},
  { id: 'openai', name: 'OpenAI', logoClass: 'lg-openai', logoText: 'OA', baseUrl: 'https://api.openai.com/v1', keyLabel: 'OpenAI API key', keyPrefix: 'sk-',
    defaultModels: [
      { id: 'gpt-4o', display: 'GPT-4o', ctx: '128K', cost: '$2.5/$10', caps: ['tools', 'vision'] },
      { id: 'o3-mini', display: 'o3-mini', ctx: '200K', cost: '$1.1/$4.4', caps: ['reasoning'] },
    ]},
  { id: 'google', name: 'Google', logoClass: 'lg-google', logoText: 'GG', baseUrl: 'https://generativelanguage.googleapis.com/v1', keyLabel: 'Google AI Studio key', keyPrefix: 'AIza',
    defaultModels: [
      { id: 'gemini-2.5-pro', display: 'Gemini 2.5 Pro', ctx: '2M', cost: '$1.25/$5', caps: ['tools', 'vision', 'audio'] },
      { id: 'gemini-2.5-flash', display: 'Gemini 2.5 Flash', ctx: '1M', cost: '$0.30/$2.5', caps: ['tools', 'vision'] },
    ]},
  { id: 'zhipu', name: 'Zhipu · GLM', logoClass: 'lg-zhipu', logoText: 'GL', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', keyLabel: 'Zhipu API key', keyPrefix: '',
    defaultModels: [
      { id: 'glm-4.6', display: 'GLM-4.6', ctx: '128K', cost: '¥0.5/¥1.5', caps: ['tools'] },
      { id: 'glm-4-air', display: 'GLM-4-Air', ctx: '128K', cost: '¥0.1/¥0.3', caps: ['tools', 'fast'] },
    ]},
  { id: 'moonshot', name: 'Moonshot · Kimi', logoClass: 'lg-moonshot', logoText: 'KM', baseUrl: 'https://api.moonshot.cn/v1', keyLabel: 'Moonshot API key', keyPrefix: 'sk-',
    defaultModels: [
      { id: 'kimi-k2', display: 'Kimi K2', ctx: '256K', cost: '¥2/¥10', caps: ['tools', 'agent'] },
      { id: 'moonshot-v1-128k', display: 'Moonshot v1 128K', ctx: '128K', cost: '¥12/¥12', caps: ['tools'] },
    ]},
  { id: 'qwen', name: 'Alibaba · Qwen', logoClass: 'lg-qwen', logoText: 'QW', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', keyLabel: 'DashScope key', keyPrefix: 'sk-',
    defaultModels: [
      { id: 'qwen3-max', display: 'Qwen3 Max', ctx: '256K', cost: '¥2.4/¥9.6', caps: ['tools', 'vision'] },
      { id: 'qwen3-coder', display: 'Qwen3 Coder', ctx: '1M', cost: '¥3/¥15', caps: ['tools', 'code'] },
    ]},
  { id: 'mistral', name: 'Mistral', logoClass: 'lg-mistral', logoText: 'MS', baseUrl: 'https://api.mistral.ai/v1', keyLabel: 'Mistral API key', keyPrefix: '',
    defaultModels: [{ id: 'mistral-large', display: 'Mistral Large', ctx: '128K', cost: '$2/$6', caps: ['tools'] }]},
  { id: 'ollama', name: 'Ollama', logoClass: 'lg-ollama', logoText: 'OL', baseUrl: 'http://localhost:11434/v1', keyLabel: 'No key — local runtime', keyPrefix: '',
    defaultModels: [
      { id: 'llama3.3:70b', display: 'llama3.3 70b', ctx: '128K', cost: 'local', caps: ['local'] },
      { id: 'qwen2.5-coder:32b', display: 'qwen2.5-coder 32b', ctx: '128K', cost: 'local', caps: ['local', 'code'] },
    ]},
];

function ModelPage({ model, setModel, toast }) {
  // Seed with a few configured providers
  const [providers, setProviders] = React.useState([
    { id: 'anthropic', key: 'sk-ant-••••••••••••••••••••••••••••••9Lj2', baseUrl: PROVIDERS[0].baseUrl, status: 'ok',
      models: PROVIDERS[0].defaultModels.map(m => ({ ...m, enabled: true })) },
    { id: 'moonshot', key: 'sk-••••••••••••••••MoonshotK2', baseUrl: PROVIDERS[4].baseUrl, status: 'ok',
      models: PROVIDERS[4].defaultModels.map(m => ({ ...m, enabled: true })) },
    { id: 'zhipu', key: '', baseUrl: PROVIDERS[3].baseUrl, status: 'idle',
      models: PROVIDERS[3].defaultModels.map(m => ({ ...m, enabled: true })) },
  ]);
  const [activeId, setActiveId] = React.useState('anthropic');
  const [showAdd, setShowAdd] = React.useState(false);
  const [reveal, setReveal] = React.useState(false);
  const [defaultModelKey, setDefaultModelKey] = React.useState('anthropic:claude-sonnet-4-5');

  const active = providers.find(p => p.id === activeId) || providers[0];
  const activeDef = PROVIDERS.find(p => p.id === active?.id);

  const unused = PROVIDERS.filter(p => !providers.find(pp => pp.id === p.id));

  const addProvider = (pid) => {
    const def = PROVIDERS.find(p => p.id === pid);
    setProviders(ps => [...ps, {
      id: pid, key: '', baseUrl: def.baseUrl, status: 'idle',
      models: def.defaultModels.map(m => ({ ...m, enabled: true })),
    }]);
    setActiveId(pid);
    setShowAdd(false);
    toast(`${def.name} added`, 'ok');
  };

  const removeProvider = (pid) => {
    if (!confirm(`Remove ${PROVIDERS.find(p => p.id === pid)?.name}? All model settings here will be lost.`)) return;
    setProviders(ps => ps.filter(p => p.id !== pid));
    if (activeId === pid) setActiveId(providers[0]?.id || 'anthropic');
    toast('Provider removed', 'ok');
  };

  const testConnection = () => {
    setProviders(ps => ps.map(p => p.id === activeId ? { ...p, status: 'testing' } : p));
    setTimeout(() => {
      const ok = (active.key || activeDef.id === 'ollama').length !== 0 || activeDef.id === 'ollama';
      setProviders(ps => ps.map(p => p.id === activeId ? { ...p, status: ok ? 'ok' : 'err' } : p));
      toast(ok ? 'Connection verified' : 'Connection failed — check the key', ok ? 'ok' : 'err');
    }, 900);
  };

  const toggleModel = (idx) => {
    setProviders(ps => ps.map(p => p.id === activeId
      ? { ...p, models: p.models.map((m, i) => i === idx ? { ...m, enabled: !m.enabled } : m) } : p));
  };

  const setAsDefault = (modelId) => {
    setDefaultModelKey(`${activeId}:${modelId}`);
    setModel(modelId);
    toast(`Default → ${activeId}/${modelId}`, 'ok');
  };

  const updateProv = (patch) => {
    setProviders(ps => ps.map(p => p.id === activeId ? { ...p, ...patch } : p));
  };

  if (!active) return null;

  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <div className="eyebrow" style={{ marginBottom: 8 }}>Configure</div>
          <h1 className="h1">Models & Providers</h1>
          <div className="sub">Bring any OpenAI- or Anthropic-compatible endpoint. Configure several providers and switch per-session.</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)} disabled={unused.length === 0}>
          <Icon name="plus" size={13} /> Add provider
        </button>
      </div>

      <div className="prov-tabs">
        {providers.map(p => {
          const def = PROVIDERS.find(dp => dp.id === p.id);
          return (
            <button key={p.id} className={'prov-tab' + (activeId === p.id ? ' on' : '')} onClick={() => setActiveId(p.id)}>
              <span className={'prov-logo ' + def.logoClass}>{def.logoText}</span>
              <span>{def.name}</span>
              <span className="count">{p.models.filter(m => m.enabled).length}</span>
              {p.status === 'ok' && <span className="dot dot-ok"></span>}
              {p.status === 'err' && <span className="dot dot-err"></span>}
              {p.status === 'idle' && <span className="dot dot-idle"></span>}
            </button>
          );
        })}
        {unused.length > 0 && (
          <button className="prov-tab add-new" onClick={() => setShowAdd(true)}>
            <Icon name="plus" size={12} /> Add
          </button>
        )}
      </div>

      {/* Provider detail */}
      <div className="prov-head">
        <div className={'prov-logo-lg ' + activeDef.logoClass}>{activeDef.logoText}</div>
        <div className="prov-info">
          <div className="prov-name">{activeDef.name}</div>
          <div className="prov-sub">{active.baseUrl}</div>
        </div>
        <span className={'conn-pill ' + (active.status === 'ok' ? 'ok' : active.status === 'err' ? 'err' : 'idle')}>
          {active.status === 'ok' && <><span className="dot dot-ok"></span> Connected</>}
          {active.status === 'err' && <><span className="dot dot-err"></span> Auth failed</>}
          {active.status === 'idle' && <><span className="dot dot-idle"></span> Not verified</>}
          {active.status === 'testing' && <><span className="spinner"></span> Testing…</>}
        </span>
        <button className="btn btn-sm btn-plain" onClick={testConnection}>
          <Icon name="refresh" size={12} /> Test
        </button>
        {providers.length > 1 && (
          <button className="btn btn-sm btn-plain" onClick={() => removeProvider(activeId)} title="Remove provider">
            <Icon name="trash" size={12} />
          </button>
        )}
      </div>

      <div className="section">
        <div className="section-head">
          <h2 className="h2">Credentials</h2>
        </div>
        <div className="field">
          <label className="label">{activeDef.keyLabel}</label>
          <div style={{ position: 'relative' }}>
            <input className="input mono" type={reveal ? 'text' : 'password'} value={active.key}
              placeholder={activeDef.keyPrefix ? `${activeDef.keyPrefix}…` : activeDef.id === 'ollama' ? 'Not needed' : 'Paste key'}
              disabled={activeDef.id === 'ollama'}
              onChange={e => updateProv({ key: e.target.value, status: 'idle' })}
              style={{ paddingRight: 80 }} />
            {activeDef.id !== 'ollama' && (
              <button className="btn btn-sm btn-plain" style={{ position: 'absolute', right: 4, top: 3 }}
                onClick={() => setReveal(r => !r)}>
                <Icon name={reveal ? 'eyeOff' : 'eye'} size={13} /> {reveal ? 'Hide' : 'Show'}
              </button>
            )}
          </div>
          <div className="hint">Stored in your macOS Keychain. Never synced.</div>
        </div>

        <div className="field">
          <label className="label">Base URL <span style={{ color: 'var(--fg-faint)', fontWeight: 400 }}>(override for proxies or self-hosted)</span></label>
          <input className="input mono" value={active.baseUrl}
            onChange={e => updateProv({ baseUrl: e.target.value, status: 'idle' })} />
        </div>
      </div>

      <div className="section" style={{ marginTop: 16 }}>
        <div className="section-head">
          <h2 className="h2">Models</h2>
          <span className="sub" style={{ fontSize: 13 }}>{active.models.filter(m => m.enabled).length} of {active.models.length} enabled</span>
          <div className="grow"></div>
          <button className="btn btn-sm btn-plain"><Icon name="refresh" size={12} /> Sync from API</button>
        </div>

        {active.models.map((m, i) => {
          const isDefault = defaultModelKey === `${activeId}:${m.id}`;
          return (
            <div key={m.id} className={'model-row' + (isDefault ? ' default' : '')}>
              <div className="radio" onClick={() => setAsDefault(m.id)} title="Set as default"></div>
              <div className="m-main">
                <div className="m-name">{m.display}</div>
                <div className="m-meta">
                  <span><Icon name="clock" size={11} /> {m.ctx} context</span>
                  <span><Icon name="bolt" size={11} /> {m.cost}/Mtok</span>
                  <span style={{ color: 'var(--fg-faint)' }}>{m.id}</span>
                </div>
              </div>
              <div className="m-caps">
                {m.caps.map(c => <span key={c} className="cap">{c}</span>)}
              </div>
              <div className={'switch' + (m.enabled ? ' on' : '')} onClick={() => toggleModel(i)}></div>
              <button className="btn btn-icon btn-sm btn-plain"><Icon name="more" size={14} /></button>
            </div>
          );
        })}

        <button className="add-model-btn" onClick={() => toast('Custom model dialog — coming soon', 'ok')}>
          <Icon name="plus" size={13} /> Add custom model ID
        </button>
      </div>

      {showAdd && (
        <div className="modal-scrim" onClick={() => setShowAdd(false)}>
          <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
            <div className="modal-hd">
              <div className="grow">
                <div className="eyebrow">Connect</div>
                <h2 className="h2" style={{ marginTop: 4 }}>Add a provider</h2>
              </div>
              <button className="btn btn-icon btn-plain" onClick={() => setShowAdd(false)}><Icon name="x" size={14} /></button>
            </div>
            <div className="modal-bd">
              <div className="sub" style={{ marginBottom: 14 }}>Pick from supported providers, or add a custom OpenAI-compatible endpoint.</div>
              <div style={{ display: 'grid', gap: 8 }}>
                {unused.map(p => (
                  <button key={p.id} className="model-opt" onClick={() => addProvider(p.id)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 14, textAlign: 'left', padding: 14 }}>
                    <span className={'prov-logo-lg ' + p.logoClass} style={{ width: 36, height: 36, fontSize: 13 }}>{p.logoText}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="name" style={{ fontSize: 14 }}>{p.name}</span>
                      <span className="desc" style={{ fontSize: 12, marginTop: 0 }}>{p.defaultModels.length} models · {p.baseUrl}</span>
                    </span>
                    <Icon name="chevronRight" size={14} />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProfilePage({ profile, setProfile, toast }) {
  const [draft, setDraft] = React.useState(profile);
  const dirty = JSON.stringify(draft) !== JSON.stringify(profile);

  const upd = (k, v) => setDraft(d => ({ ...d, [k]: v }));
  const save = () => { setProfile(draft); toast('Profile saved', 'ok'); };
  const revert = () => setDraft(profile);

  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <div className="eyebrow" style={{ marginBottom: 8 }}>You</div>
          <h1 className="h1">Profile</h1>
          <div className="sub">How folk refers to you and what it knows about your style. Stays on this machine — never synced or shared with model providers.</div>
        </div>
      </div>

      <div className="detail">
        <div className="section">
          <div className="section-head">
            <div className="prof-av-lg">{(draft.nickname || draft.name || 'Y').slice(0, 1).toUpperCase()}</div>
            <div style={{ flex: 1 }}>
              <h2 className="h2">{draft.nickname || draft.name || 'You'}</h2>
              <div className="sub" style={{ fontSize: 13 }}>{draft.role || 'Tell folk what you do'}</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 4 }}>
            <div className="field">
              <label className="label">Full name</label>
              <input className="input" value={draft.name} onChange={e => upd('name', e.target.value)} placeholder="e.g. Jamie Chen" />
            </div>
            <div className="field">
              <label className="label">Nickname <span style={{ color: 'var(--fg-faint)', fontWeight: 400 }}>— what folk calls you</span></label>
              <input className="input" value={draft.nickname} onChange={e => upd('nickname', e.target.value)} placeholder="e.g. Jamie" />
            </div>
            <div className="field">
              <label className="label">Pronouns</label>
              <input className="input" value={draft.pronouns} onChange={e => upd('pronouns', e.target.value)} placeholder="she/her · he/him · they/them · any" />
            </div>
            <div className="field">
              <label className="label">Role / title</label>
              <input className="input" value={draft.role} onChange={e => upd('role', e.target.value)} placeholder="e.g. Product engineer at Acme" />
            </div>
          </div>
        </div>

        <div className="section" style={{ marginTop: 16 }}>
          <div className="section-head">
            <h2 className="h2">How folk should talk to you</h2>
          </div>
          <div className="field">
            <label className="label">Preferred tone</label>
            <div className="segmented" style={{ width: 'fit-content' }}>
              {['Warm but concise', 'Direct', 'Playful', 'Formal'].map(tone => (
                <button key={tone} className={draft.tone === tone ? 'on' : ''} onClick={() => upd('tone', tone)}>{tone}</button>
              ))}
            </div>
          </div>
          <div className="field">
            <label className="label">Things to avoid</label>
            <input className="input" value={draft.avoid} onChange={e => upd('avoid', e.target.value)}
              placeholder="e.g. don't use emojis, skip the preamble, no hedging language" />
            <div className="hint">Passed as a system note to every session.</div>
          </div>
          <div className="field">
            <label className="label">About you</label>
            <textarea className="input" rows={4}
              value={draft.about} onChange={e => upd('about', e.target.value)}
              placeholder="What you're working on, languages you use, favorite tools, running jokes. Anything that would help folk be more useful."
              style={{ resize: 'vertical', fontFamily: 'inherit', padding: 10, lineHeight: 1.5 }} />
          </div>
        </div>

        <div className="section" style={{ marginTop: 16 }}>
          <div className="section-head">
            <h2 className="h2">Privacy</h2>
          </div>
          <div className="kv">
            <dt>Where this lives</dt>
            <dd>Your profile is stored locally on this machine only.</dd>
            <dt>What goes to models</dt>
            <dd>Your nickname, pronouns, tone, and "things to avoid" are passed as a short system note. Everything else stays local unless you reference it in a prompt.</dd>
          </div>
        </div>

        <div className="prof-save-bar">
          {dirty ? (
            <>
              <span className="hint" style={{ fontSize: 12, color: 'var(--fg-faint)', marginRight: 'auto' }}>Unsaved changes</span>
              <button className="btn btn-sm btn-plain" onClick={revert}>Revert</button>
              <button className="btn btn-sm composer-send" onClick={save}><Icon name="check" size={12} /> Save profile</button>
            </>
          ) : (
            <span className="hint" style={{ fontSize: 12, color: 'var(--fg-faint)' }}>
              <Icon name="check" size={11} /> Saved
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { SkillsPage, PluginsPage, SessionsPage, MarketplacePage, KeybindingsPage, ModelPage, ProfilePage, PROVIDERS });
