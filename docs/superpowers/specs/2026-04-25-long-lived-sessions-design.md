# Long-lived SDK sessions in AgentManager

**Status:** approved 2026-04-25
**Baseline tag:** `pre-long-lived-sessions` (commit `b97adb9`)
**Touches:** `src/main/agent-manager.ts` only.

## Goal

Replace folk's per-turn `query({ prompt: text })` spawn with one persistent `query({ prompt: asyncIterable })` per active folk Session. After the first turn, subsequent turns reuse the same `node cli.js` child process — eliminating spawn cost (~100–500ms) and getting cached system-prompt reuse.

The current `Session.claudeStarted` + `resume` machinery stays — it now governs whether a *cold* lazy-start uses `sessionId` (first ever) or `resume` (any cold start after the first).

## Non-goals

- Migrating to `unstable_v2_*` SDK APIs. Pattern 2 from the memory doc is strictly better when v2 graduates; we'll swap then.
- User-facing settings for idle timeout or hot-session cap. Hardcoded constants for now.
- Per-turn interrupt. SDK v1 doesn't expose one; cancel keeps killing the child.
- Instrumentation / dev HUD. Win is structural and obvious; baseline is captured by the git tag.

## Architecture

`AgentManager` swaps `#streams: Map<sessionId, { abort }>` for `#live: Map<sessionId, LiveSession>`.

```ts
interface LiveSession {
  push: (msg: SDKUserMessage) => void
  close: () => void
  abort: AbortController
  pump: Promise<void>
  idleTimer: NodeJS.Timeout | null
  turnDone: (() => void) | null
  turnError: ((e: Error) => void) | null
  streamedMessages: Set<string>   // moved from manager → per-session
  lastUsedAt: number              // for LRU eviction
}
```

Constants:

```ts
const IDLE_MS = 5 * 60_000
const MAX_LIVE = 4
const TEARDOWN_GRACE_MS = 2_000
```

### `#ensureLive(session): LiveSession`

