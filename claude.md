# folk — Claude Code Desktop App

A macOS desktop app (Electron + React + Vite + TypeScript) that wraps the Claude Code Agent SDK with a document-style chat UI, MCP config editor, and multi-provider model management. Local-first, BYO-key, no cloud telemetry.

> **Why folk exists.** Claude Code's CLI is powerful but intimidating. folk is the native shell — same sessions, same SDK, same on-disk transcripts (`~/.claude/projects/<cwd>/<id>.jsonl`) — with three differentiators: (1) form-driven MCP editor with templates and live test-connect, (2) first-class multi-provider switching (Anthropic / OpenAI / Google / GLM / Moonshot / Qwen / OpenAI-compatible) per session, (3) rich markdown chat with proper tool cards instead of terminal output.

---

## Stack

- **Electron 35** main process (`src/main/`) speaks to the SDK + SQLite
- **Preload bridge** (`src/preload/`) exposes a typed `window.folk.*` API to the renderer
- **React 19 + Vite 6 + Zustand** renderer (`src/renderer/`)
- **better-sqlite3** for local persistence at `app.getPath('userData')/folk.db`
- **`@anthropic-ai/claude-agent-sdk`** drives the agent — folk does not re-implement the agent loop
- **electron-vite** for the dev/build pipeline (`electron.vite.config.ts`)

Type-check: `npx tsc --noEmit` (clean before commits).
Tests: `npx vitest run` (some tests fail without `npx @electron/rebuild -w better-sqlite3` first — see Gotchas).
Run: `npm run dev` (Electron + Vite HMR).

---

## File map (read this before exploring)

```
src/
  shared/                     — types + preload API contract (used by main AND renderer)
    types.ts                    Session, ProviderConfig, MessageBlock, etc.
    preload-api.ts              FolkAPI interface (window.folk shape)

  main/                       — Electron main process
    index.ts                    BrowserWindow, custom protocol registration
    ipc-handlers.ts             ipcMain.handle('sessions:*' | 'providers:*' | 'mcp*' | 'auth:*' | 'dialog:*')
    ipc-streaming.ts            forwards AgentManager events to webContents
    agent-manager.ts            wraps SDK query(); maps SDK messages → folk events
    system-prompt.ts            FOLK_PRESENTATION_PROMPT appended to claude_code preset
    mcp-manager.ts              MCP server CRUD + test-connect
    database.ts                 SQLite schema, migrations (#migrate), CRUD for sessions/providers/mcp/profile

  preload/index.ts            — contextBridge.exposeInMainWorld('folk', ...)

  renderer/
    index.html                  Vite entry
    src/
      main.tsx, App.tsx         React root, routing, store hydration
      env.d.ts                  declares window.folk via shared/preload-api
      data.ts                   seed data (skills, plugins, marketplace, keybindings)

      stores/                 — Zustand
        useUIStore                page routing, theme, density, command palette, toasts
        useSessionStore           sessions, messages (ChatMessage[] with ordered blocks), streamingSessions Set
        useProvidersStore         providers + persistence
        useMCPStore               MCP servers + persistence
        useProfileStore           profile

      hooks/
        useAgent                  subscribes to window.folk.agent.on* events, dispatches to store
        useSessions               session list + send/cancel + auto-hydrate transcript
        useProviders              derives flat enabledModels list across providers

      components/
        Shell, Sidebar, Topbar, CommandPalette, ToastContainer, TweaksPanel, icons

      pages/                  — top-level pages (one per nav item)
        SessionsPage, MCPPage, ModelPage, SkillsPage, PluginsPage,
        MarketplacePage, KeybindingsPage, ProfilePage

        sessions/             — session subcomponents
          HistoryRail, Conversation, Composer, ToolCard
        mcp/                  — MCP subcomponents
          MCPList, MCPConfigDrawer, utils

      onboarding/
        FirstRunOnboarding        4-step modal (welcome / profile / provider / sign-in)
        SessionSetup              in-place new-session sheet (folder, model, goal, launch options)

      styles/
        tokens.css                CSS custom properties (purple, slate, type, radii)
        components.css            layout + component classes
        onboarding.css            first-run + session setup
```

