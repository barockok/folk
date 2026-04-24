# folk — Claude Code Desktop App

A macOS desktop app for managing Claude Code. **Original design**, Stripe-inspired visual system (purple accent, Sohne-style type, Pretto. Lens photography vibes — restrained, confident, technical).

> "folk" because it's a local-first, BYO-key client that treats Claude Code as a power tool for regular folks — not just CLI power users.

---

## Product vision

Claude Code's CLI is powerful but intimidating. **folk is the native shell around it** — same sessions, same tool calls, same underlying binary — but with three high-leverage differentiators:

1. **MCP config editor** — a non-technical, form-driven editor for MCP servers. Templates for common providers (Filesystem, GitHub, Postgres, Slack, Notion, etc.), schema-aware fields, live test-connect. No JSON hand-editing required.
2. **Multi-provider model management** — first-class support for Anthropic, OpenAI, Google, GLM/Zhipu, Kimi/Moonshot, Qwen, and any OpenAI-compatible endpoint. Switch providers per-session from the composer.
3. **Rich session UX** — document-style conversation (markdown, tables, images, links, rich tool cards) instead of terminal output, while preserving the Claude-Code transparency around tool use and task progress.

**Target user:** developers who want Claude Code's behavior with a desktop-native surface, plus non-technical operators who want MCP access without editing config files.

**Positioning:** local-first (no accounts, no cloud state), BYO-key, no phone-home telemetry. Friendly to alternative model providers — folk is explicitly not Anthropic-only.

---

## Design system

**Brand**: Stripe-inspired. Purple primary, slate neutrals, generous whitespace, restrained iconography. No emoji, no gradients, no AI-slop tropes.

**Tokens** (`styles.css`): `--stripe-purple`, `--bg-card`, `--bg-sub`, `--border`, `--border-soft-purple`, `--heading`, `--body`, `--fg-faint`, `--warn`, `--ok`, `--err`, `--ff-sans`, `--ff-mono`, `--r`, `--r-sm`.

**Type**: sans for UI, mono for identifiers/flags/paths. 13px body, 11px eyebrow/labels (uppercase, tracked).

**Components** (`app.css`): buttons (`btn`, `btn-primary`, `btn-plain`, `btn-danger`, `btn-danger-solid`), inputs (`input`), cards, badges, modals, toasts, command palette, segmented cards, popovers.

**Density**: two-tier via `data-density` attribute (compact / regular), toggleable from Tweaks.

**Theme**: light + dark via `data-theme`. Also in Tweaks.

---

## File structure

```
folk/
  index.html              — App shell, state hub, routing, first-run gate
  styles.css              — Design tokens (colors, type, radii)
  app.css                 — Layout, components, pages
  onboarding.css          — First-run onboarding + new-session SessionSetup
  icons.jsx               — Inline SVG icon set (Lucide-inspired originals)
  data.jsx                — Seed data (MCPs, skills, plugins, marketplace, keybindings)
  shell.jsx               — Sidebar, topbar, command palette, toasts
  mcp.jsx                 — MCP Servers page + config editor drawer
  pages.jsx               — Skills, Plugins, Sessions, Marketplace, Keybindings, Model & API, Profile
  onboarding.jsx          — FirstRunOnboarding + SessionSetup (new-session sheet)
  tweaks-panel.jsx        — Starter Tweaks shell
```

Large files are deliberately split — pages.jsx is the one exception and should be pruned further if it grows beyond ~1500 lines.

---

## Pages & features

### Sidebar (`shell.jsx`)
- Brand row with collapse toggle (purple chevron chip)
- **Workspace** group: Sessions (top — the primary surface), MCP Servers, Skills, Plugins
- **Discover** group: Marketplace
- **Configure** group: Model & API, Keybindings
- **Profile footer** — avatar + nickname row at the bottom, clicks open the Profile page
- Collapsed state: icons-only, tooltips on hover, keeps profile footer
- No Acme workspace card, no Pro/login footer. Local-first framing.

