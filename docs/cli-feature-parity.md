# Claude Code ↔ folk feature parity

Last updated: 2026-04-25.

A reference inventory of what Claude Code (CLI) does, what folk (desktop app) does today, and where the gaps are. Use this when scoping new work — every "should we build X?" should start by checking what bucket it falls into here.

**Legend:** ✅ implemented · ⚠️ partial · ❌ missing · 🚫 deliberately not in folk's scope

---

## 1. Slash commands

Claude Code ships ~30 slash commands plus user-defined (`.claude/commands/*.md`) and plugin-contributed ones. Folk currently has **no slash command infrastructure** — the composer treats `/foo` as plain text and pushes it to the SDK as a user message. The SDK does NOT execute slash commands; the CLI does. So today `/clear` typed in folk is a literal string the model sees.

Three buckets for handling them:

### 1a. Should navigate to an existing folk page

| Command | CC behavior | Folk today | Gap |
|---|---|---|---|
| `/mcp` | manage MCP servers | MCPPage exists | wire `/mcp` → navigate |
| `/model` | switch model | ModelPage exists; per-session picker exists | wire `/model` → picker |
| `/sessions`, `/resume` | list/resume sessions | sidebar history exists | wire `/sessions` → focus sidebar |
| `/config` | settings | ProfilePage + TweaksPanel exist | wire `/config` → ProfilePage |
| `/keybindings` | (CC has no equivalent) | KeybindingsPage exists | n/a — folk-only |
| `/agents` | manage subagents | ❌ no folk page; SkillsPage uses seed data only | build real agents page or alias to skills |
| `/skills` | manage skills | ⚠️ SkillsPage exists but renders `INITIAL_SKILLS` from `data.ts`, not real on-disk skills | hydrate from `~/.claude/skills` |
| `/plugins` | manage plugins | ⚠️ PluginsPage exists; same — seed data only | hydrate from real plugin manifests |

### 1b. Should pass through to the live SDK session

These are agent-loop directives or canned prompts the SDK already understands.

| Command | CC behavior | Folk today | Gap |
|---|---|---|---|
| `/clear` | drop conversation memory | ❌ user starts a new folk session manually | folk-side: "new session" button, or have `/clear` create+switch |
| `/compact` | manual context compaction | ❌ SDK does auto-compaction silently; folk ignores `compact_boundary` events | (a) push `/compact` into iterable; (b) render `compact_boundary` separator in transcript |
| `/init` | generate CLAUDE.md | ❌ | push as prompt |
| `/review` | review current PR | ❌ | push as prompt |
| `/security-review` | security review of pending changes | ❌ | push as prompt |
| `/pr-comments` | fetch PR comments | ❌ | push as prompt |
| user commands (`.claude/commands/*.md`) | template expansion + push | ❌ none discovered | scan dir at session start, expose in autocomplete |
| plugin-contributed commands | depends on plugin | ❌ | discover from plugin manifests |

### 1c. Don't apply to a desktop GUI

`/exit`, `/quit`, `/vim`, `/terminal-setup`, `/ide`, `/migrate-installer`, `/doctor`, `/upgrade`, `/bug`, `/release-notes`, `/install-github-app`, `/feedback` — irrelevant in a Mac app. 🚫

### 1d. Folk doesn't have a destination yet

| Command | CC behavior | Folk today | Build or punt? |
|---|---|---|---|
| `/cost` | show token usage | ❌ | **build** — small, useful (per-session + total spend) |
| `/status` | session state | ⚠️ implicit (sidebar shows status icons) | build status bar; small |
| `/memory` | edit CLAUDE.md | ❌ | small editor inside ProfilePage or per-session sheet |
| `/hooks` | configure hooks | ❌ | niche; defer |
| `/permissions` | tool-use permission rules | ❌ | pairs with elicitation/forms work (§ 4) |
| `/output-style` | change response style | ❌ | low priority |
| `/add-dir` | add working directory | ⚠️ folk sets cwd per-session at creation | n/a — folk model is one cwd per session |
| `/export` | export transcript | ❌ | small (write JSON / markdown to disk) |

---

## 2. Message types from the SDK

`AgentManager.#dispatchMessage` only handles 4 of the SDK's ~25 message types. The source has the explicit comment: *"Ignore system, compact_boundary, stream_event, and all other message types for v0."* Inventory:

| SDK message type | Renders | Folk handling |
|---|---|---|
| `stream_event` (text_delta, thinking_delta) | streaming chars | ✅ → `chunk`, `thinking` events |
| `assistant` (text/thinking/tool_use blocks) | model output | ✅ with dedup against streamed messages |
| `user` (tool_result blocks) | tool output | ✅ → `toolResult` event (matched by callId) |
| `result` | turn complete | ✅ → `done` event + status update |
| `system` | env/init info | ❌ ignored |
| `compact_boundary` | "context compacted here" marker | ❌ ignored — should render a separator |
| `SDKHookStartedMessage` / `Progress` / `Response` | hook lifecycle | ❌ ignored |
| `SDKToolProgressMessage` | tool progress updates (e.g., "reading 3/10 files") | ❌ ignored |
| `SDKTaskStartedMessage` / `Updated` / `Progress` | subagent activity | ❌ ignored — see § 3 |
| `SDKTaskNotificationMessage` | subagent notifications | ❌ ignored |
| `SDKElicitationCompleteMessage` | form/question response | ❌ ignored — see § 4 |
| `SDKPromptSuggestionMessage` | model-suggested next prompts | ❌ ignored — UI affordance opportunity |
| `SDKAPIRetryMessage` | retry happening | ❌ ignored — would help "why is it slow?" UX |
| `SDKRateLimitEvent` | hit rate limit | ❌ ignored — should toast |
| `SDKAuthStatusMessage` | auth changed mid-session | ❌ ignored |
| `SDKSessionStateChangedMessage` | session state delta | ❌ ignored |
| `SDKMemoryRecallMessage` | memory hit | ❌ ignored |
| `SDKFilesPersistedEvent` | files written via tool | ❌ ignored |
| `SDKLocalCommandOutputMessage` | local command stdout | ❌ ignored |
| `SDKToolUseSummaryMessage` | tool-use summary | ❌ ignored |
| `SDKPluginInstallMessage` | plugin install event | ❌ ignored |
| `SDKMirrorErrorMessage` | mirror error | ❌ ignored |
| `SDKNotificationMessage` | generic notification | ❌ ignored |

---

## 3. Tools — rendering and special-casing

CC CLI special-cases several tools for richer rendering. Folk renders **everything** via the generic `ToolCard` (header + JSON input + output blob).

| Tool | CC CLI rendering | Folk today | Gap |
|---|---|---|---|
| `TodoWrite` | inline checklist with checkboxes, persistent task tracker | generic JSON dump | special-case → checklist component |
| `Task` (subagent dispatch) | nested spinner + child agent's output | one generic card; child activity invisible | wire `SDKTask*` messages, render nested cards under the parent |
| `Read` | file path + line range | generic | minor — show pretty path |
| `Edit` / `Write` | colored diff | generic | medium — render unified diff |
| `Bash` | command + stdout/stderr separated | generic | small — split output panes |
| `Grep` / `Glob` | match table | generic | small |
| `WebFetch` / `WebSearch` | rich link preview | generic | small |
| `AskUserQuestion` | inline form | generic, **no way to answer** | medium — see § 4 |
| MCP tools (any) | generic | generic | n/a |
| Custom plugin tools | depends | generic | n/a |

---

## 4. Forms, permissions, elicitation

CC CLI presents inline UIs for three things folk can't do today:

| Surface | CC behavior | Folk today | Gap |
|---|---|---|---|
| Tool-use permission prompt ("Allow Bash to run `rm -rf`?") | inline allow/deny/always | ❌ permissions are bypassed at the SDK level (no prompt fires) | depends on whether folk wants to gate tool use; design needed |
| `AskUserQuestion` tool | inline form, blocks turn until answered | tool call shows but no input UI; the agent is stuck waiting | render form from elicitation payload; push response back into iterable |
| MCP `elicitation/create` | inline form | ❌ ignored | same as AskUserQuestion |

The infrastructure piece: folk needs an event from main → renderer ("agent is asking a question, here's the schema"), and an IPC back ("here's the answer"). The schema is in the SDK's elicitation messages.

---

## 5. Subagents (Task tool, parallelism)

CC CLI's `Task` tool spawns child agents — they show up as nested progress with their own tool-use stream.

