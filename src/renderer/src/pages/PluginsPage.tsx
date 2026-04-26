import { useCallback, useEffect, useMemo, useState } from 'react'
import { Icon } from '../components/icons'
import { useUIStore } from '../stores/useUIStore'
import type { DiscoveredPlugin, MarketplacePlugin, MarketplaceSummary } from '@shared/types'

type Tab = 'installed' | 'discover' | 'marketplaces'
type SourceTab = 'github' | 'local'

// ----------- Add Marketplace modal -----------

function AddMarketplaceModal({
  onClose,
  onAdded
}: {
  onClose: () => void
  onAdded: () => void
}) {
  const toast = useUIStore((s) => s.toast)
  const [source, setSource] = useState<SourceTab>('github')
  const [val, setVal] = useState('')
  const [busy, setBusy] = useState(false)

  const placeholder: Record<SourceTab, string> = {
    github: 'owner/repo or https://github.com/owner/repo',
    local: '~/code/my-marketplace'
  }
  const hint: Record<SourceTab, string> = {
    github:
      'folk will git clone the repo into ~/.claude/plugins/marketplaces/ and read its .claude-plugin/marketplace.json.',
    local:
      'Folder must contain .claude-plugin/marketplace.json. The marketplace is registered in place; nothing is copied.'
  }

  const submit = async () => {
    if (!val.trim() || busy) return
    setBusy(true)
    const res =
      source === 'github'
        ? await window.folk.marketplaces.addGithub(val)
        : await window.folk.marketplaces.addDirectory(val)
    setBusy(false)
    if (res.ok) {
      toast({ kind: 'ok', text: `Added marketplace "${res.name}"` })
      onAdded()
      onClose()
    } else {
      toast({ kind: 'err', text: res.error ?? 'Add failed' })
    }
  }

  const browseLocal = async () => {
    const path = await window.folk.dialog.openFolder()
    if (path) setVal(path)
  }

  const TABS: { id: SourceTab; label: string; icon: string; sub: string }[] = [
    { id: 'github', label: 'GitHub', icon: 'external', sub: 'Clone a public repo' },
    { id: 'local', label: 'Local directory', icon: 'folder', sub: 'Register in place' }
  ]

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 580 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd">
          <div className="grow">
            <div className="eyebrow">Add</div>
            <h2 className="h2" style={{ marginTop: 4 }}>Add a marketplace</h2>
          </div>
          <button className="btn btn-icon btn-plain" onClick={onClose}>
            <Icon name="x" size={14} />
          </button>
        </div>
        <div className="modal-bd">
          <div className="sub" style={{ marginBottom: 16 }}>
            Marketplaces are catalogs of plugins. Add one to browse its plugins here.
          </div>

          <div className="source-tabs">
            {TABS.map((s) => (
              <button
                key={s.id}
                className={'source-tab' + (source === s.id ? ' on' : '')}
                onClick={() => {
                  setSource(s.id)
                  setVal('')
                }}
              >
                <Icon name={s.icon} size={14} />
                <div>
                  <div className="source-tab-label">{s.label}</div>
                  <div className="source-tab-sub">{s.sub}</div>
                </div>
              </button>
            ))}
          </div>

          <div className="field" style={{ marginTop: 16 }}>
            <label className="label">{source === 'github' ? 'Repository' : 'Folder path'}</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="input mono"
                placeholder={placeholder[source]}
                value={val}
                onChange={(e) => setVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void submit()
                }}
                style={{ flex: 1 }}
                autoFocus
              />
              {source === 'local' && (
                <button className="btn btn-sm btn-plain" onClick={browseLocal}>
                  <Icon name="folder" size={12} /> Browse…
                </button>
              )}
            </div>
            <div className="hint">{hint[source]}</div>
          </div>

          <div className="src-warning">
            <Icon name="bolt" size={13} />
            <div>
              <b>folk doesn't review community content.</b> Plugins can read your files and make
              network calls. Only add marketplaces from people you trust.
            </div>
          </div>
        </div>
        <div className="modal-ft">
          <button className="btn btn-plain" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={() => void submit()}
            disabled={!val.trim() || busy}
          >
            {busy ? <><span className="spinner" /> Adding…</> : <>Add marketplace</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ----------- Tab views -----------

function InstalledTab({
  plugins,
  loading,
  onUninstall,
  busy
}: {
  plugins: DiscoveredPlugin[]
  loading: boolean
  onUninstall: (p: DiscoveredPlugin) => void
  busy: Record<string, boolean>
}) {
  if (loading) return <div className="sub">Scanning…</div>
  if (plugins.length === 0) {
    return (
      <div className="empty">
        <Icon name="puzzle" size={22} style={{ color: 'var(--fg-faint)' }} />
        <div style={{ fontSize: 14, color: 'var(--heading)', marginTop: 10 }}>
          No plugins installed.
        </div>
        <div className="sub" style={{ fontSize: 13 }}>
          Add a marketplace, then browse the Discover tab.
        </div>
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {plugins.map((p) => (
        <div key={p.id} className="plugin-row">
          <div className="plugin-ic">{p.name.slice(0, 2).toUpperCase()}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="plugin-name">
              {p.name}
              {p.scope === 'project' ? (
                <span className="badge badge-ac">Project</span>
              ) : (
                <span className="badge">User</span>
              )}
            </div>
            <div className="plugin-desc">
              {p.description || <em>No description in manifest</em>}
            </div>
            <div style={{ marginTop: 4 }}>
              <span className="plugin-meta">
                v{p.version}
                {p.marketplace ? ` · ${p.marketplace}` : ''}
                {p.lastUpdated ? ` · updated ${new Date(p.lastUpdated).toLocaleDateString()}` : ''}
              </span>
            </div>
          </div>
          <button
            className="btn btn-sm btn-plain"
            onClick={() => onUninstall(p)}
            disabled={!!busy[p.id]}
            title="Uninstall"
          >
            {busy[p.id] ? <span className="spinner" /> : <Icon name="trash" size={12} />}
            Uninstall
          </button>
        </div>
      ))}
    </div>
  )
}

function DiscoverTab({
  catalog,
  marketplaces,
  loading,
  onInstall,
  installing
}: {
  catalog: MarketplacePlugin[]
  marketplaces: MarketplaceSummary[]
  loading: boolean
  onInstall: (it: MarketplacePlugin) => void
  installing: Record<string, boolean>
}) {
  const [marketplaceFilter, setMarketplaceFilter] = useState<string>('all')
  const [cat, setCat] = useState<string>('All')
  const [q, setQ] = useState('')
  const [showInstalled, setShowInstalled] = useState(false)

  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const p of catalog) if (p.category) set.add(p.category)
    return ['All', ...Array.from(set).sort()]
  }, [catalog])

  const filtered = catalog.filter((it) => {
    if (!showInstalled && it.installed) return false
    if (marketplaceFilter !== 'all' && it.marketplace !== marketplaceFilter) return false
    if (cat !== 'All' && it.category !== cat) return false
    if (q.trim()) {
      const hay = `${it.name} ${it.description} ${it.author} ${it.marketplace}`.toLowerCase()
      if (!hay.includes(q.toLowerCase())) return false
    }
    return true
  })

  if (loading) return <div className="sub">Loading catalog…</div>

  if (marketplaces.length === 0) {
    return (
      <div className="empty">
        <Icon name="store" size={22} style={{ color: 'var(--fg-faint)' }} />
        <div style={{ fontSize: 14, color: 'var(--heading)', marginTop: 10 }}>
          No marketplaces registered.
        </div>
        <div className="sub" style={{ fontSize: 13 }}>
          Add one from the Marketplaces tab to start discovering plugins.
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="toolbar" style={{ marginBottom: 12, gap: 8 }}>
        <div className="search" style={{ flex: 1 }}>
          <Icon name="search" size={14} className="search-ic" />
          <input
            className="input"
            placeholder="Search plugins"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select
          className="input"
          value={marketplaceFilter}
          onChange={(e) => setMarketplaceFilter(e.target.value)}
          style={{ maxWidth: 200 }}
        >
          <option value="all">All marketplaces</option>
          {marketplaces.map((m) => (
            <option key={m.name} value={m.name}>
              {m.name} ({m.pluginCount})
            </option>
          ))}
        </select>
        <select
          className="input"
          value={cat}
          onChange={(e) => setCat(e.target.value)}
          style={{ maxWidth: 160 }}
        >
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <label
          className="btn btn-sm btn-plain"
          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <input
            type="checkbox"
            checked={showInstalled}
            onChange={(e) => setShowInstalled(e.target.checked)}
          />
          Show installed
        </label>
      </div>

      <div className="mk-section-hd">
        <h3 className="mk-section-h">
          {filtered.length} {filtered.length === 1 ? 'plugin' : 'plugins'}
        </h3>
      </div>

      <div className="card-grid">
        {filtered.map((it) => (
          <PluginDiscoverCard
            key={it.id}
            it={it}
            onInstall={onInstall}
            installing={!!installing[it.id]}
          />
        ))}
      </div>
      {filtered.length === 0 && (
        <div className="empty">
          <Icon name="search" size={22} style={{ color: 'var(--fg-faint)' }} />
          <div style={{ fontSize: 14, color: 'var(--heading)', marginTop: 10 }}>
            Nothing matches that.
          </div>
          <div className="sub" style={{ fontSize: 13 }}>
            Try a different filter or broaden your search.
          </div>
        </div>
      )}
    </div>
  )
}

