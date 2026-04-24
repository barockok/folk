# folk landing page — design spec

**Date:** 2026-04-24
**Author:** brainstorming session w/ Barock
**Status:** approved for implementation planning
**Branch context:** `neo` (Electron+Vite app rebuild in progress; landing page is decoupled from app build)

---

## 1. Purpose & positioning

A public marketing page for **folk** — a native macOS app built on the official Claude Agent SDK that wraps Claude Code with a designed UI, a form-driven MCP editor, multi-provider model management, and inline rendering for images, tables, and links.

**Primary goals (CTAs):**
1. Drive macOS app downloads.
2. Drive GitHub stars / source views.

**Positioning beats the page must land in the first viewport:**
- *What:* a native macOS app for Claude Code.
- *Who:* everyone — developers and non-technical operators alike.
- *Why trust:* built on the official Claude Agent SDK, not a re-implementation.

**Tone:** Stripe-inspired — restrained, technical, confident. No emoji, no gradients, no AI-slop tropes ("supercharge", "10x", "AI-powered"). Mono for identifiers, sans for prose. Generous whitespace.

---

## 2. Tech stack & file structure

A standalone static page, decoupled from the Electron+Vite app build:

```
landing/
  index.html            single page, no SPA framework
  landing.css           page-only styles, imports tokens from ../styles.css
  screenshots/
    hero-app.png        full app shot, Sessions view (used in hero)
    mcp-editor.png      MCP page with form-editor drawer open
    model-providers.png Model & API page with provider tabs visible
    rich-session.png    side-by-side: terminal output vs folk render
  README.md             how to run/deploy
```

**Constraints:**
- No build step required. Plain HTML/CSS, optional inline JS only for theme toggle.
- Reuses `--*` tokens from `styles.css` (colors, type, shadows, radii) but does **not** import `app.css` — that file carries app-shell concerns (sidebar, command palette) we don't need.
- Hostable on GitHub Pages, Vercel, Netlify, or any static host out of the box.
- Real screenshots from the running prototype (`index.html` in repo root). Captured at 2x for retina; displayed at 1x natural width.

**Container & rhythm:**
- Max-width `1120px`, 32px horizontal padding, centered.
- Vertical section padding: `120px` top/bottom for major sections, `80px` for hero bottom, `40px` for footer bottom.
- Section breaks: alternate `--bg` (white) and `--bg-sub` (subtle) to delineate sections without explicit dividers. The Commitments band uses `--brand-dark` as the only dark band.

**Theme:** Light by default. Theme toggle in top nav flips `[data-theme="dark"]` on `<html>`, picking up dark token overrides from `styles.css` for free.

---

## 3. Top nav

Sticky thin bar at the top of the page.

- Height: `56px`
- Background: `--bg` with hairline `--border` bottom on scroll only (not at top).
- Container: same `1120px` constraint as page body.
- **Left:** folk wordmark (text + small purple chevron mark, ~14px). Links to `#top`.
- **Center:** three text links — `Features`, `Open Source`, `Download`. 13px, `--fg-muted`, hover → `--heading`.
- **Right:** GitHub icon link (`btn-icon btn-sm` styling) + theme toggle (sun/moon icon).

---

## 4. Section 1 — Hero

Top padding `140px`, bottom `80px`. Centered text, centered hero visual below.

**Eyebrow** (uppercase, tracked, 11px, `--stripe-purple`): `OPEN SOURCE · v0.1 PREVIEW`

**Headline** (h1, 56px, weight 300, tracking -0.02em, color `--heading`):
> Claude Code for everyone.

**Subhead** (20px, weight 400, color `--body`, max-width 580px, line-height 1.5, centered):
> A native macOS app **built on the official Claude Agent SDK** — the same agent loop and tool runtime as the `claude-code` CLI. Adds form-driven MCP editing, any model provider, and inline rendering for images, tables, and links. Local-first, BYO-key.

**CTA row** (centered, 32px below subhead, 12px gap):
- `Download for macOS` — `btn-primary`, large variant (height 40px, padding 16px), purple. Auto-detects Apple Silicon vs Intel via `navigator.userAgent` and points to the matching binary; defaults to Apple Silicon if detection fails. Power users wanting the alternate architecture pick from the footer.
- `View on GitHub` — `btn` with GitHub icon, large variant

**Microcopy** under CTAs (13px, `--fg-faint`, centered): `macOS 13+ · Windows coming soon · MIT licensed`

