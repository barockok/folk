import { useEffect, useMemo, useState } from 'react'
import { Icon } from '../components/icons'
import { useSessionStore } from '../stores/useSessionStore'
import type { DiscoveredSkill } from '@shared/types'

type ScopeFilter = 'all' | 'user' | 'project' | 'plugin'

// Plugin skills are namespaced as "<plugin>:<name>" — split for cleaner card
// titles. Non-plugin skills pass through unchanged.
function localName(s: DiscoveredSkill): string {
  if (s.scope === 'plugin' && s.plugin && s.name.startsWith(`${s.plugin}:`)) {
    return s.name.slice(s.plugin.length + 1)
  }
  return s.name
}

function initials(s: DiscoveredSkill): string {
  const n = localName(s).replace(/[^a-zA-Z0-9]/g, '')
  return (n.slice(0, 2) || '·').toUpperCase()
}

export function SkillsPage() {
  const activeId = useSessionStore((s) => s.activeId)
  const sessions = useSessionStore((s) => s.sessions)
  const activeWd = useMemo(
    () => sessions.find((x) => x.id === activeId)?.workingDir ?? null,
    [sessions, activeId]
  )

  const [skills, setSkills] = useState<DiscoveredSkill[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<ScopeFilter>('all')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void window.folk.discover.skills(activeWd ?? undefined).then((list) => {
      if (!cancelled) {
        setSkills(list)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [activeWd])

  const counts = useMemo(() => {
    const c = { all: skills.length, user: 0, project: 0, plugin: 0 }
    for (const s of skills) c[s.scope]++
    return c
  }, [skills])

  const filtered = skills.filter((s) => {
    if (scope !== 'all' && s.scope !== scope) return false
    const q = query.trim().toLowerCase()
    if (!q) return true
    return (
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      (s.plugin?.toLowerCase().includes(q) ?? false)
    )
  })

  const SCOPES: { id: ScopeFilter; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: counts.all },
    { id: 'user', label: 'User', count: counts.user },
    { id: 'project', label: 'Project', count: counts.project },
    { id: 'plugin', label: 'Plugin', count: counts.plugin }
  ]

  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <div className="eyebrow" style={{ marginBottom: 8 }}>Agent</div>
          <h1 className="h1">Skills</h1>
          <div className="sub">
            Loaded from <code>~/.claude/skills</code>{activeWd ? <>, <code>{activeWd}/.claude/skills</code></> : null}, and <code>skills/</code> in installed plugins.
          </div>
        </div>
      </div>

      <div className="toolbar" style={{ gap: 8 }}>
        <div className="search" style={{ flex: 1 }}>
          <Icon name="search" size={14} className="search-ic" />
          <input
            className="input"
            placeholder="Search skills"
            value={query}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="mk-kind-tabs" style={{ marginTop: 4 }}>
        {SCOPES.map((s) => (
          <button
            key={s.id}
            className={'mk-kind-tab' + (scope === s.id ? ' on' : '')}
            onClick={() => setScope(s.id)}
            disabled={s.count === 0 && s.id !== 'all'}
          >
            <span>{s.label}</span>
            <span className="mk-kind-count">{s.count}</span>
          </button>
        ))}
      </div>

      {loading && <div className="sub" style={{ marginTop: 16 }}>Scanning…</div>}
      {!loading && filtered.length === 0 && (
        <div className="empty" style={{ marginTop: 16 }}>
          <Icon name="sparkles" size={22} style={{ color: 'var(--fg-faint)' }} />
          <div style={{ fontSize: 14, color: 'var(--heading)', marginTop: 10 }}>
            {skills.length === 0 ? 'No skills found on disk.' : 'Nothing matches that filter.'}
          </div>
          {skills.length === 0 && (
            <div className="sub" style={{ fontSize: 13 }}>
              Drop a SKILL.md into <code>~/.claude/skills/&lt;name&gt;/</code> or install a plugin that ships skills.
            </div>
          )}
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="card-grid" style={{ marginTop: 16 }}>
          {filtered.map((s) => (
            <SkillCard key={s.id} s={s} />
          ))}
        </div>
      )}
    </div>
  )
}

function SkillCard({ s }: { s: DiscoveredSkill }) {
  return (
    <div className="mk-card">
      <div className="mk-card-hd">
        <div className="mk-ic mk-ic-skill">{initials(s)}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="mk-name trunc" title={s.name}>{localName(s)}</div>
          <div className="mk-author trunc">
            {s.scope === 'plugin' && (
              <span className="mk-kind-pill">
                <Icon name="puzzle" size={10} />
                {s.plugin ?? 'plugin'}
              </span>
            )}
            {s.scope === 'project' && <span className="badge badge-ac">Project</span>}
            {s.scope === 'user' && <span className="badge">User</span>}
          </div>
        </div>
      </div>
      <div className="mk-desc skill-card-desc">
        {s.description || <em>No description</em>}
      </div>
      <div className="mk-meta">
        <Icon name="zap" size={11} style={{ color: 'var(--fg-faint)', flex: 'none' }} />
        <span
          className="trunc tnum"
          title={s.path}
          style={{
            fontFamily: 'var(--ff-mono)',
            fontSize: 11,
            color: 'var(--fg-faint)',
            minWidth: 0,
            flex: 1
          }}
        >
          {s.path}
        </span>
      </div>
    </div>
  )
}