1. Return cached `LiveSession` if present (and bump `lastUsedAt`).
2. If `#live.size >= MAX_LIVE`, evict the LRU entry: `void this.#teardown(lruId, 'lru')` (fire-and-forget — don't wait for the dying session to drain before starting the new one).
3. Build `envOverlay`, `mcpMap` exactly like today's `sendMessage` does.
4. Pick continuity once: `session.claudeStarted ? { resume: session.id } : { sessionId: session.id }`.
5. Construct queue-backed async generator + `push`/`close` closures.
6. Call `query({ prompt: prompt(), options: { ...envOverlay+mcp+cwd+model+systemPrompt+extraArgs+abortController, includePartialMessages: true, ...continuity } })`.
7. Spawn the pump (see below). Store `LiveSession` in `#live`. Return it.

### Pump

```ts
const pump = (async () => {
  try {
    for await (const msg of q) this.#dispatchMessage(sessionId, msg)
  } catch (err) {
    const agentErr = mapError(sessionId, err as Error & { code?: string })
    live.turnError?.(err as Error)
    this.emit('error', agentErr)
    this.db.updateSession(sessionId, {
      status: agentErr.code === 'cancelled' ? 'cancelled' : 'error'
    })
  } finally {
    if (live.idleTimer) clearTimeout(live.idleTimer)
    this.#live.delete(sessionId)
  }
})()
```

### `sendMessage`

```ts
const live = this.#ensureLive(session)
live.lastUsedAt = Date.now()
this.db.updateSession(sessionId, { status: 'running' })
if (live.idleTimer) { clearTimeout(live.idleTimer); live.idleTimer = null }

return new Promise<void>((resolve, reject) => {
  live.turnDone = () => { live.turnDone = null; live.turnError = null; resolve() }
  live.turnError = (e) => { live.turnDone = null; live.turnError = null; reject(e) }
  live.push({
    type: 'user',
    session_id: session.id,
    parent_tool_use_id: null,
    message: { role: 'user', content: text }
  })
})
```

### `#dispatchMessage` change

Existing branches stay. Modify the `result` branch:

```ts
} else if (m.type === 'result') {
  if (m.subtype === 'error' || m.is_error) {
    this.emit('error', mapError(sessionId, new Error(m.result ?? 'agent error')))
  }
  const live = this.#live.get(sessionId)
  if (live) {
    live.streamedMessages.clear()
    live.turnDone?.()
    this.db.updateSession(sessionId, { status: 'idle', claudeStarted: true })
    this.#armIdleTimer(sessionId)
  }
  this.emit('done', { sessionId })
}
```

`#streamedMessages` moves onto `LiveSession`; the manager-level set is removed. The `stream_event`/`message_start` branch and the `assistant`-snapshot dedup check both look it up via `this.#live.get(sessionId)?.streamedMessages` (no-op if the session has already been torn down between dispatch calls).

### `#armIdleTimer`

```ts
#armIdleTimer(sessionId: string) {
  const live = this.#live.get(sessionId); if (!live) return
  if (live.idleTimer) clearTimeout(live.idleTimer)
  live.idleTimer = setTimeout(() => this.#teardown(sessionId, 'idle'), IDLE_MS)
}
```

### `#teardown`

```ts
async #teardown(sessionId: string, reason: 'idle' | 'cancel' | 'delete' | 'dispose' | 'lru') {
  const live = this.#live.get(sessionId); if (!live) return
  this.#live.delete(sessionId)              // delete BEFORE awaiting — prevents races
  if (live.idleTimer) clearTimeout(live.idleTimer)

  if (reason === 'cancel' || reason === 'delete') {
    live.abort.abort()
  } else {
    live.close()                             // graceful: close iterable
    const grace = new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), TEARDOWN_GRACE_MS))
    const winner = await Promise.race([live.pump.then(() => 'done' as const), grace])
    if (winner === 'timeout') live.abort.abort()
  }
  await live.pump.catch(() => {})            // swallow — pump already emitted what it needed
}
```

### `cancel`, `deleteSession`, `dispose`

```ts
async cancel(sessionId: string) {
  await this.#teardown(sessionId, 'cancel')
  this.db.updateSession(sessionId, { status: 'cancelled' })
}

async deleteSession(id: string) {
  await this.#teardown(id, 'delete')
  this.db.deleteSession(id)
}

dispose() {
  const ids = [...this.#live.keys()]
  void Promise.all(ids.map((id) => this.#teardown(id, 'dispose')))
}
```

### Async generator

```ts
const queue: SDKUserMessage[] = []
let resolveNext: (() => void) | null = null
let closed = false
async function* prompt() {
  while (!closed) {
    if (queue.length === 0) await new Promise<void>((r) => (resolveNext = r))
    while (queue.length) yield queue.shift()!
  }
}
const push = (m: SDKUserMessage) => { queue.push(m); resolveNext?.(); resolveNext = null }
const close = () => { closed = true; resolveNext?.(); resolveNext = null }
```

## Data flow

**First turn (cold, never started):** `#ensureLive` spawns child with `{ sessionId: session.id }`; pump starts; user message pushed; events stream; `result` → `turnDone`, `claudeStarted=true`, idle timer armed. Pump stays open.

**Hot turn:** `#ensureLive` returns cached; user message pushed; first chunk arrives without spawn delay.

**Cold turn after reap or cancel:** `#ensureLive` spawns child with `{ resume: session.id }`; SDK reads transcript from disk; otherwise identical to hot turn (one-time spawn cost).

## Error & teardown matrix

| Trigger | Caller | Grace? | UI surface | In-flight turn |
|---|---|---|---|---|
| Idle 5 min | `#armIdleTimer` setTimeout | yes | none | n/a |
| `cancel(id)` | IPC handler | no — immediate abort | session = `cancelled` | promise rejects (AbortError) |
| `deleteSession(id)` | IPC handler | no | session removed | promise rejects, ignored |
| `dispose()` | main `before-quit` | yes, parallel | none | promises reject; renderer closing |
| Pump error | pump catch | n/a (already dead) | error event | `turnError(err)` rejects in-flight |

**Idempotency:** `#teardown` deletes from `#live` immediately; subsequent calls early-return.

**Race — `result` after teardown:** `#dispatchMessage`'s result branch already guards on `this.#live.get(sessionId)` before invoking `turnDone` and updating status.

**Race — `sendMessage` during teardown:** `#teardown` deletes from `#live` synchronously before awaiting `pump`. A new `sendMessage` runs `#ensureLive`, finds nothing, and lazy-starts a fresh child. The previous pump shuts down in the background.

## Migration concerns

- `claudeStarted` column stays. It tells `loadMessages()` whether a transcript file exists, and tells `#ensureLive` whether to use `sessionId` vs `resume`.
- `#streamedMessages` moves from manager scope to per-`LiveSession` scope. Multiple hot children would otherwise collide on assistant message ids and silently drop streamed deltas.
- `continuity` is now decided **once at lazy-start**, not per turn.

## Test plan

Manual (no unit tests — child-process integration):

1. **Hot path:** 3 sequential turns in one session → one `node cli.js` child (verify with `ps`); turns 2–3 have no spawn lag.
2. **Idle reap:** message → wait > 5 min → message; child dies (new PID), transcript continuity intact.
3. **Cancel + retry:** long message, cancel mid-stream, send again. Child respawns via `resume`; model has prior context.
4. **LRU cap:** 5 sessions, send in each in order. Session 1's child reaped when session 5 spawns; switching back cold-starts.
5. **Session switch:** A hot, switch to B, send in B, switch back to A within 5 min. A's child still alive (instant first chunk).
6. **App quit:** messages in 2 sessions, quit. No orphaned `cli.js`.
7. **External kill:** `kill -9 <pid>`; renderer gets error; next send respawns via `resume`.
8. **Cancel race:** fast message, cancel as response finishes. No crash; session lands in `idle` or `cancelled` cleanly.

Type-check (`npx tsc --noEmit`) + `npm run dev` smoke after each phase.

## Effort

~1 day. Risk lives in lifecycle edge cases (orphaned children, double-teardown, cancel/result races), not in the SDK call. The for-await dispatch logic is unchanged.