---

## Architecture

### Agent flow (main → renderer)

1. Renderer calls `window.folk.agent.sendMessage(sessionId, text)` → IPC → `AgentManager.sendMessage`.
2. `AgentManager` calls SDK `query({ prompt, options })`. **Continuity**: first turn passes `sessionId: session.id`, subsequent turns pass `resume: session.id` (gated by `session.claudeStarted` flag persisted in SQLite). After a successful turn, `claudeStarted = true`.
3. `for await (const msg of q)` walks SDK messages. `#dispatchMessage` translates them into folk events:
   - `stream_event` with `content_block_delta` → `chunk` / `thinking` (handles `text_delta`, `thinking_delta`)
   - `assistant` message blocks → text/thinking/tool_use (de-duped against already-streamed messages by `message.id`)
   - `user` message tool_result blocks → `toolResult` (matched to call by `tool_use_id`)
   - `result` → `done` (clears the streamed-message id cache)
4. `ipc-streaming.ts` mirrors each event onto `webContents.send('agent:<event>', payload)`.
5. `useAgent` listens, calls store actions; UI updates.

### Message data shape (renderer)

A `ChatMessage` has `blocks: MessageBlock[]` — an **ordered** sequence of:
- `{ kind: 'text'; text }` — markdown body
- `{ kind: 'thinking'; text }` — extended thinking
- `{ kind: 'tool'; call }` — tool use (with output patched in by callId when `tool_result` arrives)

Streaming text deltas merge into the trailing block if it's the same kind, otherwise open a new one — so a `text → tool → text` sequence from the model renders as three separate, in-order blocks.

### Session persistence

- Session metadata (id, model, working dir, status, `claudeStarted`) → SQLite `sessions` table
- **Transcript itself is NOT in our DB** — the SDK writes/reads `~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl`
- On session activation (`useSessions` effect), `useSessionStore.hydrateMessages(id)` calls `window.folk.sessions.loadMessages(id)` → main calls `getSessionMessages` → `mapSessionMessages` folds the flat SDK array into ordered `MessageBlock[]`

### Authentication

`ProviderConfig.authMode`:
- `'api-key'` (default) — `ANTHROPIC_API_KEY` env injected from stored key
- `'claude-code'` (Anthropic only) — env var omitted; SDK resolves from `~/.claude/.credentials.json` (Linux) or macOS Keychain service `Claude Code-credentials`. Detection in `ipc-handlers.ts` uses `security find-generic-password` on macOS, file-exists fallback on Linux.

### Custom protocol for inline images

`folk-file://` scheme is registered in `src/main/index.ts` (privileged: secure, supportFetchAPI, stream). The handler reads `url.pathname` (decoded), gates by `ALLOWED_EXT` (image extensions only), and streams via `net.fetch(pathToFileURL(...))`. The renderer's `Conversation.tsx` `MD_COMPONENTS.img` rewrites absolute paths and `file://` URLs to `folk-file://localhost/<encoded path>`. Web URLs and `data:` URIs pass through.

---

## Conventions

- **Style object naming**: never `const styles = ...`; prefix per scope (`ssStyles`, `mcpStyles`) or inline.
- **Zustand selectors must return stable references.** Returning a fresh `[]` literal on every call triggers `Maximum update depth exceeded`. Use a module-level `EMPTY_MESSAGES` constant or memoize. Pattern in `Conversation.tsx:9`.
- **No emojis in source** unless explicitly requested. Replaces with SVG icons in `components/icons.tsx`.
- **Database migrations** go in `Database.#migrate()` — pattern: `PRAGMA table_info` check, then `ALTER TABLE` if missing. See `auth_mode` and `claude_started`.
- **Env merge for SDK calls**: always start `envOverlay` from `{ ...process.env }` before adding `ANTHROPIC_API_KEY`. The SDK spawns `node cli.js`; without `PATH` it fails with a misleading "Claude Code executable not found at cli.js" error.
- **Don't replace the SDK system prompt.** Use `{ type: 'preset', preset: 'claude_code', append: FOLK_PRESENTATION_PROMPT }` so Claude Code's tool-use prompting stays intact.
- **System prompt only applies on the first turn of a session.** Resumed sessions reuse the cached system block — testing prompt changes requires a fresh session.
- **Pages.tsx is the single allowed monolith** — split anything else into its own file. Page subcomponents live in `pages/<page>/`.

