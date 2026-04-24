import { useState, useMemo } from 'react'
import { Icon } from '../components/icons'
import { KEYBINDINGS } from '../data'

export function KeybindingsPage() {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return KEYBINDINGS
    return KEYBINDINGS.filter(
      (kb) =>
        kb.action.toLowerCase().includes(q) ||
        kb.keys.some((k) => k.toLowerCase().includes(q)) ||
        kb.scope.toLowerCase().includes(q)
    )
  }, [query])

  const grouped = useMemo(() => {
    const map = new Map<string, typeof KEYBINDINGS>()
    for (const kb of filtered) {
      if (!map.has(kb.scope)) map.set(kb.scope, [])
      map.get(kb.scope)!.push(kb)
    }
    return map
  }, [filtered])

  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <div className="eyebrow" style={{ marginBottom: 8 }}>Configure</div>
          <h1 className="h1">Keybindings</h1>
          <div className="sub">Keyboard shortcuts available across folk. Read-only in v0.</div>
        </div>
      </div>

      <div className="toolbar">
        <div className="search">
          <Icon name="search" size={14} className="search-ic" />
          <input
            className="input"
            placeholder="Search actions or keys…"
            value={query}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
            aria-label="Search keybindings"
          />
        </div>
      </div>

      {grouped.size === 0 && (
        <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--fg-faint)', fontSize: 14 }}>
          No keybindings match &ldquo;{query}&rdquo;
        </div>
      )}

      {[...grouped.entries()].map(([scope, rows]) => (
        <div key={scope} style={{ marginBottom: 32 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.07em',
              textTransform: 'uppercase',
              color: 'var(--body)',
              fontFamily: 'var(--ff-mono)',
              marginBottom: 8,
              paddingLeft: 2,
            }}
          >
            {scope}
          </div>
          <div
            style={{
              border: 'var(--hair) solid var(--border)',
              borderRadius: 'var(--r)',
              overflow: 'hidden',
            }}
          >
            <table className="kb-table">
              <thead>
                <tr>
                  <th>Action</th>
                  <th style={{ width: 160 }}>Keys</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((kb) => (
                  <tr key={kb.action}>
                    <td>{kb.action}</td>
                    <td>
                      <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        {kb.keys.map((k, i) => (
                          <kbd
                            key={i}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              minWidth: 22,
                              height: 22,
                              padding: '0 6px',
                              background: 'var(--bg-sub)',
                              border: 'var(--hair) solid var(--border)',
                              borderRadius: 5,
                              fontSize: 12,
                              fontFamily: 'var(--ff-mono)',
                              color: 'var(--heading)',
                              fontWeight: 500,
                              lineHeight: 1,
                            }}
                          >
                            {k}
                          </kbd>
                        ))}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}