**Credibility strip** (40px below microcopy, 60px above hero visual):
- Single horizontal row, centered, mono font
- Four chips separated by `·` characters
- Each chip: 11px, `--fg-muted`, `--bg-sub` background, `--border` hairline, 4px radius, 6px padding
- Chips:
  1. `Powered by @anthropic-ai/claude-agent-sdk`
  2. `Same loop as the CLI`
  3. `MCP & hooks compatible`
  4. `Renders markdown, tables, images`

**Hero visual** (80px below credibility strip):
- Real screenshot of the Sessions page (composer + active conversation), wrapped in stylized window-chrome:
  - Top bar: `--bg-sub`, hairline `--border` bottom, three traffic-light dots (no real macOS title text)
  - Body: screenshot, no border on inner edges
  - Container: `--sh-elevated` shadow, 8px border radius, 960px max-width
- **Halo:** behind the screenshot, a soft radial gradient using `--stripe-purple-bg`. ~1200px wide, ~600px tall, centered behind the screenshot. The page's only decorative element.

---

## 5. Section 2 — Three differentiators

Three alternating image-text rows. White background. ~80px vertical gap between rows. Section padding `120px` top/bottom.

**Row anatomy** (consistent across all three):
- Image area: ~55% width, text area ~40%, 5% gap.
- Image side has stylized window-chrome frame (same treatment as hero).
- Text side has:
  - **Eyebrow** (11px, uppercase, `--stripe-purple`)
  - **Heading** (h2, 36px, weight 300, tracking -0.015em)
  - **Description** (16px, `--body`, max-width 460px, ~3 sentences, line-height 1.55)
  - **Feature bullets** — 4 max, each row: 14px purple check icon + label. Identifiers in mono.
  - **Optional link** — `Learn more →` in `--stripe-purple`

### Row 2.1 — MCP Servers without the JSON
Image-right.
- Image: `screenshots/mcp-editor.png` — MCP page with the form-editor drawer open (Postgres or GitHub template visible).
- Eyebrow: `MCP EDITOR`
- Heading: *MCP servers without the JSON.*
- Description: Templates for Filesystem, GitHub, Postgres, Slack, Notion, and more. Schema-aware fields, masked secrets, live test-connect — no editing `~/.claude/mcp.json` by hand.
- Bullets:
  - Pre-built templates for 8+ providers
  - Live test-connect per server
  - Raw JSON tab for power users
  - Marketplace install in one click

### Row 2.2 — Any model, any provider
Image-left.
- Image: `screenshots/model-providers.png` — Model & API page with provider tabs across the top (Anthropic, OpenAI, Google chips visible).
- Eyebrow: `MULTI-PROVIDER`
- Heading: *Any model. Any provider.*
- Description: First-class support for Anthropic, OpenAI, Google, GLM, Kimi, Qwen, and any OpenAI-compatible endpoint. Switch providers per session from the composer — same chat, different brain.
- Bullets:
  - 7 providers out of the box
  - Custom OpenAI-compatible endpoints
  - Per-model context & output limits
  - Hot-swap mid-session

### Row 2.3 — A terminal you can read
Image-right.
- Image: **side-by-side comparison panel** instead of a single screenshot. Two cards inside one window-chrome frame:
  - **Left card** (`--bg-sink`, `--ff-mono` font): raw terminal output — ANSI ASCII table with `+---+` borders, `[Image: chart.png]` placeholder, bare URL `https://github.com/anthropics/...`
  - **Right card** (`--bg-card`, `--ff-sans` font): folk's render — real HTML table with hairline borders, inline thumbnail of the chart (a small chart sketch), link rendered as `github.com/anthropics/...` with a favicon glyph and underline-on-hover
  - Soft `--border-soft-purple` divider down the middle
  - Top labels: `claude-code CLI` (left, `--fg-faint`, 11px) / `folk` (right, `--stripe-purple`, 11px)
- Eyebrow: `RICH SESSIONS`
- Heading: *A terminal you can read.*
- Description: Tables render as tables. Images show inline. Links are clickable. Tool calls collapse into rich cards instead of scrolling past in monospace. Same Claude Code transparency, none of the squinting.
- Bullets:
  - Markdown, tables, images, links
  - Collapsible tool cards
  - Wizard blocks for mid-turn forms
  - Drag-and-drop attachments

---

## 6. Section 3 — How it works

Section padding `120px` top/bottom. `--bg-sub` background. Hairline `--border` top.

**Eyebrow** (centered): `GET STARTED`
**Heading** (centered, h2, 36px, weight 300): *Three steps to your first session.*

**3-column step grid** (1120px container, 24px column gap):