### Sessions (`pages.jsx` — SessionsPage)
**Centerpiece.** Two-column layout inside the main panel:

- **History rail** (secondary sidebar) — grouped by Today / Yesterday / This week / Earlier, with search, status dot, timestamp, preview line
- **Active session** — maximized, fills remaining width

**Conversation area**:
- Document-style renderer (not terminal). Avatars + names ("You" / "folk"), inline timestamps
- Rich markdown: headings, paragraphs, bold/italic/code, lists, tables, blockquotes, images, links
- **Tool cards**: collapsible, show name + status (running/success/error), progress indicators, input args, output preview. Preserves Claude Code's tool transparency
- **Wizard blocks**: structured forms folk can render to gather info from the user mid-turn
- Max-width 1400px, 40px horizontal padding. Generous — only ultrawide letterboxes
- Attachments rendered as chips below user messages

**Composer**:
- Textarea + send button
- **Model picker popover** — click the `✦ model-name ⌄` chip to switch across all configured providers/models. Grouped by provider with brand logo chips
- **Brainstorm** button — triggers a wizard turn
- **Drag-and-drop file attachments** — full composer drop overlay ("Drop to attach"), paste clipboard images, file chips with remove affordance
- Attachments include images, text, binary. Chips show filename + size

**New session**: `needsSetup: true` routes to the `SessionSetup` sheet instead of the conversation (see Onboarding below).

### MCP Servers (`mcp.jsx`)
**Second differentiator.** List view + detail drawer.

- List: name, status (running/stopped/error), tool count, last-tested timestamp
- Drawer: **non-technical form editor** with templates for Filesystem, GitHub, Postgres, Slack, Notion, etc.
- Schema-aware fields: text, path picker, secret (masked), toggle, enum
- Live **Test connect** button with pass/fail states per tool
- Raw JSON tab for power users (echoes the generated config)
- Marketplace install integrates here (adds a new MCP with pre-filled fields)

### Skills, Plugins (`pages.jsx`)
Standard list + detail pattern. Skills are prompts/recipes; plugins are extensions. Both installable from Marketplace.

### Marketplace (`pages.jsx` — MarketplacePage)
Claude-style community marketplace. Three tabs: **MCP · Skills · Plugins**.

- Featured hero, category sidebar (Dev, Data, Comms, Knowledge, AI, Integrations, etc.)
- Cards: name, author, description, category pills, install state
- **"Add from source"** modal — GitHub URL or local directory. Warns that these are unverified community contributions; folk doesn't audit or endorse
- No "Verified" filter/badge. folk explicitly doesn't vet submissions — language is neutral ("from the author")

### Model & API (`pages.jsx` — ModelPage)
**Third differentiator.** Multi-provider manager.

- **Provider tabs** across the top: each configured provider gets its own tab with brand-color logo chip + enabled-model count
- Per-provider: API key (masked), base URL, list of models with enable/disable toggle, per-model context/output limits
- **Add provider** modal: pick from Anthropic, OpenAI, Google, GLM/Zhipu, Kimi/Moonshot, Qwen, or custom OpenAI-compatible endpoint
- Changes sync live with the composer's model picker

### Keybindings (`pages.jsx`)
Searchable table of keybindings grouped by scope. Read-only for now.

### Profile (`pages.jsx` — ProfilePage)
"How folk refers to you and what it knows about you." Local-only.

- Avatar (initials, color chosen from palette), nickname, bio
- No login, no account, no email collection
- Full-width centered inside the shared 1120px page container (consistent with other pages)

---

## Onboarding (`onboarding.jsx` + `onboarding.css`)

Two separate flows.

### First-run onboarding (`FirstRunOnboarding`)
Fullscreen modal over the whole app, gated by `localStorage['folk.onboarded']`. 4 steps:

1. **Welcome** — folk hero + three value props (local-first, BYO-model, tools-ready MCP)
2. **Profile** — nickname + avatar color
3. **Provider** — pick one of Anthropic / OpenAI / Google / GLM / Kimi / Qwen / custom
4. **Key** — paste API key, live validation. Skip allowed (can configure later in Model page)

