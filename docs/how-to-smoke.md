# How to smoke folk

Manual + automated smoke checks for every feature shipped in the recent
parity push. Pair this with `docs/cli-feature-parity.md` for the gap matrix.

Last updated: 2026-04-26.

---

## Setup

```bash
npm install
npx @electron/rebuild -w better-sqlite3 --build-from-source   # Electron binding
npm run dev
```

Vitest needs the system-Node binding instead, so the test workflow swaps:

```bash
npm rebuild better-sqlite3            # rebuild for system Node
npx vitest run                        # 46 tests across 4 files
npx @electron/rebuild -w better-sqlite3 --build-from-source   # back to Electron before next `npm run dev`
```

---

## Manual smoke list

### 1. Slash commands

- Type `/` in composer → menu opens.
- `/mcp`, `/model`, `/sessions`, `/skills`, `/plugins`, `/keybindings`, `/config`, `/agents` → navigates to the corresponding page (or opens the model popover).
- `/clear` → spawns new session reusing the active session's model + cwd + flags, switches active.
- `/export` → downloads `folk-<id>.md` markdown of the transcript.
- `/cancel` → kills in-flight turn.
- `/compact`, `/init`, `/review`, `/security-review`, `/pr-comments`, `/memory` → assistant gets that prompt as a user message.

### 2. User / project / plugin commands hydration

- Drop `~/.claude/commands/foo.md` with frontmatter `description: bar`. No restart needed — switch session and `/foo` appears in the slash menu with description. Pick → file body shipped as prompt.
- Same with `<cwd>/.claude/commands/`.
- Drop `<plugin-install-path>/commands/baz.md` in an installed plugin → appears as `/<plugin>:baz` in the slash menu.

### 3. Skills + Plugins pages

- Open Skills page → entries from `~/.claude/skills/<name>/SKILL.md` (frontmatter parsed) plus the project mirror. Path shown.
- Open Plugins page → entries from `~/.claude/plugins/installed_plugins.json`. Description pulled from the plugin's `plugin.json` / `manifest.json` / `package.json`.

### 4. Compact boundary

- Trigger `/compact` (or wait for auto). SDK emits `system/compact_boundary` → horizontal divider rendered in transcript with "Context compacted" label.

### 5. /cost + /status

- After at least one turn → `/cost` → divider shows `cost: $0.0123 over 1 turn(s) · tokens: in/out · cache: …`.
- `/status` → divider shows model + cwd + state + last-turn duration.

### 6. Subagent nesting

- Send a prompt that triggers a `Task` tool dispatch.
- Parent ToolCard expand → child tool calls render nested under "subagent (N)".

### 7. Edit / Write / NotebookEdit diff

- Ask the agent to edit a file. ToolCard renders `DiffCard` with red lines (`-old`) + green lines (`+new`). `Write` shows all-green. `NotebookEdit` uses `old_source` / `new_source`.

### 8. TodoWrite

- Trigger TodoWrite → checklist with status boxes (◐ in_progress, ✓ completed, blank pending) + `done/total` count.

### 9. MCP humanize names

- Any MCP tool call → header reads `<server> · <tool>` (e.g. `chrome · use browser`). Hover the name → tooltip with the raw `mcp__plugin_…__…` id.

### 10. Tool group

- 2+ consecutive tool calls (any mix) without text/thinking between → collapsed into a single `N tool calls` chip with first 3 distinct labels. Click to expand → individual ToolCards.

### 11. Live thinking

- Multi-thinking-block streaming turn → only the trailing thinking pulses with dots; earlier thoughts collapse to static `Thought`.

### 12. Auto-title + sidebar preview

- New session, send first message → sidebar title updates to first ~60 chars of the message (no longer "Untitled session").
- Existing transcript → on app start, backfill kicks in for sessions whose title still equals "Untitled session".
- Sidebar subtitle → working-dir basename (e.g. `folk`, `Second-Brain`); shows `· not started` when `claude_started=0`.

### 13. Permissions

- Composer chip: switch between Ask / Auto-edit / Plan / Bypass — persists in SQLite (`sessions.permission_mode`).
- Bypass mode + ask agent to edit a sensitive file (`~/.claude/skills/<x>/SKILL.md`) → SDK still triggers `canUseTool` → inline approval card (Allow once / Allow always / Deny).
- Click "Allow always" → SDK's `suggestions` are forwarded as `updatedPermissions`; next same-tool call doesn't reprompt.

### 14. SessionSetup permission wiring

- New session sheet → toggle "Skip permissions" → session created with `permissionMode: 'bypassPermissions'`. Verify in SQLite (`sessions.permission_mode`) or in the Composer chip after launch (= Bypass). The CLI flag `--dangerously-skip-permissions` is no longer pushed via extraArgs — that path was a no-op in the SDK.

### 15. /clear inheritance

- /clear from a skip-perms session → child session inherits same model + cwd + flags + permissionMode.

### 16. Tool progress

- Run a long tool (e.g. `Bash` with `sleep 5`) → ToolCard status field shows live `Ns` elapsed counter that increases until the result lands.

### 17. Prompt suggestions

- Any turn where the SDK emits `prompt_suggestion` → chips appear above the composer. Click a chip → ships as next user message and clears chips. × → dismiss without sending.

### 18. Rate limit + API retry

- Hit Anthropic rate limit (or have the SDK simulate) → divider `Rate limit rejected (five_hour) until <time>`.
- Server hiccup forcing retry → divider `API retry 1/3 in 1.5s — rate_limit`.

### 19. System notices

All routed through `#dispatchSystem` and rendered as transcript dividers (or, for `local_command_output`, piped through the chunk channel as assistant text). Trigger naturally during real sessions:

- `system/init` → divider `Session ready · model … · N tools · M MCP server(s)` on session start.
- `system/files_persisted`, `system/hook_started/progress/response`, `system/memory_recall`, `system/notification` (with priority prefix for non-low), `system/plugin_install`, `system/auth_status`, `system/mirror_error`, `system/elicitation_complete`, `system/status` → all surface as descriptive dividers.
- `system/local_command_output` → renders inline as assistant text (matches CLI behavior for slash-command stdout).
- `system/session_state_changed` → sidebar status dot flips to running mid-turn.
- `system/<unknown>` → falls back to `Event: system/<sub>` divider so new SDK additions are visible without crashing.
- `tool_use_summary` → `Summary: <text>` divider.

### 20. Provider Test button

- Settings → Models. Anthropic key → Test → green ok.
- OpenAI / DeepSeek / Moonshot / GLM / Qwen / custom OpenAI-compatible → Test uses `Authorization: Bearer …` + `<base>/models`. Returns ok or `HTTP 401: <body>` with the first 200 chars of the response body.
- Provider with `authMode: 'claude-code'` → Test runs `security find-generic-password -s 'Claude Code-credentials'` (macOS) or checks `~/.claude/.credentials.json` (Linux).

### 21. Custom provider model add

- Add custom provider → empty models list → fill `model-id` + label → Add. Trash icon removes a model. Duplicate id is rejected with a warn toast.

### 22. Claude Code subscription auth

- Provider with `authMode: 'claude-code'` → Models section shows notice "Model is managed by your Claude Code subscription"; no per-model toggles, no enabled-count.

### 23. SessionSetup picker

- New session sheet → "Provider & model" section is grouped by provider header, all models listed (no `slice(0, 6)` cap).

### 24. Markdown table

- Send markdown with a small table → border hugs the columns, doesn't extend to the full container width. Wide tables still scroll horizontally.

### 25. Inline image (folk-file:// protocol)

- Assistant outputs a markdown image with an absolute local path → renders inline via the `folk-file://localhost/<encoded-path>` custom protocol.

### 26. Dev keychain bypass

- Restart `npm run dev` → no "folk Safe Storage" keychain prompt on provider list. Newly saved provider keys use AES-GCM with a key file at `~/Library/Application Support/folk/folk-dev.key` (mode 600). Existing rows still encrypted by safeStorage will prompt once on first decrypt; re-save the provider to migrate.

---

## Automated coverage

```bash
npm rebuild better-sqlite3            # system Node binding
npx vitest run                        # 46 tests across 4 files
```

What the suites cover:

- **`src/main/agent-manager.test.ts`** — every SDK message subtype routed by `#dispatchMessage` / `#dispatchSystem` (init, status, api_retry, compact_boundary, auth_status, elicitation_complete, files_persisted, hook_started/progress/response, local_command_output, memory_recall, mirror_error, notification, plugin_install, session_state_changed, unknown, task_*), plus `tool_progress`, `prompt_suggestion`, `rate_limit_event` (allowed + rejected), `tool_use_summary`, usage aggregation, `canUseTool` allow/deny, error mapping (auth / cancelled), session create.
- **`src/main/database.test.ts`** — schema migrations, provider CRUD with safeStorage / dev-key encryption, session CRUD + `permission_mode` field.
- **`src/main/disk-discovery.test.ts`** — skill discovery (directory + loose `.md`), command discovery + frontmatter parse, no-op on missing directories.
- **`src/main/mcp-manager.test.ts`** — MCP test-connection happy + missing-command paths.

After running tests, restore the Electron binding before launching dev:

```bash
npx @electron/rebuild -w better-sqlite3 --build-from-source
```

---

## Automation: `npm run smoke`

`scripts/smoke.sh` orchestrates the full pipeline so the binding swap, vitest,
and the Playwright Electron spec run with one command:

```bash
npm install
npx playwright install chromium     # one-time — fetches Playwright's driver binary
npm run smoke                       # vitest → electron rebuild → build → e2e
npm run smoke:unit                  # only the vitest leg (still restores Electron binding)
npm run smoke:e2e                   # only the Electron + Playwright leg
```

The Playwright Electron spec lives in `tests/e2e/smoke.spec.ts`. It boots the
built app against a throwaway `--user-data-dir`, primes the onboarding flag in
`localStorage`, and exercises the deterministic UI surface:

| Doc # | Scenario | Auto |
|---|---|---|
| 1 | slash menu opens with built-in commands | ✅ |
| 3 | Skills + Plugins pages render | ✅ |
| 13 | Composer permission chip exposes Ask/Auto/Plan/Bypass | ✅ |
| 14 | SessionSetup "Skip permissions" toggle present | ✅ |
| 20 | Models page renders Test buttons | ✅ |
| 21 | Custom provider model add UI present | ✅ |
| 23 | SessionSetup picker grouped by provider | ✅ |
| 24 | Markdown table renders content-hugging width | ✅ |
| 2, 4–12, 15–19, 25, 26 | live-agent / keychain / file-watch flows | ❌ manual |

Live-agent scenarios (compact boundary, /cost, /status, subagents, diff cards,
TodoWrite, MCP humanize, tool group, live thinking, auto-title, /clear
inheritance, tool progress, prompt suggestions, rate-limit/retry, system
notices, inline image, dev keychain bypass) need a real Anthropic API key and
a turn against a real model — they stay manual. The SDK-side dispatch logic
those scenarios depend on is already covered by
`src/main/agent-manager.test.ts` (vitest), so the manual checks are about UI
rendering of real events, not about the routing itself.
