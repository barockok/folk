import { useEffect, useRef, useState } from 'react'
import { Icon } from '../../components/icons'
import type { Session } from '@shared/types'



interface Props {
  session: Session
  onPatch: (patch: Partial<Session>) => void
}

// Hero-stage configuration chips. The session is a renderer-side draft —
// every change routes through `onPatch` which mutates the staged config so
// it survives the eventual `sessions:create` IPC on first send.
export function HeroConfigBar({ session, onPatch }: Props) {
  const [advOpen, setAdvOpen] = useState(false)
  const advRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!advOpen) return
    const handler = (e: MouseEvent) => {
      if (advRef.current && !advRef.current.contains(e.target as Node)) {
        setAdvOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [advOpen])

  async function pickFolder() {
    const picked = await window.folk.dialog.openFolder(session.workingDir || undefined)
    if (picked) onPatch({ workingDir: picked })
  }

  const folderName = session.workingDir
    ? session.workingDir.split('/').filter(Boolean).pop() ?? session.workingDir
    : 'Pick folder'

  return (
    <div className="hero-cfg">
      <div className="hero-cfg-row">
        <button
          type="button"
          className="hero-chip"
          onClick={pickFolder}
          title={session.workingDir || 'Pick a working folder'}
        >
          <Icon name="folder" size={13} />
          <span className="hero-chip-label">{folderName}</span>
        </button>

        <button
          type="button"
          className={`hero-chip${session.incognito ? ' on' : ''}`}
          onClick={() => onPatch({ incognito: !session.incognito })}
          title="Incognito skips loading user/project/plugin skills"
        >
          <Icon name="eyeOff" size={13} />
          <span className="hero-chip-label">{session.incognito ? 'Incognito on' : 'Incognito'}</span>
        </button>

        <div ref={advRef} style={{ position: 'relative' }}>
          <button
            type="button"
            className={`hero-chip${advOpen ? ' on' : ''}`}
            onClick={() => setAdvOpen((o) => !o)}
          >
            <Icon name="settings" size={13} />
            <span className="hero-chip-label">Advanced</span>
          </button>
          {advOpen && (
            <div className="hero-cfg-adv">
              <label className="hero-adv-field">
                <span className="hero-adv-label">Goal (optional)</span>
                <textarea
                  className="input"
                  rows={2}
                  value={session.goal ?? ''}
                  placeholder="Brief context for what you're working on"
                  onChange={(e) => onPatch({ goal: e.target.value || null })}
                />
              </label>
              <label className="hero-adv-field">
                <span className="hero-adv-label">Extra flags</span>
                <input
                  className="input mono"
                  value={session.flags ?? ''}
                  placeholder="--debug --verbose"
                  onChange={(e) => onPatch({ flags: e.target.value || null })}
                />
              </label>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
