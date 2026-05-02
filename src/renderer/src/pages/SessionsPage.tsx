import { useEffect, useState, startTransition } from 'react'
import { useSessions } from '../hooks/useSessions'
import { useSessionStore } from '../stores/useSessionStore'
import { useProviders } from '../hooks/useProviders'
import { useUIStore } from '../stores/useUIStore'
import { HistoryRail } from './sessions/HistoryRail'
import { Conversation } from './sessions/Conversation'
import { Composer } from './sessions/Composer'
import { TodoPanel } from './sessions/TodoPanel'
import { HeroConfigBar } from './sessions/HeroConfigBar'
import {
  loadDefaultSessionConfig,
  saveDefaultSessionConfig
} from '../lib/defaultSessionConfig'
import { useProfileStore } from '../stores/useProfileStore'
import { Icon } from '../components/icons'
import type { Attachment, ChatMessage, Session, SessionConfig } from '@shared/types'

// Stable empty array — returning `[]` from a Zustand selector triggers
// "Maximum update depth exceeded" because each call yields a new ref.
const EMPTY_MESSAGES: ChatMessage[] = []

const HERO_GREETINGS = [
  "What's on your mind?",
  'What are we building today?',
  "Let's get something done.",
  'Where do you want to start?'
] as const

export function SessionsPage() {
  const { sessions, activeId, setActive, create, delete: del, rename, send, cancel, clear } = useSessions()
  const { enabledModels } = useProviders()
  const setPage = useUIStore((s) => s.setPage)
  // A draft is a configured-but-unsent session — purely renderer-side, never
  // persisted to SQLite, never visible in the sidebar. The user clicks "new"
  // → we synthesize a Session shape from the stored defaults, render the
  // hero composer against it, and only when they actually submit does it
  // become a real session via window.folk.sessions.create.
  const [draft, setDraft] = useState<{ session: Session; config: SessionConfig } | null>(null)
  const active = draft?.session ?? sessions.find((s) => s.id === activeId) ?? null
  const messages = useSessionStore((s) =>
    active ? s.messages[active.id] ?? EMPTY_MESSAGES : EMPTY_MESSAGES
  )
  const isStreaming = useSessionStore((s) =>
    active ? s.streamingSessions.has(active.id) : false
  )
  const profileName = useProfileStore((s) => s.profile?.nickname?.trim() || '')
  // Hero composer mode: session is configured but the user hasn't sent the
  // first turn yet (no persisted messages, nothing streaming).
  // `claudeStarted` gates against the brief moment between activating a
  // resumed session and its transcript hydrating, where messages.length is
  // momentarily 0 — without this gate the hero flashes on every switch into
  // an existing session.
  const isFresh =
    !!active && !active.claudeStarted && messages.length === 0 && !isStreaming
  // Stable greeting per session id — picking on each render would shuffle
  // letters as the user types into the composer.
  const greetingIdx = active
    ? Math.abs(hashString(active.id)) % HERO_GREETINGS.length
    : 0
  const greeting = profileName
    ? `Hey ${profileName.split(' ')[0]}, ${HERO_GREETINGS[greetingIdx].toLowerCase()}`
    : HERO_GREETINGS[greetingIdx]

  function stageDraft(config: SessionConfig) {
    const now = Date.now()
    const session: Session = {
      id: `draft-${crypto.randomUUID()}`,
      title: 'Untitled session',
      modelId: config.modelId,
      workingDir: config.workingDir,
      goal: config.goal ?? null,
      flags: config.flags ?? null,
      status: 'idle',
      claudeStarted: false,
      permissionMode: config.permissionMode ?? 'default',
      incognito: config.incognito ?? false,
      enabledMcpIds: config.enabledMcpIds ?? null,
      createdAt: now,
      updatedAt: now
    }
    setDraft({ session, config })
    setActive(null)
  }

  function handleNew() {
    // Always stage a draft. Defaults (saved or derived) populate the hero —
    // the user can tweak any field via the inline config bar before sending.
    const def = loadDefaultSessionConfig()
    const mostRecent = sessions
      .slice()
      .sort((a, b) => b.updatedAt - a.updatedAt)[0]
    stageDraft({
      modelId: def?.modelId ?? enabledModels[0]?.id ?? '',
      workingDir: def?.workingDir ?? mostRecent?.workingDir ?? '',
      flags: def?.flags,
      permissionMode: def?.permissionMode ?? 'default',
      incognito: def?.incognito ?? false,
      enabledMcpIds: def?.enabledMcpIds ?? null
    })
  }

  // Auto-stage a draft on mount whenever nothing is active. Replaces the old
  // SessionsEmpty splash — folk drops you straight into a hero composer so
  // the first action is always "type and send".
  useEffect(() => {
    if (active || draft) return
    handleNew()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, draft])

  // Send wrapper that promotes the draft into a real persisted session on the
  // first submit. After this returns, `active` flips from the synthetic draft
  // to the real session pulled from `sessions` (created by useSessions.create
  // upserting the row), and the sidebar shows it for the first time. We also
  // snapshot the chosen config to localStorage so the next "+" click reuses
  // the same folder/model/perms.
  async function handleSend(text: string, atts?: Attachment[]) {
    if (draft) {
      const real = await create(draft.config)
      saveDefaultSessionConfig({
        modelId: draft.config.modelId,
        workingDir: draft.config.workingDir,
        flags: draft.config.flags,
        permissionMode: draft.config.permissionMode,
        incognito: draft.config.incognito,
        enabledMcpIds: draft.config.enabledMcpIds ?? null
      })
      setDraft(null)
      await send(real.id, text, atts)
      return
    }
    if (!active) return
    await send(active.id, text, atts)
  }

  // Absorb config tweaks made against a draft into the staged config + the
  // synthesized Session so they survive the eventual create call.
  function patchDraft(patch: Partial<Session>) {
    setDraft((prev) => {
      if (!prev) return prev
      return {
        session: { ...prev.session, ...patch, updatedAt: Date.now() },
        config: {
          ...prev.config,
          modelId: patch.modelId ?? prev.config.modelId,
          workingDir: patch.workingDir ?? prev.config.workingDir,
          goal: patch.goal === null ? undefined : patch.goal ?? prev.config.goal,
          flags: patch.flags === null ? undefined : patch.flags ?? prev.config.flags,
          permissionMode: patch.permissionMode ?? prev.config.permissionMode,
          incognito: patch.incognito ?? prev.config.incognito,
          enabledMcpIds:
            patch.enabledMcpIds !== undefined
              ? patch.enabledMcpIds
              : prev.config.enabledMcpIds
        }
      }
    })
  }

  const hasProvider = enabledModels.length > 0
  const draftReady = !!active && (!isFresh || (!!active.modelId && !!active.workingDir))

  return (
    <div className="sess-wrap">
      <HistoryRail
        sessions={sessions}
        activeId={activeId}
        onPick={(id) => { startTransition(() => { setActive(id); setDraft(null) }) }}
        onDelete={del}
        onRename={async (id, title) => { await rename(id, title) }}
        onNew={handleNew}
        onCancel={cancel}
      />
      <div className={`sess-main${isFresh ? ' is-fresh' : ''}`}>
        {isFresh && <div className="sess-aurora-btm" aria-hidden="true" />}
        {active && (
          isFresh ? (
            <div className="sess-hero">
              <h1 className="sess-hero-title">{greeting}</h1>
              {!hasProvider ? (
                <div className="sess-hero-cta">
                  <div className="sess-hero-cta-icon"><Icon name="cpu" size={20} /></div>
                  <div className="sess-hero-cta-body">
                    <div className="sess-hero-cta-title">Configure a provider to start</div>
                    <div className="sess-hero-cta-sub">
                      Add an Anthropic, OpenRouter, or custom provider key, then enable a model.
                    </div>
                  </div>
                  <button className="btn btn-primary" onClick={() => setPage('model')}>
                    Open Models
                  </button>
                </div>
              ) : (
                <>
                  <Composer
                    session={active}
                    onSend={handleSend}
                    onCancel={() => cancel(active.id)}
                    onClear={active.id.startsWith('draft-') ? undefined : () => clear(active.id)}
                    onDraftPatch={patchDraft}
                  />
                  <HeroConfigBar
                    session={active}
                    onPatch={patchDraft}
                  />
                </>
              )}
            </div>
          ) : (
            <>
              <div className="sess-body-wrap">
                <Conversation key={active.id} session={active} />
              </div>
              <Composer
                session={active}
                onSend={handleSend}
                onCancel={() => cancel(active.id)}
                onDraftPatch={patchDraft}
              />
            </>
          )
        )}
      </div>
      {!isFresh && draftReady && <TodoPanel session={active} />}
    </div>
  )
}

// Cheap deterministic hash so the greeting stays put across renders while
// still varying between sessions. djb2 — collisions are fine here.
function hashString(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i)
  return h
}
