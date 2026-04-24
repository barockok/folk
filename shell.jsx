// shell.jsx — sidebar, topbar, command palette, toasts

const NAV_GROUPS = [
  { group: 'Workspace', items: [
    { id: 'sessions', label: 'Sessions', icon: 'terminal' },
    { id: 'mcp', label: 'MCP Servers', icon: 'server' },
    { id: 'skills', label: 'Skills', icon: 'sparkles' },
    { id: 'plugins', label: 'Plugins', icon: 'puzzle' },
  ]},
  { group: 'Discover', items: [
    { id: 'marketplace', label: 'Marketplace', icon: 'store' },
  ]},
  { group: 'Configure', items: [
    { id: 'model', label: 'Models', icon: 'cpu' },
    { id: 'keybindings', label: 'Keybindings', icon: 'keyboard' },
  ]},
];

function Sidebar({ current, onNav, counts, collapsed, onToggle, profile }) {
  return (
    <aside className={'sb' + (collapsed ? ' sb-collapsed' : '')}>
      <div className="sb-brand">
        <div className="sb-logo" title={collapsed ? 'folk' : undefined}><span>f</span></div>
        {!collapsed && (
          <div className="sb-brand-name" style={{ flex: 1 }}>folk</div>
        )}
        {!collapsed && (
          <button className="sb-collapse" onClick={onToggle} title="Collapse sidebar">
            <Icon name="chevronLeft" size={13} />
          </button>
        )}
      </div>

      {collapsed && (
        <button className="sb-expand" onClick={onToggle} title="Expand sidebar">
          <Icon name="chevronRight" size={13} />
        </button>
      )}

      <nav className="sb-nav scroll">
        {NAV_GROUPS.map(g => (
          <div key={g.group}>
            {!collapsed && <div className="sb-group">{g.group}</div>}
            {g.items.map(it => (
              <div
                key={it.id}
                className={'sb-item' + (current === it.id ? ' active' : '')}
                onClick={() => onNav(it.id)}
                title={collapsed ? it.label : undefined}
              >
                <Icon name={it.icon} size={16} className="sb-ico" />
                {!collapsed && <>
                  <span>{it.label}</span>
                  {counts[it.id] != null && <span className="sb-item-meta">{counts[it.id]}</span>}
                </>}
              </div>
            ))}
          </div>
        ))}
      </nav>

      <div
        className={'sb-profile' + (current === 'profile' ? ' on' : '')}
        onClick={() => onNav('profile')}
        title={collapsed ? (profile.nickname || profile.name) + ' — profile' : undefined}
      >
        <div className="sb-profile-av">{(profile.nickname || profile.name || 'Y').slice(0, 1).toUpperCase()}</div>
        {!collapsed && (
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="sb-profile-name trunc">{profile.nickname || profile.name}</div>
            <div className="sb-profile-sub trunc">How folk refers to you</div>
          </div>
        )}
        {!collapsed && <Icon name="chevronRight" size={13} className="sb-profile-caret" />}
      </div>
    </aside>
  );
}

function Topbar({ crumbs, onOpenCmdK, actions }) {
  return (
    <header className="topbar">
      <div className="crumbs">
        {crumbs.map((c, i) => (
          <React.Fragment key={i}>
            {i > 0 && <Icon name="chevronRight" size={12} className="sep" />}
            <span className={i === crumbs.length - 1 ? 'cur' : ''}>{c}</span>
          </React.Fragment>
        ))}
      </div>
      <div className="cmdk-trigger" onClick={onOpenCmdK}>
        <Icon name="search" size={14} />
        <span>Search or run a command…</span>
        <span className="kbd">⌘K</span>
      </div>
      {actions}
    </header>
  );
}

function CommandPalette({ open, onClose, onNav }) {
  const [q, setQ] = React.useState('');
  const [sel, setSel] = React.useState(0);
  const inputRef = React.useRef();

  React.useEffect(() => {
    if (open) { setQ(''); setSel(0); setTimeout(() => inputRef.current?.focus(), 20); }
  }, [open]);

  const items = React.useMemo(() => {
    const base = [
      { g: 'Go to', id: 'mcp', label: 'MCP Servers', icon: 'server', action: () => onNav('mcp') },
      { g: 'Go to', id: 'skills', label: 'Skills', icon: 'sparkles', action: () => onNav('skills') },
      { g: 'Go to', id: 'plugins', label: 'Plugins', icon: 'puzzle', action: () => onNav('plugins') },
      { g: 'Go to', id: 'sessions', label: 'Sessions (Terminal)', icon: 'terminal', action: () => onNav('sessions') },
      { g: 'Go to', id: 'marketplace', label: 'Marketplace', icon: 'store', action: () => onNav('marketplace') },
      { g: 'Go to', id: 'model', label: 'Models & Providers', icon: 'cpu', action: () => onNav('model') },
      { g: 'Go to', id: 'keybindings', label: 'Keybindings', icon: 'keyboard', action: () => onNav('keybindings') },
      { g: 'Action', id: 'add-mcp', label: 'Add a new MCP server', icon: 'plus', action: () => onNav('mcp', 'add') },
      { g: 'Action', id: 'new-session', label: 'Start a new session', icon: 'terminal', action: () => onNav('sessions') },
      { g: 'Action', id: 'test-all', label: 'Test-connect all MCP servers', icon: 'bolt', action: () => onNav('mcp') },
    ];
    if (!q.trim()) return base;
    const needle = q.toLowerCase();
    return base.filter(i => i.label.toLowerCase().includes(needle));
  }, [q, onNav]);

  if (!open) return null;

  const groups = {};
  items.forEach(it => { (groups[it.g] = groups[it.g] || []).push(it); });

  const run = (it) => { it.action(); onClose(); };

  return (
    <div className="modal-scrim" onClick={onClose} onKeyDown={(e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(items.length - 1, s + 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(0, s - 1)); }
      else if (e.key === 'Enter') { e.preventDefault(); items[sel] && run(items[sel]); }
      else if (e.key === 'Escape') onClose();
    }}>
      <div className="cmdk" onClick={e => e.stopPropagation()}>
        <div className="cmdk-input-wrap">
          <Icon name="search" size={16} style={{ color: 'var(--fg-faint)' }} />
          <input ref={inputRef} value={q} onChange={e => { setQ(e.target.value); setSel(0); }} placeholder="Type a command or search…" />
          <span className="kbd">Esc</span>
        </div>
        <div className="cmdk-list scroll">
          {items.length === 0 && <div style={{ padding: 30, textAlign: 'center', color: 'var(--fg-faint)', fontSize: 13 }}>No results</div>}
          {Object.entries(groups).map(([g, arr]) => (
            <div key={g}>
              <div className="cmdk-group">{g}</div>
              {arr.map((it) => {
                const idx = items.indexOf(it);
                return (
                  <div key={it.id} className={'cmdk-item' + (idx === sel ? ' on' : '')}
                    onMouseEnter={() => setSel(idx)}
                    onClick={() => run(it)}>
                    <Icon name={it.icon} size={15} />
                    <span>{it.label}</span>
                    <span className="trail">↵</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Toasts({ items }) {
  return (
    <div className="toasts">
      {items.map(t => (
        <div key={t.id} className="toast">
          {t.kind === 'ok' && <Icon name="check" size={14} style={{ color: '#15be53' }} />}
          {t.kind === 'err' && <Icon name="xCircle" size={14} style={{ color: '#f96bee' }} />}
          {t.text}
        </div>
      ))}
    </div>
  );
}

Object.assign(window, { Sidebar, Topbar, CommandPalette, Toasts });