- **CC behavior:** parent emits `tool_use` for `Task`; SDK runs the child agent; child emits its own `assistant` / `tool_use` / `result` events nested under the parent; CLI shows them as a tree.
- **Folk today:** parent's `tool_use` renders as a single generic card. The child's events arrive as `SDKTaskStartedMessage` / `SDKTaskUpdatedMessage` / `SDKTaskProgressMessage` and are **ignored**.
- **Gap:** wire the three Task messages into events; render nested tool cards under the parent Task card; collapse/expand UI.

This is where folk would feel most behind for power users — multi-agent workflows look opaque.

---

## 6. MCP

| Aspect | CC | Folk |
|---|---|---|
| Server config (stdio, http, sse) | flags + JSON | ✅ MCPPage form-driven editor with templates |
| Test connection | manual | ✅ live test-connect button |
| Per-server enable/disable | edits config | ✅ toggle in MCPPage |
| Tool discovery | reads from server on init | ✅ propagated through `mcpServers` option |
| MCP tool rendering | generic | generic (same as native tools) |
| Elicitation from MCP server | inline | ❌ (see § 4) |
| Resource browsing | `mcp` REPL subcommand | ❌ |
| Prompt browsing | `mcp` REPL subcommand | ❌ |

**Folk advantage here.** The form editor + test-connect is one of folk's three differentiators (per CLAUDE.md).

---

## 7. Skills, plugins, commands (user-defined)

The `.claude/` directory tree is the plugin/skill/command source of truth for CC. Folk's pages exist but **render seed data, not the actual on-disk state**.

| Surface | CC behavior | Folk today | Gap |
|---|---|---|---|
| `~/.claude/skills/*` | auto-loaded | ⚠️ `SkillsPage` shows `INITIAL_SKILLS` constant | scan and hydrate |
| `.claude/commands/*.md` (project) | listed in slash menu | ❌ not discovered | scan and expose in slash autocomplete |
| `~/.claude/commands/*.md` (user) | listed in slash menu | ❌ | same |
| Plugins (`.claude/plugins/*`) | auto-loaded | ⚠️ `PluginsPage` shows seed | scan and hydrate |
| Plugin marketplace | `/install`, `/marketplace` | ⚠️ `MarketplacePage` exists with seed catalog | wire to a real source |
| Hooks (`~/.claude/settings.json`) | executed by harness | ❌ no folk surface | low priority |

---

## 8. Sessions & persistence

| Aspect | CC | Folk |
|---|---|---|
| Transcript storage | `~/.claude/projects/<encoded-cwd>/<id>.jsonl` | ✅ same — folk reuses SDK's on-disk store |
| Resume by ID | `--resume <id>` flag | ✅ via SDK `resume` option |
| List past sessions | `/sessions` | ✅ sidebar history |
| Continue most recent | `--continue` | ✅ implicit via session click |
| First-turn vs resume continuity | implicit | ✅ tracked via `Session.claudeStarted` in SQLite |
| **Long-lived child process** | ✅ one CLI = one child | ✅ as of 2026-04-25 (this work) — `LiveSession` per active folk session, idle 5min, MAX_LIVE=4 |
| Per-turn cancel | ctrl-C (kills child) | ✅ via `cancel()` (kills child, next turn lazy-restarts via resume) |
| Mid-conversation interrupt | n/a in v1 SDK | ❌ blocked on SDK v2 alpha graduating |
| Session metadata | flags-only | ✅ folk persists model, cwd, status, claudeStarted, flags in SQLite |
| Multi-session UI | n/a (one per terminal) | ✅ sidebar, switch, hot LRU cache (4 alive) |

**Folk advantage.** Multi-session + sidebar + hot LRU is structurally beyond what a single CLI offers.

---

## 9. Auth & providers

| Aspect | CC | Folk |
|---|---|---|
| Anthropic API key | env var | ✅ stored per-provider in SQLite |
| Claude Code subscription auth | macOS Keychain (`Claude Code-credentials`) | ✅ `authMode: 'claude-code'`, detection via `security find-generic-password` |
| OAuth login flow | `/login` | ❌ folk relies on user pasting key or having Claude Code already authed |
| Multi-provider | n/a (Anthropic only) | ✅ folk supports Anthropic, OpenAI, Google, GLM, Moonshot, Qwen, OpenAI-compatible |
| Per-session model | n/a | ✅ |
| Logout | `/logout` | ⚠️ delete provider in folk |