function PluginDiscoverCard({
  it,
  onInstall,
  installing
}: {
  it: MarketplacePlugin
  onInstall: (it: MarketplacePlugin) => void
  installing: boolean
}) {
  return (
    <div className="mk-card">
      <div className="mk-card-hd">
        <div className="mk-ic mk-ic-plugin">{it.name.slice(0, 2).toUpperCase()}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="mk-name trunc">{it.name}</div>
          <div className="mk-author trunc">
            <span className="mk-kind-pill">
              <Icon name="store" size={10} />
              {it.marketplace}
            </span>
            {it.author && (
              <>
                <span className="mk-dot">·</span>
                {it.author}
              </>
            )}
          </div>
        </div>
        {it.installed && (
          <span className="badge badge-ac" title="Installed">Installed</span>
        )}
      </div>
      <div className="mk-desc">{it.description || <em>No description</em>}</div>
      <div className="mk-meta">
        {it.category && <span className="tnum">{it.category}</span>}
        <span className="grow" />
        {it.homepage && (
          <a
            href={it.homepage}
            target="_blank"
            rel="noreferrer"
            className="btn btn-sm btn-plain"
          >
            <Icon name="external" size={12} /> Homepage
          </a>
        )}
        {it.installed ? (
          <button className="btn btn-sm" disabled>
            <Icon name="check" size={12} /> Installed
          </button>
        ) : (
          <button
            className="btn btn-sm btn-primary"
            onClick={() => onInstall(it)}
            disabled={installing}
          >
            {installing ? <span className="spinner" /> : 'Install'}
          </button>
        )}
      </div>
    </div>
  )
}

