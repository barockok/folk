import { useState } from 'react'
import { Icon } from '../components/icons'
import { useUIStore } from '../stores/useUIStore'
import { INITIAL_SKILLS, UISkill } from '../data'

export function SkillsPage() {
  const toast = useUIStore((s) => s.toast)
  const [skills, setSkills] = useState<UISkill[]>(INITIAL_SKILLS)
  const [query, setQuery] = useState('')
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)

  const filtered = skills.filter(
    (s) =>
      !query.trim() ||
      s.name.toLowerCase().includes(query.toLowerCase()) ||
      s.desc.toLowerCase().includes(query.toLowerCase())
  )

  const onDrop = (toId: string) => {
    if (!dragId || dragId === toId) return
    setSkills((prev) => {
      const copy = [...prev]
      const fromIdx = copy.findIndex((s) => s.id === dragId)
      const toIdx = copy.findIndex((s) => s.id === toId)
      const [m] = copy.splice(fromIdx, 1)
      copy.splice(toIdx, 0, m)
      return copy
    })
    setDragId(null)
    setOverId(null)
    toast({ kind: 'ok', text: 'Reordered' })
  }

  const toggle = (id: string) =>
    setSkills((prev) => prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)))

  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <div className="eyebrow" style={{ marginBottom: 8 }}>Agent</div>
          <h1 className="h1">Skills</h1>
          <div className="sub">
            Named behaviors Claude will follow when a trigger matches. Drag to reorder — the first
            match wins.
          </div>
        </div>
        <button className="btn btn-primary">
          <Icon name="plus" size={14} /> New skill
        </button>
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
        <div className="segmented">
          <button className="on">All</button>
          <button>Yours</button>
          <button>Installed</button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.map((s) => (
          <div
            key={s.id}
            className={
              'skill-row' +
              (dragId === s.id ? ' dragging' : '') +
              (overId === s.id && dragId !== s.id ? ' drop-target' : '')
            }
            draggable
            onDragStart={() => setDragId(s.id)}
            onDragOver={(e) => {
              e.preventDefault()
              setOverId(s.id)
            }}
            onDragLeave={() => setOverId(null)}
            onDrop={() => onDrop(s.id)}
            onDragEnd={() => {
              setDragId(null)
              setOverId(null)
            }}
          >
            <div className="skill-handle">
              <Icon name="drag" size={14} />
            </div>
            <div className="skill-body">
              <div className="skill-title">
                {s.name}
                {s.author === 'you' && <span className="badge badge-ac">Yours</span>}
                {s.author === 'anthropic' && <span className="badge badge-magenta">Anthropic</span>}
                {s.author === 'community' && <span className="badge">Community</span>}
              </div>
              <div className="skill-desc">{s.desc}</div>
              <div
                style={{
                  marginTop: 6,
                  fontSize: 12,
                  color: 'var(--fg-faint)',
                  fontFamily: 'var(--ff-mono)',
                }}
              >
                <Icon name="zap" size={11} /> triggers on: {s.trigger}
              </div>
            </div>
            <div
              className={'switch' + (s.enabled ? ' on' : '')}
              onClick={() => toggle(s.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  toggle(s.id)
                }
              }}
            />
            <button className="btn btn-icon btn-sm btn-plain">
              <Icon name="more" size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
