// TweaksPanel.tsx — minimal tweaks surface (Task 34)
// Per CLAUDE.md: dark mode, density, replay onboarding only.
import { useEffect, useState } from 'react'
import { useUIStore } from '../stores/useUIStore'
import { useSessionStore } from '../stores/useSessionStore'
import { useUpdateStore } from '../stores/useUpdateStore'
import { Icon } from './icons'

const IS_DEV = import.meta.env.DEV

export function TweaksPanel() {
  const [appVersion, setAppVersion] = useState<string>('')
  useEffect(() => {
    let cancelled = false
    void window.folk.app.version().then((v) => {
      if (!cancelled) setAppVersion(v)
    })
    return () => { cancelled = true }
  }, [])

  const theme = useUIStore((s) => s.theme)
  const density = useUIStore((s) => s.density)
  const setTheme = useUIStore((s) => s.setTheme)
  const setDensity = useUIStore((s) => s.setDensity)
  const setForceOnboarding = useUIStore((s) => s.setForceOnboarding)
  const toast = useUIStore((s) => s.toast)
  const activeSessionId = useSessionStore((s) => s.activeId)

  const replayOnboarding = () => {
    localStorage.removeItem('folk.onboarded')
    location.reload()
  }

  const simulateBlankOnboarding = () => {
    setForceOnboarding(true)
  }

  const simulateUpdate = () => {
    const upd = useUpdateStore.getState()
    upd.reset()
    upd.setChecking()
    const fakeVersion = '0.99.0-sim'
    setTimeout(() => upd.setAvailable(fakeVersion), 600)
    let pct = 0
    const tick = () => {
      pct = Math.min(100, pct + 8 + Math.random() * 6)
      upd.setProgress(Math.round(pct))
      if (pct < 100) setTimeout(tick, 220)
      else setTimeout(() => upd.setDownloaded(fakeVersion), 400)
    }
    setTimeout(tick, 1000)
    toast({ kind: 'info', text: 'Simulating update — watch the bottom-right card' })
  }

  const simulateThinking = () => {
    if (!activeSessionId) {
      toast({ kind: 'err', text: 'Open a session first' })
      return
    }
    const store = useSessionStore.getState()
    store.markStreaming(activeSessionId)
    const lines = [
      'Looking at the request — user wants a simulated thinking trace.',
      'Breaking it down: stream tokens in chunks so the live cursor stays visible.',
      'Plan: emit ~12 chunks over 6 seconds, ramp speed so the tail keeps moving.',
      'Edge cases: cancel mid-stream if the session unmounts; cleanup timer.',
      'Drafting a few longer paragraphs to exercise the scroll fade and auto-scroll.',
      'The ThinkingAvatar component pins scrollTop to scrollHeight while live=true,',
      'so each appended chunk should keep the latest token in view.',
      'Once the simulated thought finalizes, hovering should keep the popover open',
      'with a 220ms delay close — verify cross-gap travel works without flicker.',
      'Done. Marking idle and stopping the chunker.'
    ]
    let i = 0
    const tick = () => {
      if (i >= lines.length) {
        useSessionStore.getState().markIdle(activeSessionId)
        return
      }
      const chunk = lines[i] + '\n'
      useSessionStore.getState().appendThinking({
        sessionId: activeSessionId,
        text: chunk
      })
      i++
      setTimeout(tick, 380 + Math.random() * 180)
    }
    tick()
    toast({ kind: 'info', text: 'Simulating thinking — hover the avatar' })
  }

  const copySessionId = async () => {
    if (!activeSessionId) return
    try {
      await navigator.clipboard.writeText(activeSessionId)
      toast({ kind: 'ok', text: 'Session id copied' })
    } catch {
      toast({ kind: 'err', text: 'Copy failed' })
    }
  }

  return (
    <div className="tweaks-panel">
      {/* Dark mode */}
      <div className="tweaks-row">
        <div className="tweaks-row-label">
          <Icon name="settings" size={13} />
          <span>Dark mode</span>
        </div>
        <button
          role="switch"
          aria-checked={theme === 'dark'}
          className="tweaks-toggle"
          data-on={theme === 'dark' ? '1' : '0'}
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        >
          <i />
        </button>
      </div>

      {/* Density */}
      <div className="tweaks-row">
        <div className="tweaks-row-label">
          <Icon name="layers" size={13} />
          <span>Density</span>
        </div>
        <div className="segmented" style={{ fontSize: 12 }}>
          <button
            className={density === 'compact' ? 'on' : ''}
            onClick={() => setDensity('compact')}
          >
            Compact
          </button>
          <button
            className={density === 'regular' ? 'on' : ''}
            onClick={() => setDensity('regular')}
          >
            Regular
          </button>
        </div>
      </div>

      {/* Dev — Session id */}
      {IS_DEV && (
      <div className="tweaks-row tweaks-row--sep" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
        <div className="tweaks-row-label" style={{ justifyContent: 'space-between' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icon name="terminal" size={13} />
            <span>Session id</span>
          </span>
          <span
            style={{
              fontSize: 9,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--fg-faint)'
            }}
          >
            dev
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'var(--bg-sub)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-sm)',
            padding: '6px 8px'
          }}
        >
          <code
            style={{
              flex: 1,
              fontFamily: 'var(--ff-mono)',
              fontSize: 11,
              color: activeSessionId ? 'var(--body)' : 'var(--fg-faint)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
            title={activeSessionId ?? ''}
          >
            {activeSessionId ?? 'no active session'}
          </code>
          <button
            type="button"
            className="btn btn-plain"
            disabled={!activeSessionId}
            onClick={copySessionId}
            style={{ padding: '2px 6px' }}
            title="Copy session id"
          >
            <Icon name="copy" size={12} />
          </button>
        </div>
      </div>
      )}

      {/* Dev — Simulate blank onboarding */}
      {IS_DEV && (
      <div className="tweaks-row">
        <button
          className="btn btn-plain"
          style={{ fontSize: 12, width: '100%', justifyContent: 'flex-start', gap: 6 }}
          onClick={simulateBlankOnboarding}
        >
          <Icon name="wand" size={13} />
          Simulate blank onboarding
          <span
            style={{
              marginLeft: 'auto',
              fontSize: 9,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--fg-faint)'
            }}
          >
            dev
          </span>
        </button>
      </div>
      )}

      {/* Dev — Simulate thinking */}
      {IS_DEV && (
      <div className="tweaks-row">
        <button
          className="btn btn-plain"
          style={{ fontSize: 12, width: '100%', justifyContent: 'flex-start', gap: 6 }}
          onClick={simulateThinking}
        >
          <Icon name="sparkles" size={13} />
          Simulate thinking
          <span
            style={{
              marginLeft: 'auto',
              fontSize: 9,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--fg-faint)'
            }}
          >
            dev
          </span>
        </button>
      </div>
      )}

      {/* Dev — Simulate update flow */}
      {IS_DEV && (
      <div className="tweaks-row">
        <button
          className="btn btn-plain"
          style={{ fontSize: 12, width: '100%', justifyContent: 'flex-start', gap: 6 }}
          onClick={simulateUpdate}
        >
          <Icon name="refresh" size={13} />
          Simulate update
          <span
            style={{
              marginLeft: 'auto',
              fontSize: 9,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--fg-faint)'
            }}
          >
            dev
          </span>
        </button>
      </div>
      )}

      {/* Check for updates */}
      <div className="tweaks-row">
        <button
          className="btn btn-plain"
          style={{ fontSize: 12, width: '100%', justifyContent: 'flex-start', gap: 6 }}
          onClick={async () => {
            const res = await window.folk.updater.check()
            if (!res.ok) {
              toast({ kind: 'err', text: res.error ?? 'Update check failed' })
            } else if (!res.version) {
              toast({ kind: 'info', text: 'You are up to date' })
            }
          }}
        >
          <Icon name="refresh" size={13} />
          Check for updates
        </button>
      </div>

      {/* Replay onboarding */}
      <div className="tweaks-row">
        <button
          className="btn btn-plain"
          style={{ fontSize: 12, width: '100%', justifyContent: 'flex-start', gap: 6 }}
          onClick={replayOnboarding}
        >
          <Icon name="refresh" size={13} />
          Replay first-run onboarding
        </button>
      </div>

      {/* Version */}
      <div className="tweaks-row tweaks-row--sep" style={{ justifyContent: 'space-between' }}>
        <div className="tweaks-row-label">
          <Icon name="info" size={13} />
          <span>folk</span>
        </div>
        <code style={{
          fontFamily: 'var(--ff-mono)',
          fontSize: 11,
          color: 'var(--fg-faint)'
        }}>
          {appVersion ? `v${appVersion}` : '—'}
        </code>
      </div>
    </div>
  )
}
