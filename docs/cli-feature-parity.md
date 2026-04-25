# Claude Code ↔ folk feature parity

Last updated: 2026-04-25 (priority shortlist 1–10 landed).

A reference inventory of what Claude Code (CLI) does, what folk (desktop app) does today, and where the gaps are. Use this when scoping new work — every "should we build X?" should start by checking what bucket it falls into here.

**Legend:** ✅ implemented · ⚠️ partial · ❌ missing · 🚫 deliberately not in folk's scope

---

## 1. Slash commands

Claude Code ships ~30 slash commands plus user-defined (`.claude/commands/*.md`) and plugin-contributed ones. Folk now has a **slash command registry** (`src/renderer/src/slash-commands.ts`) wired into the composer: typing `/` opens an autocomplete menu (arrows / Tab / Enter), and dispatch routes to navigate / action / prompt handlers. User-defined and plugin-contributed commands are not yet discovered — see § 7.

Three buckets for handling them:

### 1a. Should navigate to an existing folk page

| Command | CC behavior | Folk today | Gap |
|---|---|---|---|
| `/mcp` | manage MCP servers | ✅ `/mcp` → MCPPage |
| `/model` | switch model | ✅ `/model` → opens composer model popover |
| `/sessions`, `/resume` | list/resume sessions | ✅ `/sessions` (alias `/resume`) → SessionsPage |
| `/config` | settings | ✅ `/config` → ProfilePage |
| `/keybindings` | (CC has no equivalent) | ✅ `/keybindings` → KeybindingsPage |
| `/agents` | manage subagents | ✅ `/agents` aliased to SkillsPage (still seed data — see § 7) |
| `/skills` | manage skills | ⚠️ `/skills` navigates; SkillsPage still renders `INITIAL_SKILLS` — hydrate from `~/.claude/skills` |
| `/plugins` | manage plugins | ⚠️ `/plugins` navigates; PluginsPage still seed data — hydrate from real manifests |

### 1b. Should pass through to the live SDK session

These are agent-loop directives or canned prompts the SDK already understands.

| Command | CC behavior | Folk today | Gap |
|---|---|---|---|
| `/clear` | drop conversation memory | ✅ creates fresh session reusing model + cwd, switches active |
| `/compact` | manual context compaction | ✅ pushes `/compact` to SDK as user prompt; SDK-emitted boundaries render as a separator |
| `/init` | generate CLAUDE.md | ✅ pushed as prompt |
| `/review` | review current PR | ✅ pushed as prompt |
| `/security-review` | security review of pending changes | ✅ pushed as prompt |
| `/pr-comments` | fetch PR comments | ✅ pushed as prompt |
| user commands (`.claude/commands/*.md`) | template expansion + push | ✅ scanned from `~/.claude/commands` and `<cwd>/.claude/commands`; appear in slash autocomplete and run by reading the file body and pushing it as a prompt |
| plugin-contributed commands | depends on plugin | ⚠️ plugin install paths discovered (§ 7); commands inside plugin packages not yet scanned |

### 1c. Don't apply to a desktop GUI

`/exit`, `/quit`, `/vim`, `/terminal-setup`, `/ide`, `/migrate-installer`, `/doctor`, `/upgrade`, `/bug`, `/release-notes`, `/install-github-app`, `/feedback` — irrelevant in a Mac app. 🚫

### 1d. Folk doesn't have a destination yet

| Command | CC behavior | Folk today | Build or punt? |
|---|---|---|---|
| `/cost` | show token usage | ✅ reads cumulative SDK `result.total_cost_usd` + token usage and renders an inline divider with the totals (cumulative + last turn) |
| `/status` | session state | ✅ inline divider with model, cwd, status, last-turn duration / tokens |
| `/memory` | edit CLAUDE.md | ⚠️ slash entry exists; pushes prompt to open file. No inline editor yet |
| `/hooks` | configure hooks | ❌ | niche; defer |
| `/permissions` | tool-use permission rules | ❌ | pairs with elicitation/forms work (§ 4) |
| `/output-style` | change response style | ❌ | low priority |
| `/add-dir` | add working directory | ⚠️ folk sets cwd per-session at creation | n/a — folk model is one cwd per session |
| `/export` | export transcript | ✅ writes a markdown blob via download dialog |

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
| `compact_boundary` | "context compacted here" marker | ✅ emits `notice` event → renders horizontal separator in transcript |
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
| `TodoWrite` | inline checklist with checkboxes, persistent task tracker | ✅ special-cased — checklist with status boxes (pending / in_progress / completed) |
| `Task` (subagent dispatch) | nested spinner + child agent's output | ✅ child tool calls are nested under the parent via `parent_tool_use_id` envelope, rendered as collapsible sub-cards inside the parent ToolCard. `SDKTaskProgress`/`Notification` panels still ignored — see § 2 |
| `Read` | file path + line range | generic | minor — show pretty path |
| `Edit` / `Write` / `NotebookEdit` | colored diff | ✅ DiffCard renders unified diff (red/green) with file path; Write shown as all-additions |
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
| Tool-use permission prompt ("Allow Bash to run `rm -rf`?") | inline allow/deny/always | ⚠️ folk now exposes the SDK `permissionMode` (Ask / Auto-edit / Plan / Bypass) per session via a composer chip and persists it in SQLite. Tool-by-tool inline allow/deny prompt still TODO — needs `canUseTool` callback wiring through IPC |
| `AskUserQuestion` tool | inline form, blocks turn until answered | tool call shows but no input UI; the agent is stuck waiting | render form from elicitation payload; push response back into iterable |
| MCP `elicitation/create` | inline form | ❌ ignored | same as AskUserQuestion |