Each step card:
- `--bg-card` background, `--border` hairline, `--r-lg` radius, `--sh-ambient` shadow.
- Padding `32px`.
- Top-left: numbered chip — `01` `02` `03`. 32px, mono, `--stripe-purple`, tabular figures.
- Title (18px, weight 500, color `--heading`)
- Body (14px, `--body`, ~2 sentences, line-height 1.55)
- Bottom: mono code chip in `--bg-sink` with `--border` hairline, 6px padding, monospace 12px.

Steps:
1. **Bring your key.** Paste an API key from Anthropic, OpenAI, Google, or any OpenAI-compatible endpoint. Stored locally with macOS `safeStorage` — never leaves your machine.
   - Mono chip: `~/Library/Application Support/folk/keys.db`
2. **Connect your MCP servers.** Pick a template (Filesystem, GitHub, Postgres…), fill the form, hit Test. Or import an existing `mcp.json`.
   - Mono chip: `templates: filesystem, github, postgres, slack, notion, +3`
3. **Start a session.** Open a folder, pick a model, optionally tweak permissions. The exact `claude-code` invocation is previewed before launch.
   - Mono chip: `claude-code --model sonnet-4.6 --cwd ~/code/folk`

**Footer line** (40px below grid, centered, 13px, `--fg-faint`):
> No accounts. No telemetry. No phone-home.

---

## 7. Section 4 — Provider grid

Section padding `100px` top/bottom. `--bg-sub` background.

**Eyebrow** (centered): `MODEL PROVIDERS`
**Heading** (centered, h2, 36px, weight 300): *Bring your own model.*
**Subhead** (centered, 16px, `--body`, max-width 600px): folk doesn't lock you to one vendor. Configure as many providers as you want, switch per session, or run them side-by-side.

**Card grid** (4 columns desktop, 2 columns tablet, 1 column mobile, 16px gap):

Each provider card:
- ~340px wide × 140px tall
- `--bg-card`, `--border` hairline, `--r` radius, `--sh-ambient` shadow
- Hover: lifts to `--sh-standard`
- Padding `20px`
- Top-left: 28px brand monogram chip — rounded square, brand color background, white monogram letter inside. **No trademarked logos shipped** — only brand-colored monograms (e.g. Anthropic = orange `A`, OpenAI = black `O`, Google = blue `G`).
- Top-right: `--badge-ac` chip with model count (e.g. `7 models`)
- Heading: provider name (16px, weight 500)
- Body (13px, `--body`): one-line note
- Bottom-left: tiny mono chip with the provider's identifier in `--bg-sink`

Provider cards (in order):
1. **Anthropic** (orange `A` monogram) — `Claude Opus, Sonnet, Haiku — direct from console.anthropic.com.` · `anthropic`
2. **OpenAI** (black `O` monogram) — `GPT-5, o3, o4-mini — including codex-cli compatible models.` · `openai`
3. **Google** (blue `G` monogram) — `Gemini 2.5 Pro/Flash via AI Studio or Vertex.` · `google`
4. **GLM / Zhipu** (purple `Z` monogram) — `GLM-4.6, GLM-4-Air — China-region capable.` · `glm`
5. **Kimi / Moonshot** (dark navy `K` monogram) — `Kimi-K2 long-context (200K+ tokens).` · `kimi`
6. **Qwen** (red `Q` monogram) — `Qwen3-Coder, Qwen3-Max — Alibaba Cloud or open-weight.` · `qwen`
7. **Custom endpoint** (different visual treatment):
   - Dashed `--border-dashed` border (no solid border)
   - Plus-icon chip (no monogram)
   - No model count badge
   - Copy: `Any OpenAI-compatible API. Paste a base URL and key.`
   - Identifier chip: `custom`

---

## 8. Section 5 — Open-source / local-first commitment

**Full-bleed dark band.** The page's only dark section.

- Background: `--brand-dark` (`#1c1e54`)
- Padding `120px` top/bottom
- Container: 1120px

**Eyebrow** (uppercase, `--stripe-purple-light`): `THE COMMITMENTS`
**Heading** (h2, 40px, white, weight 300, max-width 720px):
> Local-first. BYO-key. No phone-home.

**Body** (17px, `rgba(255,255,255,0.75)`, max-width 640px, line-height 1.6):
folk doesn't have an account system, doesn't ship telemetry, and doesn't run any of your sessions through our servers. Your keys stay in macOS Keychain. Your sessions stay in `~/.claude/`. Your MCP configs stay on disk.

**3-column commitment row** (40px below body, 24px gap):

Each commitment column:
- 24px purple icon (lock / key / scale-of-justice or similar from icons.jsx)
- Heading (16px, weight 500, white)
- Body (14px, `rgba(255,255,255,0.6)`, line-height 1.6)

