import { useState } from 'react'
import { useSessions } from '../hooks/useSessions'
import { useSessionStore } from '../stores/useSessionStore'
import { HistoryRail } from './sessions/HistoryRail'
import { Conversation } from './sessions/Conversation'
import { Composer } from './sessions/Composer'
import { TodoPanel } from './sessions/TodoPanel'
import { SessionsEmpty } from './sessions/SessionsEmpty'
import { SessionSetup } from '../onboarding/SessionSetup'
import { loadDefaultSessionConfig } from '../lib/defaultSessionConfig'
import { useProfileStore } from '../stores/useProfileStore'
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
  const { sessions, activeId, setActive, create, delete: del, rename, send, cancel } = useSessions()
  // A draft is a configured-but-unsent session — purely renderer-side, never
  // persisted to SQLite, never visible in the sidebar. The user clicks "new"
  // → we synthesize a Session shape from the stored defaults, render the
  // hero composer against it, and only when they actually submit does it
  // become a real session via window.folk.sessions.create.
  const [draft, setDraft] = useState<{ session: Session; config: SessionConfig } | null>(null)
  const active = draft?.session ?? sessions.find((s) => s.id === activeId) ?? null
  const [needsSetup, setNeedsSetup] = useState(false)
  const messages = useSessionStore((s) =>
    active ? s.messages[active.id] ?? EMPTY_MESSAGES : EMPTY_MESSAGES
  )
  const isStreaming = useSessionStore((s) =>
    active ? s.streamingSessions.has(active.id) : false
  )
  const profileName = useProfileStore((s) => s.profile?.nickname?.trim() || '')
  // Hero composer mode: session is configured but the user hasn't sent the
  // first turn yet (no persisted messages, nothing streaming). Mirrors
  // Claude's Cowork canvas — center the composer with a greeting until the
  // conversation has content to anchor the scroll view.
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

  async function handleLaunch(config: SessionConfig) {
    // Launching from SessionSetup means the user picked the model/folder
    // explicitly. Stage as a draft so the same "doesn't exist until first
    // send" rule applies.
    stageDraft(config)
    setNeedsSetup(false)
  }

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

  async function handleNew() {
    const def = loadDefaultSessionConfig()
    if (def && def.modelId && def.workingDir) {
      stageDraft({
        modelId: def.modelId,
        workingDir: def.workingDir,
        flags: def.flags,
        permissionMode: def.permissionMode,
        incognito: def.incognito,
        enabledMcpIds: def.enabledMcpIds ?? null
      })
      setNeedsSetup(false)
      return
    }
    setActive(null)
    setDraft(null)
    setNeedsSetup(true)
  }

  function handleConfigureNew() {
    setActive(null)
    setDraft(null)
    setNeedsSetup(true)
  }

  // Send wrapper that promotes the draft into a real persisted session on the
  // first submit. After this returns, `active` flips from the synthetic draft
  // to the real session pulled from `sessions` (created by useSessions.create
  // upserting the row), and the sidebar shows it for the first time.
  async function handleSend(text: string, atts?: Attachment[]) {
    if (draft) {
      const real = await create(draft.config)
      setDraft(null)
      await send(real.id, text, atts)
      return
    }
    if (!active) return
    await send(active.id, text, atts)
  }

  // Absorb model/permission tweaks made against a draft into the staged
  // config + synthesized Session so they survive the eventual create call.
  function patchDraft(patch: Partial<Session>) {
    setDraft((prev) => {
      if (!prev) return prev
      return {
        session: { ...prev.session, ...patch, updatedAt: Date.now() },
        config: {
          ...prev.config,
          modelId: patch.modelId ?? prev.config.modelId,
          permissionMode: patch.permissionMode ?? prev.config.permissionMode,
          incognito: patch.incognito ?? prev.config.incognito,
          enabledMcpIds: patch.enabledMcpIds ?? prev.config.enabledMcpIds
        }
      }
    })
  }

  return (
    <div className="sess-wrap">
      <HistoryRail
        sessions={sessions}
        activeId={activeId}
        onPick={(id) => { setActive(id); setDraft(null); setNeedsSetup(false) }}
        onDelete={del}
        onRename={async (id, title) => { await rename(id, title) }}
        onNew={handleNew}
      />
      <div className={`sess-main${isFresh ? ' is-fresh' : ''}`}>
        {needsSetup ? (
          <SessionSetup
            onLaunch={handleLaunch}
            onCancel={() => setNeedsSetup(false)}
          />
        ) : active ? (
          isFresh ? (
            <div className="sess-hero">
              <h1 className="sess-hero-title">{greeting}</h1>
              <Composer
                session={active}
                onSend={handleSend}
                onCancel={() => cancel(active.id)}
                onConfigureNew={handleConfigureNew}
                onDraftPatch={patchDraft}
              />
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
                onConfigureNew={handleConfigureNew}
                onDraftPatch={patchDraft}
              />
            </>
          )
        ) : (
          <SessionsEmpty
            hasSessions={sessions.length > 0}
            onNew={handleNew}
          />
        )}
      </div>
      {!needsSetup && !isFresh && <TodoPanel session={active} />}
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