The infrastructure piece: folk needs an event from main → renderer ("agent is asking a question, here's the schema"), and an IPC back ("here's the answer"). The schema is in the SDK's elicitation messages.

---

## 5. Subagents (Task tool, parallelism)

CC CLI's `Task` tool spawns child agents — they show up as nested progress with their own tool-use stream.

- **CC behavior:** parent emits `tool_use` for `Task`; SDK runs the child agent; child emits its own `assistant` / `tool_use` / `result` events nested under the parent; CLI shows them as a tree.
- **Folk today:** parent's `tool_use` and the child's `tool_use` envelopes carry `parent_tool_use_id`. Folk threads that into `appendToolCall` and `appendToolResult` so child calls render as nested cards inside the parent's ToolCard (live + persisted via `mapSessionMessages`). `SDKTaskStartedMessage` / `Updated` / `Progress` / `Notification` are still ignored — they would add a richer task-status panel (description, status, usage) but the core nesting works without them.
- **Gap:** wire the SDK Task lifecycle messages into a task-status header.

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
| `~/.claude/skills/*` | auto-loaded | ✅ SkillsPage hydrated from `~/.claude/skills` (+ project `<cwd>/.claude/skills`) via `discover:skills` IPC, frontmatter parsed |
| `.claude/commands/*.md` (project) | listed in slash menu | ✅ discovered from `<cwd>/.claude/commands` and surfaced in composer slash menu |
| `~/.claude/commands/*.md` (user) | listed in slash menu | ✅ discovered from `~/.claude/commands` and surfaced in composer slash menu |
| Plugins (`.claude/plugins/*`) | auto-loaded | ✅ PluginsPage hydrated from `~/.claude/plugins/installed_plugins.json`; descriptions read from each plugin's manifest where available |
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
| Permissions config | `~/.claude/settings.json` permissions | ⚠️ per-session `permissionMode` persisted in SQLite (default / acceptEdits / plan / bypassPermissions) and passed to the SDK |
| Theme | `/config` | ✅ light/dark via `data-theme` |
| Density | n/a | ✅ folk-only (`data-density`) |
| Keybindings | `~/.claude/keybindings.json` | ✅ KeybindingsPage |
| Status line | configurable | ❌ no equivalent |

---

## Priority shortlist — status

The 2026-04-25 shortlist of 10 is now mostly landed. Outstanding work:

1. ✅ **`compact_boundary` separator** — handler in `AgentManager`, divider in `Conversation`.
2. ✅ **TodoWrite checklist component** — `ToolCard` special-case with status boxes.
3. ✅ **Slash command autocomplete** — `slash-commands.ts` registry + composer menu (arrows / Tab / Enter).
4. ✅ **`/clear` and `/compact` pass-through** — `/clear` clones session; `/compact` ships as a prompt.
5. ✅ **Skills / plugins / user commands hydration** — `disk-discovery.ts` IPC, SkillsPage + PluginsPage rebuilt, user commands fold into the slash menu.
6. ✅ **Subagent nested cards** — `parent_tool_use_id` threaded into `appendToolCall` / `appendToolResult` and `mapSessionMessages`; `ToolCard` recurses.
7. ✅ **Edit / Write diff rendering** — DiffCard with red/green unified diff (covers `Edit`, `Write`, `NotebookEdit`).
8. ⚠️ **Elicitation form** — punted; needs SDK control-message wiring (push tool_result back into the iterable for `AskUserQuestion` / MCP `elicitation/create`). UI design also TBD.
9. ✅ **`/cost` and `/status`** — `result.total_cost_usd` + usage aggregated into per-session `stats`; both commands render an inline divider with the totals.
10. ⚠️ **Permissions** — SDK `permissionMode` (Ask / Auto-edit / Plan / Bypass) persisted per session and surfaced via a composer chip; tool-by-tool inline allow/deny still TODO (needs `canUseTool` over IPC).

Next up beyond the shortlist:
- Inline `canUseTool` permission prompts (rounds out § 4 + § 13).
- Plug `SDKTaskStartedMessage` / `Updated` / `Progress` / `Notification` into a task-status header on Task tool cards.
- Plugin-bundled commands (scan plugin install paths for `commands/*.md`).
- `/memory` editor (currently a pass-through prompt).
- `/output-style`, hooks UI, status line — defer until someone asks.

---

## Out of scope (folk will never have these)

- Terminal-only commands (`/vim`, `/terminal-setup`, `/ide`, `/migrate-installer`, `/doctor`, `/upgrade`, `/bug`, `/feedback`, `/install-github-app`)
- `/exit` / `/quit` (close the window instead)
- `/add-dir` (folk's model is one cwd per session, set at creation)