1. **Local-first** — Sessions, keys, configs, and history all live on your machine. No cloud sync, no account.
2. **BYO-key** — You bring keys for the providers you want. We're not in the inference business.
3. **MIT licensed** — Source on GitHub. Read it, fork it, audit the binary. We sign every release.

**CTA row** (centered, 56px below commitments):
- `View source on GitHub` — `btn-ghost` styled for dark band: purple text on transparent, `--stripe-purple-light` border, hover fills to `--stripe-purple-bg`
- 12px gap, then a small mono link: `git clone github.com/folk-app/folk` (12px, `--stripe-purple-light`, copy-to-clipboard on click)

---

## 9. Section 6 — Footer

Background: white. Hairline `--border` top. Padding `80px` top, `40px` bottom. Container: 1120px.

**Top row — 4-column grid** (24px column gap):

**Brand col:**
- folk wordmark (small, with chevron mark)
- Tag: `A native shell for Claude Code.` (14px, `--body`)
- Below: `v0.1.0 · Apr 2026 · MIT` in mono `--fg-faint` 12px

**Product col:**
- Header: `Product` (12px uppercase, `--fg-muted`)
- Links (14px, `--body`, hover → `--heading`):
  - Features
  - MCP Editor
  - Model Providers
  - Changelog
  - Roadmap

**Open source col:**
- Header: `Open source`
- Links:
  - GitHub
  - Issues
  - Discussions
  - Contributing
  - License

**Download col:**
- Header: `Download`
- Items:
  - `macOS (Apple Silicon)` — primary `btn-primary btn-sm`
  - `macOS (Intel)` — `btn btn-sm`
  - `Windows` — `btn btn-sm` disabled appearance, with inline `coming soon` `--badge-warn` chip
  - `Linux` — same disabled treatment with `coming soon` chip

**Bottom strip** (24px above bottom edge, hairline `--border` top, 24px padding-top):
- Left (13px, `--fg-faint`): `© 2026 folk · Not affiliated with Anthropic, PBC.`
- Right: small icon row — GitHub icon, RSS icon (changelog feed), email icon (mailto for security reports). Each `btn-icon btn-sm btn-plain`.

---

## 10. Responsive behavior

The page targets desktop-first but degrades gracefully:

- **≥1120px:** all layouts at full design width.
- **768px–1119px:** container shrinks to viewport with 32px gutters. Differentiator rows stack image above text. Provider grid drops to 2 columns. How-it-works steps stack to 1 column.
- **<768px:** all rows stack. Hero headline drops to 36px. Subhead to 16px. CTAs go full-width and stack vertically. Footer columns stack to 1 column.

No mobile-specific menu — the top nav's three links collapse to a hamburger if needed at <640px, but ideal viewing is desktop.

---

## 11. Accessibility

- All interactive elements have visible focus rings using `--ring` (already defined in `styles.css`).
- Color contrast: all body text meets WCAG AA against its background (light section bodies use `--body` `#64748d` on white, dark band bodies use `rgba(255,255,255,0.75)` on `--brand-dark`).
- Theme toggle is a `<button>` with `aria-label="Toggle dark mode"`.
- All screenshot images have descriptive `alt` text (e.g. `alt="folk MCP server editor with Postgres template open"`).
- All decorative icons (provider monograms, commitment icons) have `aria-hidden="true"`.

---

## 12. Out of scope

To keep the implementation focused, the following are explicitly **not** in this spec:

- Analytics / telemetry of any kind (this is a local-first product — the landing page also avoids tracking).
- Marketing email capture / waitlist.
- Documentation site (separate concern).
- Blog / changelog feed (footer link points to GitHub releases until a real changelog exists).
- Internationalization (English only at v1).
- Animation / scroll-triggered effects beyond CSS hover states (no GSAP, no Framer Motion).
- Comparison table vs other Claude Code clients (no other clients exist yet to compare against).
- Testimonials / social proof (no users yet).
- Pricing (folk is free and open source; no pricing page needed).

---

## 13. Open questions / future enhancements

- Real screenshots need to be captured from the running prototype before launch. Spec assumes they exist by implementation time.
- Brand monograms for OpenAI/Anthropic/etc. need to be verified as non-infringing — we're using brand colors + a single letter, not their actual logomarks.
- The `git clone github.com/folk-app/folk` URL is a placeholder; the real repo URL needs to be confirmed before launch.
- A small "press kit" page (logo download, screenshots, brand notes) might come later; not in this spec.