function MarketplacesTab({
  marketplaces,
  loading,
  onRemove,
  removing,
  onAdd
}: {
  marketplaces: MarketplaceSummary[]
  loading: boolean
  onRemove: (name: string) => void
  removing: Record<string, boolean>
  onAdd: () => void
}) {
  if (loading) return <div className="sub">Loading…</div>
  if (marketplaces.length === 0) {
    return (
      <div className="empty">
        <Icon name="store" size={22} style={{ color: 'var(--fg-faint)' }} />
        <div style={{ fontSize: 14, color: 'var(--heading)', marginTop: 10 }}>
          No marketplaces registered.
        </div>
        <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={onAdd}>
          <Icon name="plus" size={13} /> Add marketplace
        </button>
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {marketplaces.map((m) => (
        <div key={m.name} className="plugin-row">
          <div className="plugin-ic">{m.name.slice(0, 2).toUpperCase()}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="plugin-name">
              {m.name}
              <span className="badge">{m.pluginCount} plugins</span>
            </div>
            <div className="plugin-desc">{m.description || <em>No description</em>}</div>
            <div style={{ marginTop: 4 }}>
              <span className="plugin-meta">
                {m.source.source === 'github' && m.source.repo && `github:${m.source.repo}`}
                {m.source.source === 'directory' && m.source.path && `dir:${m.source.path}`}
                {m.source.source === 'url' && m.source.url && `url:${m.source.url}`}
                {m.lastUpdated ? ` · updated ${new Date(m.lastUpdated).toLocaleDateString()}` : ''}
              </span>
            </div>
          </div>
          <button
            className="btn btn-sm btn-plain"
            onClick={() => onRemove(m.name)}
            disabled={!!removing[m.name]}
            title="Remove marketplace"
          >
            {removing[m.name] ? <span className="spinner" /> : <Icon name="trash" size={12} />}
            Remove
          </button>
        </div>
      ))}
    </div>
  )
}

// ----------- Page -----------

export function PluginsPage() {
  const toast = useUIStore((s) => s.toast)
  const [tab, setTab] = useState<Tab>('installed')
  const [installed, setInstalled] = useState<DiscoveredPlugin[]>([])
  const [marketplaces, setMarketplaces] = useState<MarketplaceSummary[]>([])
  const [catalog, setCatalog] = useState<MarketplacePlugin[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [uninstallBusy, setUninstallBusy] = useState<Record<string, boolean>>({})
  const [installBusy, setInstallBusy] = useState<Record<string, boolean>>({})
  const [removeBusy, setRemoveBusy] = useState<Record<string, boolean>>({})

  const refresh = useCallback(async () => {
    setLoading(true)
    const [inst, mks, cat] = await Promise.all([
      window.folk.discover.plugins(),
      window.folk.marketplaces.list(),
      window.folk.marketplaces.catalog()
    ])
    setInstalled(inst)
    setMarketplaces(mks)
    setCatalog(cat)
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const uninstall = async (p: DiscoveredPlugin) => {
    const label = `${p.name}${p.scope === 'project' ? ' (project)' : ''}`
    if (!window.confirm(`Uninstall ${label}? This removes the plugin from installed_plugins.json and deletes its cache directory.`)) {
      return
    }
    setUninstallBusy((b) => ({ ...b, [p.id]: true }))
    const res = await window.folk.plugins.uninstall({
      name: p.name,
      marketplace: p.marketplace,
      scope: p.scope,
      projectPath: p.projectPath ?? undefined
    })
    setUninstallBusy((b) => {
      const next = { ...b }
      delete next[p.id]
      return next
    })
    if (res.ok) {
      toast({ kind: 'ok', text: `Uninstalled ${p.name}` })
      void refresh()
    } else {
      toast({ kind: 'err', text: res.error ?? 'Uninstall failed' })
    }
  }

  const install = (it: MarketplacePlugin) => {
    setInstallBusy((b) => ({ ...b, [it.id]: true }))
    setTimeout(() => {
      toast({
        kind: 'warn',
        text: `Install from folk not supported yet — run "claude /plugin install ${it.name}@${it.marketplace}" in a terminal.`
      })
      setInstallBusy((b) => {
        const next = { ...b }
        delete next[it.id]
        return next
      })
    }, 300)
  }

  const removeMarketplace = async (name: string) => {
    if (!window.confirm(`Remove marketplace "${name}"? This unregisters it; cloned folders are deleted, directory sources are left in place.`)) {
      return
    }
    setRemoveBusy((b) => ({ ...b, [name]: true }))
    const res = await window.folk.marketplaces.remove(name)
    setRemoveBusy((b) => {
      const next = { ...b }
      delete next[name]
      return next
    })
    if (res.ok) {
      toast({ kind: 'ok', text: `Removed ${name}` })
      void refresh()
    } else {
      toast({ kind: 'err', text: res.error ?? 'Remove failed' })
    }
  }

  const TABS: { id: Tab; label: string; count: number }[] = [
    { id: 'installed', label: 'Installed', count: installed.length },
    { id: 'discover', label: 'Discover', count: catalog.filter((c) => !c.installed).length },
    { id: 'marketplaces', label: 'Marketplaces', count: marketplaces.length }
  ]

  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <div className="eyebrow" style={{ marginBottom: 8 }}>Extensions</div>
          <h1 className="h1">Plugins</h1>
          <div className="sub">
            Browse, install, and manage plugins from <code>~/.claude/plugins/</code>.
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => setAddOpen(true)}>
          <Icon name="plus" size={13} /> Add marketplace
        </button>
      </div>

      <div className="mk-kind-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={'mk-kind-tab' + (tab === t.id ? ' on' : '')}
            onClick={() => setTab(t.id)}
          >
            <span>{t.label}</span>
            <span className="mk-kind-count">{t.count}</span>
          </button>
        ))}
      </div>

      <div style={{ marginTop: 16 }}>
        {tab === 'installed' && (
          <InstalledTab
            plugins={installed}
            loading={loading}
            onUninstall={uninstall}
            busy={uninstallBusy}
          />
        )}
        {tab === 'discover' && (
          <DiscoverTab
            catalog={catalog}
            marketplaces={marketplaces}
            loading={loading}
            onInstall={install}
            installing={installBusy}
          />
        )}
        {tab === 'marketplaces' && (
          <MarketplacesTab
            marketplaces={marketplaces}
            loading={loading}
            onRemove={removeMarketplace}
            removing={removeBusy}
            onAdd={() => setAddOpen(true)}
          />
        )}
      </div>

      {addOpen && (
        <AddMarketplaceModal
          onClose={() => setAddOpen(false)}
          onAdded={() => void refresh()}
        />
      )}
    </div>
  )
}