**Folk advantage.** Multi-provider is the second of folk's three differentiators.

---

## 10. Memory (CLAUDE.md)

| Aspect | CC | Folk |
|---|---|---|
| Project CLAUDE.md auto-loaded | ✅ at session start | ✅ pass-through (SDK reads it) |
| User CLAUDE.md (`~/.claude/CLAUDE.md`) | ✅ | ✅ pass-through |
| `/memory` editor | inline | ❌ no folk UI; user edits the file externally |
| `/init` to generate | ✅ | ❌ (would be a pass-through prompt) |
| Per-conversation memory across sessions | ❌ | ❌ — but `claude-mem` plugin provides one |

---

## 11. Output formatting

| Aspect | CC | Folk |
|---|---|---|
| Markdown rendering | terminal markdown (truncated) | ✅ full markdown via react-markdown with rich tool cards |
| Code blocks | syntax-highlighted | ✅ |
| Inline images (model output absolute paths) | n/a in CLI | ✅ via `folk-file://` custom protocol |
| Diffs | colored (in `Edit`/`Write` tool) | ❌ generic JSON dump (see § 3) |
| Tables | rendered | ✅ |
| Math (LaTeX) | n/a | ❌ |
| `/output-style` switch | yes | ❌ |
| Custom system prompt append | append-only via `systemPrompt: { append }` | ✅ folk uses this for `FOLK_PRESENTATION_PROMPT` |

**Folk advantage.** Rich markdown chat is the third of folk's three differentiators.

---

## 12. Hooks

CC supports user-configured hooks (PreToolUse, PostToolUse, Notification, Stop, etc.) via `~/.claude/settings.json`. The harness executes them, not the SDK.

- **CC:** runs hooks; shows their output inline.
- **Folk:** doesn't configure hooks itself; if `~/.claude/settings.json` defines them, the SDK still runs them but folk ignores the resulting `SDKHookStartedMessage` / `Progress` / `Response`.
- **Gap:** no folk UI for managing hooks; ignored hook events.

Low priority unless folk plans to install its own hooks.

---

## 13. Settings & config

| Surface | CC | Folk |
|---|---|---|
| Global settings | `~/.claude/settings.json` | ⚠️ folk has its own SQLite-backed settings; some overlap (model defaults, MCP) |
| Project settings | `.claude/settings.json` | ❌ folk doesn't read project settings |
| Permissions config | `~/.claude/settings.json` permissions | ❌ |
| Theme | `/config` | ✅ light/dark via `data-theme` |
| Density | n/a | ✅ folk-only (`data-density`) |
| Keybindings | `~/.claude/keybindings.json` | ✅ KeybindingsPage |
| Status line | configurable | ❌ no equivalent |

---

## Priority shortlist for next work

Roughly ordered by impact-per-effort:

1. **`compact_boundary` separator** — tiny event handler + a horizontal rule in the transcript. Big future-proofing win.
2. **TodoWrite checklist component** — special-case in `ToolCard`. Most-used tool, currently ugliest render.
3. **Slash command autocomplete in composer** — bucket #1 navigation only at first. Half a day. Sets the pattern.
4. **`/clear` and `/compact` pass-through** — first two bucket-#2 items; small.
5. **Real skills/plugins/commands hydration** — replace seed data with on-disk scans. SkillsPage and PluginsPage are currently misleading.
6. **`SDKTaskStartedMessage` etc. → nested tool cards** — high-impact for power users; medium effort.
7. **Edit/Write diff rendering** — visible quality improvement.
8. **Elicitation form** — unblocks `AskUserQuestion`-using tools.
9. **`/cost` and `/status`** — small new pages; useful.
10. **Permissions UI** — design needed; depends on whether folk wants to gate tool use at all.

Below this line lives `/memory`, `/output-style`, hooks UI, status line — defer until someone asks.

---

## Out of scope (folk will never have these)

- Terminal-only commands (`/vim`, `/terminal-setup`, `/ide`, `/migrate-installer`, `/doctor`, `/upgrade`, `/bug`, `/feedback`, `/install-github-app`)
- `/exit` / `/quit` (close the window instead)
- `/add-dir` (folk's model is one cwd per session, set at creation)