---

## Design system

**Brand**: Stripe-inspired. Purple primary, slate neutrals, generous whitespace, no emoji, no AI-slop tropes.

**Tokens** (`styles/tokens.css`): `--stripe-purple`, `--bg-card`, `--bg-sub`, `--border`, `--border-soft-purple`, `--heading`, `--body`, `--fg-faint`, `--warn`, `--ok`, `--err`, `--ff-sans`, `--ff-mono`, `--r`, `--r-sm`, `--tl` (timeline rail color).

**Type**: sans for UI, mono for identifiers/flags/paths. 13px body, 11px eyebrow/labels (uppercase, tracked).

**Density** via `data-density` attribute on `<html>` (compact / regular).
**Theme** via `data-theme` (light / dark).

---

## Verification

Before claiming work is done:

```bash
npx tsc --noEmit                                # type-check (must be clean)
npm run dev                                      # full Electron app
```

For UI changes: actually exercise the feature in the running app before reporting complete. Type-check verifies code correctness, not feature correctness.

For native module changes (rare): `npx @electron/rebuild -w better-sqlite3` after any `npm install` that rebuilt sqlite for system Node.

---

## Gotchas (lessons learned — extend as we hit more)

- **`better-sqlite3` ABI mismatch after `npm install`**: error reads `NODE_MODULE_VERSION 141 vs 133`. Fix: `npx @electron/rebuild -w better-sqlite3`. The system-Node vitest tests are pre-existing-broken because of this — they need the system-Node binding, not the Electron one. Don't try to "fix" them by changing Electron versions.
- **Env scrubbing breaks SDK spawn.** `query({ env })` REPLACES the child env. Without `PATH`, the SDK can't find `node` and reports "Claude Code executable not found at cli.js" — misleading; the file exists. Always merge from `process.env`.
- **CSS class drift.** Several CSS classes were named `tool-hd`, but the React component used `tool-head` — silently unstyled. When restyling, grep `components.css` for the exact class names.
- **Buttons don't auto-fill width with `display: flex`.** `<button>` UA defaults make it not stretch even with flex layout. Add `width: 100%; box-sizing: border-box; background: transparent; border: 0;` for headers that should fill a card.
- **Zustand `Set` updates** require a new Set instance: `const next = new Set(prev); next.add(x); set({ x: next })`. Mutating in place won't notify subscribers.
- **Streaming dedup**: when `includePartialMessages: true`, the SDK emits both `stream_event` deltas AND a final `assistant` snapshot. `#dispatchMessage` tracks `#streamedMessages` (Set of message ids from `message_start`) and skips re-emitting their text/thinking blocks — only `tool_use` blocks (which don't stream) come from the snapshot.
- **markdown image paths.** Absolute paths from the model render via `folk-file://` (see Architecture). Relative paths can't be resolved (no base dir in chat context) — pass through and let the broken-image icon prompt the user. `~/...` is also unresolved in the renderer.
- **macOS traffic lights** sit at the top-left over the sidebar. Sidebar `padding-top: 36px` leaves clearance.
- **The `claude.md` file is the same file as `CLAUDE.md`** on macOS HFS+/APFS (case-insensitive). Editing one edits both.

---

## Workflow

When the user asks for a change:

1. Scope first — is it a Tweaks/config concern or a first-class UI surface? Prefer adding to existing flows over new pages.
2. If it touches state shape, types, or persistence → walk shared types → main (DB + IPC) → preload → renderer.
3. **Type-check.** Always.
4. Brief one-or-two-sentence summary at the end. State what changed and where; flag if a dev-server restart is needed (main + preload changes don't HMR; renderer does).

When Claude does something wrong: end the conversation with "update CLAUDE.md so this doesn't happen again." Append concrete rules to **Conventions** or **Gotchas** rather than vague guidance.