Completion writes `profile` state to the shell, seeds a provider in Model page, and sets `folk.onboarded`.

**Replay**: surfaced in Tweaks panel as "Replay first-run onboarding" button.

### New-session setup (`SessionSetup`)
Renders in-place when a session has `needsSetup: true`. Invoked by "New session" button or ⌘N.

**Sections** (in order):
1. **Working folder** — path input + Browse, recent folders list
2. **Model** — 6-card grid of enabled models (pulls from configured providers)
3. **What are you doing?** — optional goal picker (general / code / research / data / writing / ops)
4. **Launch options** — collapsible, richly designed advanced section

**Launch options panel** (collapsible):
- **Icon chip + label + dynamic subtitle** that reflects current state ("Permissions disabled · custom flags")
- **Status pills** on the right when any option is non-default (`skip-permissions` warn pill, `+flags` pill)
- **Permissions** — two segmented cards side-by-side:
  - "Ask before every action" (green shield icon, "recommended" pill)
  - "Skip permissions" (red bolt icon, shows `--dangerously-skip-permissions` flag inline as mono chip)
- **YOLO warning block** (shown when skip-permissions is on): risks listed with the actual target folder referenced inline, plus "I understand" acknowledgement checkbox that gates the launch button
- **Raw CLI flags** — `$`-prefixed mono input, passed verbatim to claude-code. Link to docs
- **Command preview** — dark terminal-style block showing the exact `claude-code` invocation based on current selections

Launch button turns solid-red (`btn-danger-solid`) when YOLO is on, disabled until acknowledgement is checked.

---

## State & persistence

- App-level state (page, model, profile, providers, sessions) lives in `index.html` App component
- **Persisted via `useTweaks` + `EDITMODE-BEGIN/END` JSON block** (tweaks: theme, density, onboarding flag)
- Sessions are in-memory (no backend). The design assumes a future Rust/Tauri backend reads/writes `~/.claude/` dirs
- `localStorage['folk.onboarded']` gates first-run
- `localStorage['folk.lastTab']` remembers the active page across reload

## Tweaks

Minimal surface by design:
- Dark mode
- Density (compact / regular)
- Replay first-run onboarding

Keep this small. Per-feature toggles live in the Profile/Model/Session-setup pages, not in Tweaks.

## Icons

`icons.jsx` — ~30 Lucide-inspired originals. Add by editing the `paths` object. Names used: server, puzzle, sparkles, wand, keyboard, cpu, user, plus, search, settings, info, shield, check, x, chevronRight, chevronDown, image, folder, link, bolt, external, terminal, send, spark, lock, more, copy, trash, play, pause, arrow-up-right, arrow-right, filter.

## Known gotchas

- **CSS caching**: when iterating on `onboarding.css` or `app.css`, hard-refresh (Cmd+Shift+R). Soft reloads can serve stale CSS while new JSX is loaded, causing "unstyled-looking" panels that are actually a stylesheet mismatch.
- **Speaker notes**: none — this isn't a deck.
- **Babel scope**: each `<script type="text/babel">` is its own scope. Shared components (icons, data, shell helpers) end with `Object.assign(window, { ... })` to expose them globally.
- **Style object naming**: never `const styles = ...` — always prefix (`ssStyles`, `mcpStyles`) or inline.

---

## What the feedback loop looks like

Barock (PM) comments on specific elements via the preview pane. Each comment references a screen-labeled element. The usual flow:

1. Comment identifies a screen + behavior gap (e.g. "drag drop file attachment", "add --dangerously-skip-permissions")
2. Scope the surface, decide whether it's a Tweaks/config concern or a first-class UI element
3. Design it in-place (no new files unless the feature is large enough to warrant its own section)
4. Verify with `done` + `fork_verifier_agent`
5. Brief summary — what was added, where it lives, what the user can now do

Prefer adding to existing flows over creating new pages. Prefer exposing config as designed UI (segmented cards, toggles, previews) over "advanced settings" text dumps.
