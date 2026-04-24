import { useState } from 'react'
import { Icon } from '../components/icons'
import { useUIStore } from '../stores/useUIStore'
import { MARKET_ITEMS, MARKET_CATS, UIMarketItem } from '../data'

// ---------- types ----------
type KindFilter = 'all' | 'mcp' | 'skill' | 'plugin'
type InstallState = Record<string, 'loading' | 'done'>
type SourceTab = 'github' | 'local' | 'url'

// ---------- constants ----------
const KIND_LABEL: Record<string, string> = { mcp: 'MCP server', skill: 'Skill', plugin: 'Plugin' }
const KIND_ICON: Record<string, string> = { mcp: 'server', skill: 'sparkles', plugin: 'puzzle' }

// ---------- sub-components ----------

function MkCard({
  it,
  featured,
  installing,
  onInstall,
}: {
  it: UIMarketItem
  featured?: boolean
  installing: InstallState
  onInstall: (id: string, name: string) => void
}) {
  return (
    <div className={'mk-card' + (featured ? ' mk-card-hero' : '')}>
      <div className="mk-card-hd">
        <div className={'mk-ic mk-ic-' + it.kind}>{it.icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="mk-name trunc">{it.name}</div>
          <div className="mk-author trunc">
            <span className="mk-kind-pill">
              <Icon name={KIND_ICON[it.kind]} size={10} />
              {KIND_LABEL[it.kind]}
            </span>
            <span className="mk-dot">·</span>
            {it.author}
          </div>
        </div>
        {it.tag === 'Verified' && (
          <span className="badge badge-ac" title="Official — published by the company itself">
            Official
          </span>
        )}
        {it.tag === 'Popular' && <span className="badge badge-magenta">{it.tag}</span>}
        {it.tag === 'Trending' && <span className="badge badge-warn">{it.tag}</span>}
      </div>
      <div className="mk-desc">{it.desc}</div>
      <div className="mk-meta">
        <span className="tnum">
          <Icon name="download" size={11} /> {it.downloads}
        </span>
        <span className="tnum">★ {it.rating}</span>
        <span className="grow" />
        {installing[it.id] === 'loading' ? (
          <button className="btn btn-sm" disabled>
            <span className="spinner" /> Installing
          </button>
        ) : installing[it.id] === 'done' ? (
          <button className="btn btn-sm" style={{ color: 'var(--ok-text)' }}>
            <Icon name="check" size={12} /> Installed
          </button>
        ) : (
          <button className="btn btn-sm btn-primary" onClick={() => onInstall(it.id, it.name)}>
            Install
          </button>
        )}
      </div>
    </div>
  )
}

function AddFromSourceModal({
  onClose,
  toast,
}: {
  onClose: () => void
  toast: (t: { kind: 'info' | 'ok' | 'warn' | 'err'; text: string }) => void
}) {
  const [source, setSource] = useState<SourceTab>('github')
  const [val, setVal] = useState('')
  const [busy, setBusy] = useState(false)

  const placeholder: Record<SourceTab, string> = {
    github: 'github.com/acme/mcp-internal-tools',
    local: '~/code/my-skill',
    url: 'https://example.com/manifest.json',
  }

  const hint: Record<SourceTab, string> = {
    github:
      'Any public or private repo. folk will read the manifest, pin to the current commit, and ask before installing.',
    local:
      "Point at a folder on this machine. Great for skills and plugins you're building yourself — changes hot-reload.",
    url: 'Install from a direct manifest URL. The URL must be reachable; folk will fetch and validate before installing.',
  }

  const submit = () => {
    if (!val.trim()) return
    setBusy(true)
    setTimeout(() => {
      toast({ kind: 'ok', text: `Added "${val}" — review the manifest to finish installing` })
      onClose()
    }, 800)
  }

  const SOURCE_TABS: { id: SourceTab; label: string; icon: string; sub: string }[] = [
    { id: 'github', label: 'GitHub', icon: 'external', sub: 'From a repo URL' },
    { id: 'local', label: 'Local directory', icon: 'folder', sub: 'From your machine' },
    { id: 'url', label: 'Direct URL', icon: 'link', sub: 'Manifest file' },
  ]

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 580 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd">
          <div className="grow">
            <div className="eyebrow">Install</div>
            <h2 className="h2" style={{ marginTop: 4 }}>
              Add from source
            </h2>
          </div>
          <button className="btn btn-icon btn-plain" onClick={onClose}>
            <Icon name="x" size={14} />
          </button>
        </div>
        <div className="modal-bd">
          <div className="sub" style={{ marginBottom: 16 }}>
            The marketplace is community-curated — anyone can publish. If something isn't listed,
            install it directly.
          </div>

          <div className="source-tabs">
            {SOURCE_TABS.map((s) => (
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
            <label className="label">
              {source === 'github' && 'Repository URL'}
              {source === 'local' && 'Folder path'}
              {source === 'url' && 'Manifest URL'}
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="input mono"
                placeholder={placeholder[source]}
                value={val}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setVal(e.target.value)}
                onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                  if (e.key === 'Enter') submit()
                }}
                style={{ flex: 1 }}
                autoFocus
              />
              {source === 'local' && (
                <button className="btn btn-sm btn-plain" onClick={() => setVal('~/code/my-skill')}>
                  <Icon name="folder" size={12} /> Browse…
                </button>
              )}
            </div>
            <div className="hint">{hint[source]}</div>
          </div>

          <div className="src-warning">
            <Icon name="bolt" size={13} />
            <div>
              <b>folk doesn't review community content.</b> Read the manifest, check the author,
              and only install things you trust — especially plugins and MCP servers, which can read
              your files and make network calls.
            </div>
          </div>
        </div>
        <div className="modal-ft">
          <button className="btn btn-plain" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={submit}
            disabled={!val.trim() || busy}
          >
            {busy ? (
              <>
                <span className="spinner" /> Fetching…
              </>
            ) : (
              <>Continue</>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------- main page ----------

export function MarketplacePage() {
  const toast = useUIStore((s) => s.toast)
  const [installing, setInstalling] = useState<InstallState>({})
  const [kind, setKind] = useState<KindFilter>('all')
  const [cat, setCat] = useState('All')
  const [q, setQ] = useState('')
  const [addOpen, setAddOpen] = useState(false)

  const install = (id: string, name: string) => {
    setInstalling((p) => ({ ...p, [id]: 'loading' }))
    setTimeout(() => {
      setInstalling((p) => ({ ...p, [id]: 'done' }))
      toast({ kind: 'ok', text: `${name} installed` })
    }, 900)
  }

  const matchKind = (it: UIMarketItem) => kind === 'all' || it.kind === kind
  const matchCat = (it: UIMarketItem) => cat === 'All' || (it.cats || []).includes(cat)
  const matchQ = (it: UIMarketItem) =>
    !q.trim() ||
    (it.name + ' ' + it.desc + ' ' + it.author).toLowerCase().includes(q.toLowerCase())

  const filtered = MARKET_ITEMS.filter((it) => matchKind(it) && matchCat(it) && matchQ(it))
  const featured = filtered.filter((it) => it.featured)
  const rest = filtered.filter((it) => !it.featured)

  const showFeatured = featured.length > 0 && kind === 'all' && !q.trim() && cat === 'All'

  const KIND_TABS: { id: KindFilter; label: string; icon: string; count: number }[] = [
    { id: 'all', label: 'All', icon: 'store', count: MARKET_ITEMS.length },
    {
      id: 'mcp',
      label: 'MCP servers',
      icon: 'server',
      count: MARKET_ITEMS.filter((i) => i.kind === 'mcp').length,
    },
    {
      id: 'skill',
      label: 'Skills',
      icon: 'sparkles',
      count: MARKET_ITEMS.filter((i) => i.kind === 'skill').length,
    },
    {
      id: 'plugin',
      label: 'Plugins',
      icon: 'puzzle',
      count: MARKET_ITEMS.filter((i) => i.kind === 'plugin').length,
    },
  ]

  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <div className="eyebrow" style={{ marginBottom: 8 }}>Discover</div>
          <h1 className="h1">Marketplace</h1>
          <div className="sub">
            A community-curated list of skills, plugins, and MCP servers. folk doesn't endorse or
            review these — check the source before installing.
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => setAddOpen(true)}>
          <Icon name="plus" size={13} /> Add from source
        </button>
      </div>

      <div className="mk-kind-tabs">
        {KIND_TABS.map((t) => (
          <button
            key={t.id}
            className={'mk-kind-tab' + (kind === t.id ? ' on' : '')}
            onClick={() => setKind(t.id)}
          >
            <Icon name={t.icon} size={14} />
            <span>{t.label}</span>
            <span className="mk-kind-count">{t.count}</span>
          </button>
        ))}
      </div>

      <div className="mk-body">
        <aside className="mk-cats">
          <div className="sb-group" style={{ paddingLeft: 4, marginBottom: 6 }}>
            Categories
          </div>
          {MARKET_CATS.map((c) => (
            <button
              key={c}
              className={'mk-cat' + (cat === c ? ' on' : '')}
              onClick={() => setCat(c)}
            >
              {c}
            </button>
          ))}
          <div className="sb-group" style={{ paddingLeft: 4, marginTop: 18, marginBottom: 6 }}>
            Filter
          </div>
          <button className="mk-cat">Official only</button>
          <button className="mk-cat">Free</button>
          <button className="mk-cat">Recently updated</button>
        </aside>

        <div className="mk-main">
          <div className="toolbar" style={{ marginBottom: 16 }}>
            <div className="search" style={{ flex: 1 }}>
              <Icon name="search" size={14} className="search-ic" />
              <input
                className="input"
                placeholder="Search marketplace"
                value={q}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQ(e.target.value)}
              />
            </div>
            <div className="segmented">
              <button className="on">Popular</button>
              <button>New</button>
              <button>Top rated</button>
            </div>
          </div>

          {showFeatured && (
            <>
              <div className="mk-section-hd">
                <h3 className="mk-section-h">Featured</h3>
                <span className="sub" style={{ fontSize: 13 }}>
                  Popular this week
                </span>
              </div>
              <div className="mk-featured-grid">
                {featured.map((it) => (
                  <MkCard
                    key={it.id}
                    it={it}
                    featured
                    installing={installing}
                    onInstall={install}
                  />
                ))}
              </div>
            </>
          )}

          <div
            className="mk-section-hd"
            style={{ marginTop: showFeatured ? 28 : 0 }}
          >
            <h3 className="mk-section-h">
              {kind === 'all' ? 'All' : KIND_LABEL[kind] + 's'}
              {cat !== 'All' && <span className="mk-section-h-sub"> · {cat}</span>}
            </h3>
            <span className="sub" style={{ fontSize: 13 }}>
              {rest.length} {rest.length === 1 ? 'item' : 'items'}
            </span>
          </div>
          <div className="card-grid">
            {rest.map((it) => (
              <MkCard key={it.id} it={it} installing={installing} onInstall={install} />
            ))}
          </div>
          {rest.length === 0 && (
            <div className="empty">
              <Icon name="search" size={22} style={{ color: 'var(--fg-faint)' }} />
              <div style={{ fontSize: 14, color: 'var(--heading)', marginTop: 10 }}>
                Nothing matches that.
              </div>
              <div className="sub" style={{ fontSize: 13 }}>
                Try a different category or broaden your search.
              </div>
            </div>
          )}
        </div>
      </div>

      {addOpen && <AddFromSourceModal onClose={() => setAddOpen(false)} toast={toast} />}
    </div>
  )
}
