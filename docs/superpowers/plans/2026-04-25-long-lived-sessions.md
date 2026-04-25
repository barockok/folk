# Long-lived SDK sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace per-turn `query({ prompt: text })` spawn in `AgentManager` with one persistent `query({ prompt: asyncIterable })` per active folk Session, eliminating the ~100–500ms spawn cost on every turn after the first.

**Architecture:** A `LiveSession` per folk Session holds a child `node cli.js` process kept alive via an async-generator-backed input queue. Subsequent `sendMessage` calls push onto the queue instead of spawning. Idle (5 min) and LRU (cap 4) reapers bound process count. Cancel still aborts the child; the next turn lazy-restarts via `resume`.

**Tech Stack:** TypeScript, Electron 35 main process, `@anthropic-ai/claude-agent-sdk` v1 (stable `query()` API), `EventEmitter`.

**Spec:** `docs/superpowers/specs/2026-04-25-long-lived-sessions-design.md`. Baseline tag: `pre-long-lived-sessions`.

**Notes for the engineer:**
- Single file: `src/main/agent-manager.ts`. Read it end-to-end before starting.
- No automated test harness exists for `AgentManager` (it's a child-process integration). Verification is `npx tsc --noEmit` after every task + manual smoke in `npm run dev` at the end.
- Don't restart Electron's dev server between tasks unless a task says so — main process changes don't HMR; you'll want a clean restart at the end.
- Folk uses Zustand selectors that must return stable refs. We're not touching the renderer, so this isn't a concern here, but don't get tempted to "improve" anything outside `agent-manager.ts`.

---

### Task 1: Add types, constants, and per-session state field

**Files:**
- Modify: `src/main/agent-manager.ts`

- [ ] **Step 1: Add `SDKUserMessage` to the SDK import**

Find the existing import at the top of the file:
```ts
import { query, AbortError, getSessionMessages } from '@anthropic-ai/claude-agent-sdk'
import type { McpServerConfig } from '@anthropic-ai/claude-agent-sdk'
```

Replace with:
```ts
import { query, AbortError, getSessionMessages } from '@anthropic-ai/claude-agent-sdk'
import type { McpServerConfig, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
```

- [ ] **Step 2: Add the `LiveSession` interface and constants**

Insert directly above `export class AgentManager extends EventEmitter {` (around line 131):

```ts
const IDLE_MS = 5 * 60_000
const MAX_LIVE = 4
const TEARDOWN_GRACE_MS = 2_000

interface LiveSession {
  push: (msg: SDKUserMessage) => void
  close: () => void
  abort: AbortController
  pump: Promise<void>
  idleTimer: NodeJS.Timeout | null
  turnDone: (() => void) | null
  turnError: ((e: Error) => void) | null
  streamedMessages: Set<string>
  lastUsedAt: number
}
```

- [ ] **Step 3: Replace the manager's `#streams` field with `#live` and remove the manager-level `#streamedMessages`**

Find:
```ts
export class AgentManager extends EventEmitter {
  #streams = new Map<string, { abort: AbortController }>()
```

Replace with:
```ts
export class AgentManager extends EventEmitter {
  #live = new Map<string, LiveSession>()
```

Find (around line 292):
```ts
  // Tracks which assistant messages were fully streamed (so we don't replay
  // the final 'assistant' snapshot and duplicate text in the UI).
  #streamedMessages = new Set<string>()
```

Delete those three lines. The dedup set is now per-`LiveSession`.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: errors about `#streams` references and `this.#streamedMessages` references — those are the call sites we're about to migrate. **Do not fix them in this task.** Note them so they're easy to find in the next tasks.

- [ ] **Step 5: Commit**

```bash
git add src/main/agent-manager.ts
git commit -m "refactor(agent-manager): scaffold LiveSession types and constants"
```

---

### Task 2: Implement async generator factory and `#ensureLive`

**Files:**
- Modify: `src/main/agent-manager.ts`

- [ ] **Step 1: Add the prompt-iterable factory as a private method**

Add this method inside the `AgentManager` class (place it just below the constructor for readability):

```ts
  #createPromptIterable(): {
    iterable: AsyncIterable<SDKUserMessage>
    push: (msg: SDKUserMessage) => void
    close: () => void
  } {
    const queue: SDKUserMessage[] = []
    let resolveNext: (() => void) | null = null
    let closed = false
    async function* iterable(): AsyncIterable<SDKUserMessage> {
      while (!closed) {
        if (queue.length === 0) {
          await new Promise<void>((r) => (resolveNext = r))
        }
        while (queue.length) yield queue.shift()!
      }
    }
    const push = (m: SDKUserMessage) => {
      queue.push(m)
      const r = resolveNext
      resolveNext = null
      r?.()
    }
    const close = () => {
      closed = true
      const r = resolveNext
      resolveNext = null
      r?.()
    }
    return { iterable: iterable(), push, close }
  }
```

- [ ] **Step 2: Add `#ensureLive` (without LRU eviction yet — that lands in Task 6)**

Add this method inside the `AgentManager` class. It centralizes everything that used to happen at the top of `sendMessage` (env, mcp, continuity, query):

```ts
  #ensureLive(session: Session): LiveSession {
    const existing = this.#live.get(session.id)
    if (existing) {
      existing.lastUsedAt = Date.now()
      return existing
    }

    const provider = this.#resolveProvider(session.modelId)

    const envOverlay: Record<string, string | undefined> = { ...process.env }
    if (provider.authMode !== 'claude-code') {
      envOverlay.ANTHROPIC_API_KEY = provider.apiKey
    } else {
      delete envOverlay.ANTHROPIC_API_KEY
    }
    if (provider.baseUrl) envOverlay.ANTHROPIC_BASE_URL = provider.baseUrl

    const mcpMap: Record<string, McpServerConfig> = {}
    for (const m of this.db.listMCPs().filter((x) => x.isEnabled)) {
      if (m.transport === 'stdio' && m.command) {
        mcpMap[m.name] = {
          type: 'stdio',
          command: m.command,
          args: m.args ?? [],
          env: m.env ?? undefined
        }
      }
    }

    const continuity = session.claudeStarted
      ? { resume: session.id }
      : { sessionId: session.id }

    const abort = new AbortController()
    const { iterable, push, close } = this.#createPromptIterable()

    const q = query({
      prompt: iterable,
      options: {
        cwd: session.workingDir,
        model: session.modelId,
        env: envOverlay,
        mcpServers: mcpMap,
        abortController: abort,
        includePartialMessages: true,
        systemPrompt: {
          type: 'preset',
          preset: 'claude_code',
          append: FOLK_PRESENTATION_PROMPT
        },
        extraArgs: this.#parseExtraArgs(session.flags),
        ...continuity
      }
    })

    const live: LiveSession = {
      push,
      close,
      abort,
      pump: Promise.resolve(),
      idleTimer: null,
      turnDone: null,
      turnError: null,
      streamedMessages: new Set(),
      lastUsedAt: Date.now()
    }

    live.pump = (async () => {
      try {
        for await (const msg of q) {
          this.#dispatchMessage(session.id, msg as unknown)
        }
      } catch (err) {
        const agentErr = mapError(session.id, err as Error & { code?: string })
        live.turnError?.(err as Error)
        this.emit('error', agentErr)
        this.db.updateSession(session.id, {
          status: agentErr.code === 'cancelled' ? 'cancelled' : 'error'
        })
      } finally {
        if (live.idleTimer) clearTimeout(live.idleTimer)
        this.#live.delete(session.id)
      }
    })()

    this.#live.set(session.id, live)
    return live
  }
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: same call-site errors as before (still in old `sendMessage` / `cancel` / `dispose` / `#dispatchMessage`). New code should compile clean.

- [ ] **Step 4: Commit**

```bash
git add src/main/agent-manager.ts
git commit -m "refactor(agent-manager): add prompt iterable factory and ensureLive"
```

---

### Task 3: Add `#armIdleTimer` and `#teardown`

**Files:**
- Modify: `src/main/agent-manager.ts`

- [ ] **Step 1: Add the idle timer**

Add inside the `AgentManager` class:

```ts
  #armIdleTimer(sessionId: string): void {
    const live = this.#live.get(sessionId)
    if (!live) return
    if (live.idleTimer) clearTimeout(live.idleTimer)
    live.idleTimer = setTimeout(() => {
      void this.#teardown(sessionId, 'idle')
    }, IDLE_MS)
  }
```

- [ ] **Step 2: Add `#teardown`**

Add inside the `AgentManager` class:

```ts
  async #teardown(
    sessionId: string,
    reason: 'idle' | 'cancel' | 'delete' | 'dispose' | 'lru'
  ): Promise<void> {
    const live = this.#live.get(sessionId)
    if (!live) return
    // Delete from the map BEFORE awaiting — a concurrent sendMessage that
    // arrives during teardown must not see the dying LiveSession; it should
    // lazy-start a fresh one.
    this.#live.delete(sessionId)
    if (live.idleTimer) {
      clearTimeout(live.idleTimer)
      live.idleTimer = null
    }

    if (reason === 'cancel' || reason === 'delete') {
      live.abort.abort()
    } else {
      live.close()
      const grace = new Promise<'timeout'>((r) =>
        setTimeout(() => r('timeout'), TEARDOWN_GRACE_MS)
      )
      const winner = await Promise.race([
        live.pump.then(() => 'done' as const),
        grace
      ])
      if (winner === 'timeout') live.abort.abort()
    }
    await live.pump.catch(() => {})
  }
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: same set of pre-existing call-site errors only.

- [ ] **Step 4: Commit**

```bash
git add src/main/agent-manager.ts
git commit -m "refactor(agent-manager): add idle timer and teardown lifecycle"
```

---

### Task 4: Migrate `sendMessage` to push onto the live iterable

**Files:**
- Modify: `src/main/agent-manager.ts`

- [ ] **Step 1: Replace `sendMessage`**

Find the entire current `sendMessage` method (lines ~187–269 — runs from `async sendMessage(` through the closing `}` of its `try/catch/finally`). Replace it with:

```ts
  async sendMessage(
    sessionId: string,
    text: string,
    _attachments?: Attachment[]
  ): Promise<void> {
    const session = this.db.getSession(sessionId)
    if (!session) throw new Error(`session ${sessionId} not found`)

    // Resolve provider here so config errors surface before we touch the
    // child process. #ensureLive resolves it again internally for env build.
    this.#resolveProvider(session.modelId)

    // LRU eviction: if we're at the cap and this session isn't already live,
    // evict the oldest live session. Fire-and-forget — the dying session
    // tears down in the background while we lazy-start the new one.
    if (!this.#live.has(sessionId) && this.#live.size >= MAX_LIVE) {
      let lruId: string | null = null
      let lruAt = Infinity
      for (const [id, ls] of this.#live) {
        if (ls.lastUsedAt < lruAt) {
          lruAt = ls.lastUsedAt
          lruId = id
        }
      }
      if (lruId) void this.#teardown(lruId, 'lru')
    }

    const live = this.#ensureLive(session)
    live.lastUsedAt = Date.now()

    if (live.idleTimer) {
      clearTimeout(live.idleTimer)
      live.idleTimer = null
    }
    this.db.updateSession(sessionId, { status: 'running' })

    return new Promise<void>((resolve, reject) => {
      live.turnDone = () => {
        live.turnDone = null
        live.turnError = null
        resolve()
      }
      live.turnError = (e) => {
        live.turnDone = null
        live.turnError = null
        reject(e)
      }
      live.push({
        type: 'user',
        session_id: session.id,
        parent_tool_use_id: null,
        message: { role: 'user', content: text }
      })
    })
  }
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: errors should now only remain in `cancel`, `deleteSession`, `dispose`, and `#dispatchMessage` (the `result` branch + `#streamedMessages` references).

- [ ] **Step 3: Commit**

```bash
git add src/main/agent-manager.ts
git commit -m "feat(agent-manager): sendMessage pushes onto long-lived iterable"
```

---

### Task 5: Update `#dispatchMessage` to use per-session state and signal turn completion

**Files:**
- Modify: `src/main/agent-manager.ts`

- [ ] **Step 1: Migrate the `stream_event` / `message_start` branch**

Find inside `#dispatchMessage`:
```ts
      if (ev.type === 'message_start' && ev.message?.id) {
        this.#streamedMessages.add(ev.message.id)
      } else if (ev.type === 'content_block_delta' && ev.delta) {
```

Replace with:
```ts
      if (ev.type === 'message_start' && ev.message?.id) {
        this.#live.get(sessionId)?.streamedMessages.add(ev.message.id)
      } else if (ev.type === 'content_block_delta' && ev.delta) {
```

- [ ] **Step 2: Migrate the `assistant`-snapshot dedup check**

Find:
```ts
    if (m.type === 'assistant' && m.message?.content) {
      // If we already streamed this message via stream_event, don't replay.
      const wasStreamed = m.message.id && this.#streamedMessages.has(m.message.id)
```

Replace the `wasStreamed` line with:
```ts
      const liveForDedup = this.#live.get(sessionId)
      const wasStreamed =
        m.message.id && liveForDedup?.streamedMessages.has(m.message.id)
```

- [ ] **Step 3: Replace the `result` branch**

Find:
```ts
    } else if (m.type === 'result') {
      if (m.subtype === 'error' || m.is_error) {
        this.emit('error', mapError(sessionId, new Error(m.result ?? 'agent error')))
      }
      this.#streamedMessages.clear()
      this.emit('done', { sessionId })
    }
```

Replace with:
```ts
    } else if (m.type === 'result') {
      if (m.subtype === 'error' || m.is_error) {
        this.emit('error', mapError(sessionId, new Error(m.result ?? 'agent error')))
      }
      const live = this.#live.get(sessionId)
      if (live) {
        live.streamedMessages.clear()
        this.db.updateSession(sessionId, {
          status: 'idle',
          claudeStarted: true
        })
        this.#armIdleTimer(sessionId)
        const done = live.turnDone
        live.turnDone = null
        live.turnError = null
        done?.()
      }
      this.emit('done', { sessionId })
    }
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: only `cancel`, `deleteSession`, `dispose` errors remain.

- [ ] **Step 5: Commit**

```bash
git add src/main/agent-manager.ts
git commit -m "feat(agent-manager): dispatch result via per-session turnDone"
```

---

### Task 6: Wire `cancel`, `deleteSession`, and `dispose` to `#teardown`

**Files:**
- Modify: `src/main/agent-manager.ts`

- [ ] **Step 1: Replace `cancel`**

Find:
```ts
  async cancel(sessionId: string): Promise<void> {
    const stream = this.#streams.get(sessionId)
    if (stream) {
      stream.abort.abort()
      this.#streams.delete(sessionId)
    }
    this.db.updateSession(sessionId, { status: 'cancelled' })
  }
```

Replace with:
```ts
  async cancel(sessionId: string): Promise<void> {
    await this.#teardown(sessionId, 'cancel')
    this.db.updateSession(sessionId, { status: 'cancelled' })
  }
```

- [ ] **Step 2: Replace `deleteSession`**

Find:
```ts
  async deleteSession(id: string): Promise<void> {
    const stream = this.#streams.get(id)
    if (stream) {
      stream.abort.abort()
      this.#streams.delete(id)
    }
    this.db.deleteSession(id)
  }
```

Replace with:
```ts
  async deleteSession(id: string): Promise<void> {
    await this.#teardown(id, 'delete')
    this.db.deleteSession(id)
  }
```

- [ ] **Step 3: Replace `dispose`**

Find:
```ts
  dispose(): void {
    for (const { abort } of this.#streams.values()) abort.abort()
    this.#streams.clear()
  }
```

Replace with:
```ts
  dispose(): void {
    const ids = [...this.#live.keys()]
    void Promise.all(ids.map((id) => this.#teardown(id, 'dispose')))
  }
```

- [ ] **Step 4: Type-check (must be clean)**

Run: `npx tsc --noEmit`
Expected: **zero errors.** If anything remains, search the file for `#streams` or `#streamedMessages` — there should be no references left.

- [ ] **Step 5: Commit**

```bash
git add src/main/agent-manager.ts
git commit -m "feat(agent-manager): cancel/delete/dispose route through teardown"
```

---

### Task 7: Manual smoke test in dev

**Files:** none (verification only).

**Setup notes for the engineer:**
- Run `npm run dev`. This launches Electron + Vite. Main-process changes don't HMR; if you change `agent-manager.ts` again, fully quit and re-run.
- To watch child processes: in another terminal, `watch -n 1 "ps -axo pid,etime,command | grep 'cli.js' | grep -v grep"`.
- The transcript is at `~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl` if you need to verify continuity.

- [ ] **Step 1: Hot-path test (no spawn between turns)**

In the running app, create a new session. Send three short messages back-to-back ("hi", "and?", "thanks"). In the `ps` terminal, confirm:
- Exactly one `cli.js` process appears after the first message.
- Its PID does NOT change between turns 2 and 3 (only `etime` grows).
- Subjective: turns 2 and 3 begin streaming with no perceptible "warm-up" pause.

- [ ] **Step 2: Cancel + retry test (respawn via resume)**

Send a message that will produce a long response. Click cancel mid-stream. Confirm in `ps` the child exits. Send another message. Confirm:
- A new `cli.js` PID appears.
- The model still has prior conversation context (ask a question that requires the earlier turns to answer).

- [ ] **Step 3: LRU cap test (cap = 4)**

Create five separate sessions. In each, in order from session 1 to session 5, send one short message and wait for completion. After session 5's turn finishes, in `ps`:
- Exactly four `cli.js` processes should be alive.
- Session 1's PID should be gone (it was the LRU).

Switch back to session 1 and send a message. Confirm a new PID spawns and the response references prior context (resume worked).

- [ ] **Step 4: Session-switch test (no teardown on switch)**

Create session A, send a message, wait for completion. Switch to session B (sidebar click), send a message. Switch back to session A within ~1 minute. Send a follow-up. Confirm:
- A's `cli.js` PID is unchanged from before the switch.
- A's follow-up streams instantly.

- [ ] **Step 5: App-quit test (no orphans)**

Create two sessions, send a message in each. Quit the app (`cmd+Q`). In `ps`:
- All `cli.js` processes for those sessions should exit within ~2 seconds.
- If any persist after 5 seconds, that's a bug — the dispose path is leaking.

- [ ] **Step 6: External-kill test (pump error recovery)**

Create a session, send a message, wait for completion. While it's idle (PID still alive), `kill -9 <pid>` from the terminal. Confirm in the renderer:
- An error toast/state appears (the in-flight turn promise rejected — though if you killed during idle there's no in-flight turn, so this is more "no crash").
- Send a new message. A fresh `cli.js` spawns; model has prior context (resume worked).

- [ ] **Step 7: Idle-reap test (optional, slow)**

Optional because it takes 5+ minutes. Send a message in a session, wait > 5 minutes without interacting with that session, confirm in `ps` that the child has exited. Send another message; confirm respawn + transcript continuity.

If you want a fast version: temporarily change `IDLE_MS = 5 * 60_000` to `IDLE_MS = 10_000` in `agent-manager.ts`, restart `npm run dev`, run the test, then revert and restart again. Don't commit the temporary value.

- [ ] **Step 8: Commit (only if you made any cleanup edits during testing)**

```bash
git status
# If anything is modified beyond the plan, review and commit. Otherwise skip.
```

---

### Task 8: Update memory doc and finalize

**Files:**
- Modify: `~/.claude/projects/-Users-barock-Code-folk/memory/sdk-long-lived-query.md`

- [ ] **Step 1: Mark the deferred decision as resolved**

Open the memory doc. Find this line:
```
**folk decision (2026-04-25):** defer. Spawn cost isn't biting users; `resume` gives functionally-equivalent memory continuity. Revisit if (a) per-turn latency becomes a real complaint, or (b) v2 API graduates from `@alpha`.
```

Replace with:
```
**folk decision (2026-04-25):** SHIPPED pattern 1 (AsyncIterable). Baseline before migration tagged as `pre-long-lived-sessions`. Revisit only if v2 API graduates from `@alpha` — pattern 2 is strictly better for cancellation.
```

- [ ] **Step 2: Update the MEMORY.md hook line if needed**

Open `~/.claude/projects/-Users-barock-Code-folk/memory/MEMORY.md`. Find:
```
- [Agent SDK long-lived query options](sdk-long-lived-query.md) — three SDK patterns for keeping a session process alive across turns; folk currently uses one-shot + `resume` (deferred decision)
```

Replace with:
```
- [Agent SDK long-lived query options](sdk-long-lived-query.md) — folk ships pattern 1 (AsyncIterable per session); v2 alpha is the next migration target
```

- [ ] **Step 3: No git commit for memory** — the memory directory is outside the repo.

---

## Done criteria

- `npx tsc --noEmit` clean.
- All 6 of Steps 1–6 in Task 7 passed.
- `git log --oneline` shows ~6 incremental commits on top of `pre-long-lived-sessions`.
- Memory doc updated to reflect shipped state.
