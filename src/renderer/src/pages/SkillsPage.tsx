import { useEffect, useMemo, useState } from 'react'
import { Icon } from '../components/icons'
import { useSessionStore } from '../stores/useSessionStore'
import type { DiscoveredSkill } from '@shared/types'

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

  const filtered = skills.filter(
    (s) =>
      !query.trim() ||
      s.name.toLowerCase().includes(query.toLowerCase()) ||
      s.description.toLowerCase().includes(query.toLowerCase())
  )

  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <div className="eyebrow" style={{ marginBottom: 8 }}>Agent</div>
          <h1 className="h1">Skills</h1>
          <div className="sub">
            Loaded from <code>~/.claude/skills</code>{activeWd ? <> and <code>{activeWd}/.claude/skills</code></> : null}.
          </div>
        </div>
      </div>

      <div className="toolbar">
        <div className="search">
          <Icon name="search" size={14} className="search-ic" />
          <input
            className="input"
            placeholder="Search skills"
            value={query}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {loading && <div className="sub">Scanning…</div>}
      {!loading && filtered.length === 0 && (
        <div className="sub">No skills found on disk.</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.map((s) => (
          <div key={s.id} className="skill-row">
            <div className="skill-body">
              <div className="skill-title">
                {s.name}
                {s.scope === 'project' ? (
                  <span className="badge badge-ac">Project</span>
                ) : (
                  <span className="badge">User</span>
                )}
              </div>
              <div className="skill-desc">{s.description || <em>No description</em>}</div>
              <div
                style={{
                  marginTop: 6,
                  fontSize: 12,
                  color: 'var(--fg-faint)',
                  fontFamily: 'var(--ff-mono)'
                }}
              >
                <Icon name="zap" size={11} /> {s.path}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
