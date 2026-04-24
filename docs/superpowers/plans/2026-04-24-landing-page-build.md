# folk Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Build the public marketing landing page for folk as a standalone static site at `landing/`, decoupled from the Electron+Vite app build, using design tokens from `styles.css`.

**Architecture:** Single static HTML file + single CSS file + inline JS for theme toggle and macOS arch detection. No build step. Reuses CSS custom properties (`--*` tokens) from the app's `styles.css` via relative `@import`. Real screenshots from the running prototype, captured last and swapped into placeholder frames built earlier.

**Tech Stack:** Plain HTML5, CSS3 (custom properties + media queries), vanilla inline JS. No framework, no bundler, no test runner. Static-host deployable (GitHub Pages, Vercel, Netlify).

**Spec:** `docs/superpowers/specs/2026-04-24-landing-page-design.md`

**Verification approach:** Each section task ends with serving the page locally (`python3 -m http.server 8000` from repo root, then visit `http://localhost:8000/landing/`) and visually confirming the section renders correctly in both light and dark themes. No automated tests — this is a static marketing page; visual review is the right verification surface.

---

## Status (last updated 2026-04-24)

**14 of 15 tasks shipped.** Page is functional and deployable today — the `<img onerror>` fallback from Task 3 keeps it intact without screenshots. Only Task 15 (screenshot capture) remains.

To preview: from repo root, `python3 -m http.server 8000`, then open `http://localhost:8000/landing/`.

| # | Task | Status | Commit(s) |
|---|------|--------|-----------|
| 1 | Scaffold | ✅ done | `064f8a4` |
| 2 | Top nav | ✅ done | `6df62d3` + `7f1138a` (a11y fix) |
| 3 | Hero | ✅ done | `657d971` |
| 4 | Theme toggle JS | ✅ done | `cd07bd9` + `f5cb7d1` (FOUC fix) |
| 5 | Platform detection | ✅ done | `bb2871e` |
| 6 | MCP differentiator row | ✅ done | `326ffe7` + `5f90ee8` (gap fix) |
| 7 | Multi-provider row | ✅ done | `5bd95f7` |
| 8 | Rich sessions comparison | ✅ done | `b90c19f` |
| 9 | How-it-works | ✅ done | `220512f` |
| 10 | Provider grid | ✅ done | `ddde452` |
| 11 | Open-source dark band | ✅ done | `4da6857` |
| 12 | Footer | ✅ done | `b5a8a4e` |
| 13 | Responsive | ✅ done | `27f1734` |
| 14 | A11y pass | ✅ done | `3de9879` |
| 15 | Capture screenshots | ⏳ **pending** | — |

### Follow-ups (post-launch polish, non-blocking)

From the final code review. None of these block deployment of the current state.

1. **Self-host or preconnect Google Fonts.** `styles.css:6` uses `@import` for Inter + Source Code Pro — render-blocking inside an imported stylesheet. Fix in `landing/index.html` with `<link rel="preconnect">` + a direct `<link rel="stylesheet">` placed *before* `landing.css`, OR self-host only the weights actually used (Inter 300/400/500/600, Source Code Pro 400/500/700).
2. **`.compare__label--purple` dark-mode contrast.** `var(--stripe-purple)` on `var(--bg-card)` is ~4.0:1 in dark mode (fails AA for non-link UI text). Add `[data-theme="dark"] .compare__label--purple { color: var(--stripe-purple-light); }`.
3. **`--ring` contrast on the dark commitments band.** The 22%-alpha purple focus ring is hard to see on `--brand-dark`. Add a band-scoped override: `.commitments :focus-visible { box-shadow: 0 0 0 3px rgba(185,185,249,0.55); }`.
4. **Coming-soon footer buttons** (Windows/Linux). Currently `<span>` with `pointer-events: none` — removes them from tab order so screen-reader users can't focus to read the "coming soon" badge. Switch to `<button disabled>` semantics OR drop `pointer-events: none` and keep only `cursor: not-allowed`.
5. **`.compare__cli-output` mobile.** `white-space: pre` produces a horizontal scrollbar inside an already-narrow comparison panel below 768px. Either switch to `pre-wrap` at the mobile breakpoint, or hide/stack the comparison row explicitly at <768px since the side-by-side comparison loses meaning when columns stack.
6. **`scope="col"` on `.compare__table th`** cells. Cheap a11y win.
7. **Disambiguate footer "MCP Editor" link.** Currently anchors to `#features` (same as the Features link). Either give the MCP `.diff-row` an `id="mcp"` and link there, or drop the duplicate.
8. **Centralize release URL pattern.** The Apple Silicon DMG URL is built in hero JS (auto-detect) AND statically in the footer. When release filenames change, multiple call sites need updating. Consider data attributes or a tiny URL helper.
9. **Promote provider monogram brand colors to classes.** Current inline `style="background:..."` requires `!important` on the custom-card monogram override (`landing.css` `provider-card__monogram--plus`). Promote to `.provider-card__monogram--anthropic` etc. for cleaner cascade.
10. **Replace placeholder `folk-app/folk` GitHub URLs** with the real org/repo before launch. Affects: hero CTA, nav GitHub icon, commitments CTA, commitments clone chip, footer Product/Open-source/Download links, footer GitHub/RSS icons. Single grep-and-replace pass.
11. **Once Task 15 ships real screenshots:** consider removing the `onerror` placeholder handler from the three `<img>` tags AND the `.window-frame__body--placeholder` CSS rule — they were dev-only fallbacks. (Or keep the CSS rule as a documented dev fallback.)

---

## File Structure

```
landing/
  index.html            single page, all sections inline
  landing.css           page-only styles, imports tokens from ../styles.css
  screenshots/
    hero-app.png        Sessions view, used in hero
    mcp-editor.png      MCP page with form drawer open
    model-providers.png Model & API page with provider tabs
    .gitkeep            keeps folder tracked while screenshots are captured later
  README.md             how to run, deploy, and re-capture screenshots
```

`landing/index.html` will be ~600 lines of HTML by the end. `landing/landing.css` will be ~700 lines. Both stay as single files — splitting either requires either a build step (against the spec) or HTML/CSS imports (causes extra HTTP requests for no real benefit at this size). The app's `styles.css` is **not duplicated**; it's imported via `@import url('../styles.css')` in `landing.css`.

---

## Task 1: Scaffold landing/ directory with skeleton + token import

**Files:**
- Create: `landing/index.html`
- Create: `landing/landing.css`
- Create: `landing/screenshots/.gitkeep`
- Create: `landing/README.md`

- [x] **Step 1: Create the directory structure**

```bash
mkdir -p landing/screenshots && touch landing/screenshots/.gitkeep
```

- [x] **Step 2: Write the HTML skeleton with token-importing CSS link**

Create `landing/index.html`:

```html
<!doctype html>
<html lang="en" data-theme="light">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>folk — Claude Code for everyone</title>
  <meta name="description" content="A native macOS app built on the official Claude Agent SDK. Form-driven MCP editor, multi-provider models, inline rendering for images, tables, and links.">
  <link rel="stylesheet" href="landing.css">
</head>
<body>
  <main id="top">
    <!-- sections injected per task -->
  </main>
</body>
</html>
```

- [x] **Step 3: Write `landing/landing.css` with the token import + base reset**

Create `landing/landing.css`:

```css
/* ============================================================
   folk landing page
   Reuses tokens from ../styles.css (purple, Inter, shadows, etc.)
   No app-shell styles imported.
   ============================================================ */

@import url('../styles.css');

/* Override body — the app's styles.css sets overflow:hidden for the desktop
   shell. The landing page needs vertical scroll. */
body {
  overflow: auto;
  height: auto;
}

#root, html, body { height: auto; }

/* Page container */
.page {
  max-width: 1120px;
  margin: 0 auto;
  padding: 0 32px;
}

/* Section rhythm */
.section {
  padding: 120px 0;
}
.section--sub {
  background: var(--bg-sub);
}
```

- [x] **Step 4: Write `landing/README.md` with run/deploy notes**

Create `landing/README.md`:

```markdown
# folk landing page

Public marketing page for folk. Standalone static site — no build step.

## Run locally

From the repo root:

    python3 -m http.server 8000

Then open http://localhost:8000/landing/

## Deploy

Static-host friendly. Push the `landing/` folder to GitHub Pages, Vercel, Netlify, or any static host. Make sure `../styles.css` (relative import in `landing.css`) is served from the parent directory — copy it alongside or vendor it inline before deploying to a host that doesn't include the parent.

## Recapture screenshots

Run the prototype `index.html` at the repo root, navigate to each page, and capture at 2x resolution. Save to `screenshots/` with the names referenced in `index.html` (`hero-app.png`, `mcp-editor.png`, `model-providers.png`).
```

- [x] **Step 5: Verify the skeleton serves and loads tokens**

Run from the repo root:

```bash
python3 -m http.server 8000 &
SERVER_PID=$!
sleep 1
curl -s http://localhost:8000/landing/ | head -20
curl -sI http://localhost:8000/landing/landing.css
kill $SERVER_PID
```

Expected: HTML returned with `<title>folk — Claude Code for everyone</title>`, CSS returns `200 OK`. Open in a browser and confirm the page is blank but the Inter font is loading (check DevTools Network tab for `styles.css` → triggers Google Fonts load).

- [x] **Step 6: Commit**

```bash
git add landing/
git commit -m "feat(landing): scaffold landing page with token-importing CSS"
```

---

## Task 2: Top nav

**Files:**
- Modify: `landing/index.html` (insert nav inside `<body>`, before `<main>`)
- Modify: `landing/landing.css` (append nav styles)

The theme-toggle button is rendered in this task but has no behavior yet — JS comes in Task 4.

- [x] **Step 1: Add the nav HTML**

In `landing/index.html`, replace the `<body>` opener and add the nav as the first child of `<body>` before `<main>`:

```html
<body>
  <nav class="nav">
    <div class="page nav__inner">
      <a href="#top" class="nav__brand">
        <span class="nav__chevron" aria-hidden="true">›</span>
        <span class="nav__wordmark">folk</span>
      </a>
      <div class="nav__links">
        <a href="#features" class="nav__link">Features</a>
        <a href="#open-source" class="nav__link">Open Source</a>
        <a href="#download" class="nav__link">Download</a>
      </div>
      <div class="nav__actions">
        <a href="https://github.com/folk-app/folk" class="nav__icon-link" aria-label="View on GitHub">
          <!-- GitHub icon, simple inline SVG -->
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 .5a11.5 11.5 0 0 0-3.63 22.42c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.34-1.3-1.7-1.3-1.7-1.07-.73.08-.71.08-.71 1.18.08 1.8 1.21 1.8 1.21 1.05 1.8 2.76 1.28 3.43.98.1-.76.41-1.28.74-1.57-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.2-3.1-.12-.3-.52-1.47.11-3.06 0 0 .98-.31 3.21 1.18a11.13 11.13 0 0 1 5.85 0c2.23-1.49 3.21-1.18 3.21-1.18.63 1.59.23 2.76.11 3.06.75.81 1.2 1.84 1.2 3.1 0 4.42-2.69 5.39-5.25 5.68.42.36.8 1.07.8 2.16v3.2c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5z"/>
          </svg>
        </a>
        <button type="button" class="nav__icon-link" id="themeToggle" aria-label="Toggle dark mode">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
            <circle cx="12" cy="12" r="4"/>
            <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
          </svg>
        </button>
      </div>
    </div>
  </nav>
  <main id="top">
```

- [x] **Step 2: Add nav styles to `landing/landing.css`**

Append:

```css
/* ============================================================ Top nav */
.nav {
  position: sticky;
  top: 0;
  z-index: 50;
  background: var(--bg);
  height: 56px;
  display: flex;
  align-items: center;
  border-bottom: 1px solid transparent;
  transition: border-color .12s, background .12s;
}
.nav.is-scrolled {
  border-bottom-color: var(--border);
}

.nav__inner {
  display: flex;
  align-items: center;
  gap: 32px;
}

.nav__brand {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  text-decoration: none;
  color: var(--heading);
  font-weight: 500;
  font-size: 15px;
  letter-spacing: -0.01em;
}
.nav__chevron {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  background: var(--stripe-purple);
  color: #fff;
  border-radius: var(--r-xs);
  font-weight: 600;
  font-size: 13px;
  line-height: 1;
}

.nav__links {
  display: flex;
  align-items: center;
  gap: 24px;
  margin-left: auto;
  margin-right: auto;
}
.nav__link {
  color: var(--fg-muted);
  text-decoration: none;
  font-size: 13px;
  transition: color .12s;
}
.nav__link:hover {
  color: var(--heading);
}

.nav__actions {
  display: flex;
  align-items: center;
  gap: 4px;
}
.nav__icon-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: transparent;
  color: var(--fg-muted);
  border: none;
  border-radius: var(--r-xs);
  cursor: pointer;
  transition: background .12s, color .12s;
}
.nav__icon-link:hover {
  background: var(--bg-sub);
  color: var(--heading);
}
.nav__icon-link:focus-visible {
  outline: none;
  box-shadow: var(--ring);
}
```

- [x] **Step 3: Add inline JS for the scroll-shadow on the nav**

Just before `</body>` in `landing/index.html`, add:

```html
  <script>
    (function () {
      var nav = document.querySelector('.nav');
      function onScroll() {
        if (window.scrollY > 4) nav.classList.add('is-scrolled');
        else nav.classList.remove('is-scrolled');
      }
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    })();
  </script>
</body>
```

- [x] **Step 4: Verify in browser**

Run `python3 -m http.server 8000` from repo root and visit `http://localhost:8000/landing/`. Confirm:
- Sticky bar at top with purple chevron + "folk" wordmark on left
- Three nav links centered (Features / Open Source / Download)
- GitHub icon + sun icon on the right
- After scrolling more than a few pixels, a hairline border appears under the nav
- Theme toggle button hovers but does nothing yet (Task 4 wires it)

- [x] **Step 5: Commit**

```bash
git add landing/
git commit -m "feat(landing): top nav with brand, links, and theme toggle button"
```

---

## Task 3: Hero section (with placeholder visual)

**Files:**
- Modify: `landing/index.html` (add `<section class="hero">` inside `<main>`)
- Modify: `landing/landing.css` (append hero styles)

The hero visual is a placeholder window-chrome frame containing an empty `--bg-sub` panel for now. Real screenshot is swapped in during Task 15.

- [x] **Step 1: Add hero HTML**

Inside `<main id="top">`, add:

```html
    <section class="hero">
      <div class="page hero__inner">
        <div class="eyebrow eyebrow--purple">OPEN SOURCE · v0.1 PREVIEW</div>
        <h1 class="hero__headline">Claude Code for everyone.</h1>
        <p class="hero__subhead">
          A native macOS app <strong>built on the official Claude Agent SDK</strong> — the same agent loop and tool runtime as the <code>claude-code</code> CLI. Adds form-driven MCP editing, any model provider, and inline rendering for images, tables, and links. Local-first, BYO-key.
        </p>
        <div class="hero__ctas">
          <a href="#download" class="btn btn-primary btn-lg" id="heroDownload">
            Download for macOS
          </a>
          <a href="https://github.com/folk-app/folk" class="btn btn-lg">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 .5a11.5 11.5 0 0 0-3.63 22.42c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.34-1.3-1.7-1.3-1.7-1.07-.73.08-.71.08-.71 1.18.08 1.8 1.21 1.8 1.21 1.05 1.8 2.76 1.28 3.43.98.1-.76.41-1.28.74-1.57-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.2-3.1-.12-.3-.52-1.47.11-3.06 0 0 .98-.31 3.21 1.18a11.13 11.13 0 0 1 5.85 0c2.23-1.49 3.21-1.18 3.21-1.18.63 1.59.23 2.76.11 3.06.75.81 1.2 1.84 1.2 3.1 0 4.42-2.69 5.39-5.25 5.68.42.36.8 1.07.8 2.16v3.2c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5z"/>
            </svg>
            View on GitHub
          </a>
        </div>
        <div class="hero__microcopy">macOS 13+ · Windows coming soon · MIT licensed</div>
        <div class="credibility">
          <span class="credibility__chip">Powered by <code>@anthropic-ai/claude-agent-sdk</code></span>
          <span class="credibility__sep" aria-hidden="true">·</span>
          <span class="credibility__chip">Same loop as the CLI</span>
          <span class="credibility__sep" aria-hidden="true">·</span>
          <span class="credibility__chip">MCP &amp; hooks compatible</span>
          <span class="credibility__sep" aria-hidden="true">·</span>
          <span class="credibility__chip">Renders markdown, tables, images</span>
        </div>
        <div class="hero__visual">
          <div class="hero__halo" aria-hidden="true"></div>
          <div class="window-frame">
            <div class="window-frame__bar">
              <span class="window-frame__dot window-frame__dot--red"></span>
              <span class="window-frame__dot window-frame__dot--yellow"></span>
              <span class="window-frame__dot window-frame__dot--green"></span>
            </div>
            <div class="window-frame__body">
              <img src="screenshots/hero-app.png" alt="folk Sessions view with a conversation in progress and the composer at the bottom" class="window-frame__image" onerror="this.style.display='none'; this.parentElement.classList.add('window-frame__body--placeholder');">
            </div>
          </div>
        </div>
      </div>
    </section>
```

- [x] **Step 2: Add hero styles + window-frame primitive + button-large variant + eyebrow primitive**

Append to `landing/landing.css`:

```css
/* ============================================================ Eyebrow */
.eyebrow {
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--fg-muted);
}
.eyebrow--purple { color: var(--stripe-purple); }
.eyebrow--center { text-align: center; }

/* ============================================================ Buttons large */
.btn-lg {
  height: 40px;
  padding: 0 18px;
  font-size: 15px;
  font-weight: 500;
}

/* ============================================================ Window frame */
.window-frame {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  box-shadow: var(--sh-elevated);
  overflow: hidden;
  position: relative;
}
.window-frame__bar {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  background: var(--bg-sub);
  border-bottom: 1px solid var(--border);
}
.window-frame__dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: var(--fg-faint);
}
.window-frame__dot--red    { background: #ff5f57; }
.window-frame__dot--yellow { background: #febc2e; }
.window-frame__dot--green  { background: #28c840; }
.window-frame__body {
  background: var(--bg-card);
  min-height: 480px;
  position: relative;
}
.window-frame__body--placeholder {
  background: var(--bg-sub);
  background-image:
    linear-gradient(135deg, transparent 49%, var(--border) 49% 51%, transparent 51%);
  background-size: 24px 24px;
}
.window-frame__image {
  display: block;
  width: 100%;
  height: auto;
}

/* ============================================================ Hero */
.hero {
  padding: 140px 0 80px;
}
.hero__inner {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.hero__headline {
  font-size: 56px;
  font-weight: 300;
  letter-spacing: -0.02em;
  line-height: 1.1;
  color: var(--heading);
  margin-top: 20px;
  max-width: 820px;
}
.hero__subhead {
  font-size: 20px;
  font-weight: 400;
  color: var(--body);
  max-width: 580px;
  line-height: 1.5;
  margin: 24px 0 0;
}
.hero__subhead code {
  font-family: var(--ff-mono);
  font-size: 17px;
  background: var(--bg-sub);
  border: 1px solid var(--border);
  border-radius: var(--r-xs);
  padding: 1px 6px;
  color: var(--heading);
}
.hero__subhead strong {
  color: var(--heading);
  font-weight: 500;
}

.hero__ctas {
  display: flex;
  gap: 12px;
  margin-top: 32px;
  flex-wrap: wrap;
  justify-content: center;
}
.hero__microcopy {
  font-size: 13px;
  color: var(--fg-faint);
  margin-top: 16px;
}

.credibility {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: center;
  margin-top: 40px;
}
.credibility__chip {
  font-family: var(--ff-mono);
  font-size: 11px;
  color: var(--fg-muted);
  background: var(--bg-sub);
  border: 1px solid var(--border);
  border-radius: var(--r-xs);
  padding: 4px 8px;
}
.credibility__chip code {
  font-family: var(--ff-mono);
  color: var(--heading);
}
.credibility__sep {
  color: var(--fg-faint);
  font-size: 12px;
}

.hero__visual {
  position: relative;
  margin-top: 80px;
  width: 100%;
  max-width: 960px;
}
.hero__halo {
  position: absolute;
  top: -40px;
  left: 50%;
  transform: translateX(-50%);
  width: 1200px;
  height: 600px;
  background: radial-gradient(closest-side, var(--stripe-purple-bg), transparent 70%);
  pointer-events: none;
  z-index: 0;
}
.hero__visual .window-frame {
  position: relative;
  z-index: 1;
}
```

- [x] **Step 3: Verify in browser, both themes**

Reload the page. Confirm:
- Eyebrow row, 56px headline, subhead with mono inline code chip
- Two large CTAs side-by-side (purple + ghost with GitHub icon)
- Microcopy line under CTAs
- Credibility strip with 4 mono chips separated by `·`
- Window-frame visual with traffic-light dots and a diagonal-stripe placeholder body (since no image yet)
- Soft purple halo behind the window frame
- Click the theme toggle in the nav — wait, it's not wired yet, fine. Manually set `<html data-theme="dark">` in DevTools and confirm everything still reads correctly in dark mode (no white-on-white text)

- [x] **Step 4: Commit**

```bash
git add landing/
git commit -m "feat(landing): hero with headline, CTAs, credibility strip, and visual frame"
```

---

## Task 4: Theme toggle JS + persistence

**Files:**
- Modify: `landing/index.html` (extend the inline script block)

- [x] **Step 1: Replace the inline script with theme-toggle support**

Replace the existing `<script>` block at the bottom of `landing/index.html` with:

```html
  <script>
    (function () {
      var html = document.documentElement;
      var nav = document.querySelector('.nav');
      var toggle = document.getElementById('themeToggle');
      var STORAGE_KEY = 'folk-landing.theme';

      // Load saved preference; fall back to system preference
      var saved = localStorage.getItem(STORAGE_KEY);
      var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      var initial = saved || (prefersDark ? 'dark' : 'light');
      html.setAttribute('data-theme', initial);

      toggle.addEventListener('click', function () {
        var current = html.getAttribute('data-theme');
        var next = current === 'dark' ? 'light' : 'dark';
        html.setAttribute('data-theme', next);
        localStorage.setItem(STORAGE_KEY, next);
      });

      // Scroll shadow on nav
      function onScroll() {
        if (window.scrollY > 4) nav.classList.add('is-scrolled');
        else nav.classList.remove('is-scrolled');
      }
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    })();
  </script>
```

- [x] **Step 2: Verify the toggle works and persists**

Reload the page. Click the sun icon in the nav. Confirm:
- The page switches to dark mode (background goes navy, text goes light)
- Reload the page — dark mode persists
- Click again — back to light mode, and reload-persists
- Open in a private/incognito window with system set to dark mode — page loads in dark mode by default

- [x] **Step 3: Commit**

```bash
git add landing/
git commit -m "feat(landing): theme toggle with localStorage and system-preference default"
```

---

## Task 5: Platform detection for hero CTA

**Files:**
- Modify: `landing/index.html` (extend inline script)

The hero CTA labels itself "Download for macOS" but should point to the right binary based on detected architecture. We update the `href` based on `navigator.userAgent`. If detection fails or runs on a non-macOS platform, default to Apple Silicon.

- [x] **Step 1: Add platform detection to the inline script**

Inside the existing IIFE in `landing/index.html`, before the closing `})();`, add:

```javascript
      // Hero download CTA — point to detected macOS arch binary
      var heroDownload = document.getElementById('heroDownload');
      if (heroDownload) {
        var ua = navigator.userAgent || '';
        var isIntelMac = /Macintosh.*Intel/.test(ua) && !/Apple Silicon|arm64/i.test(ua);
        // Apple Silicon Macs frequently report as "Intel" in UA — there's no reliable
        // arch detection from UA alone. Default to Apple Silicon (the dominant case
        // for new downloads); offer Intel fallback in the footer for opt-in.
        var arch = isIntelMac ? 'intel' : 'apple-silicon';
        heroDownload.setAttribute('href',
          'https://github.com/folk-app/folk/releases/latest/download/folk-' + arch + '.dmg'
        );
        heroDownload.dataset.arch = arch;
      }
```

- [x] **Step 2: Verify behavior**

Reload the page in Safari/Chrome on macOS. Open DevTools console and run:

```javascript
document.getElementById('heroDownload').getAttribute('href')
document.getElementById('heroDownload').dataset.arch
```

Expected: `href` ends with either `folk-apple-silicon.dmg` or `folk-intel.dmg`; `dataset.arch` matches.

To force the other branch for verification, in DevTools Network conditions or via `Object.defineProperty` override `navigator.userAgent` to a Linux UA and reload — should default to `apple-silicon`.

- [x] **Step 3: Commit**

```bash
git add landing/
git commit -m "feat(landing): auto-detect macOS arch for hero download CTA"
```

---

## Task 6: Differentiator row 2.1 — MCP editor (image-right)

**Files:**
- Modify: `landing/index.html` (add features section + first row)
- Modify: `landing/landing.css` (append differentiator row styles)

- [x] **Step 1: Add the section + first row HTML**

After the `</section>` closing the hero, add:

```html
    <section class="section features" id="features">
      <div class="page">
        <div class="diff-row diff-row--image-right">
          <div class="diff-row__text">
            <div class="eyebrow eyebrow--purple">MCP EDITOR</div>
            <h2 class="diff-row__heading">MCP servers without the JSON.</h2>
            <p class="diff-row__body">
              Templates for Filesystem, GitHub, Postgres, Slack, Notion, and more. Schema-aware fields, masked secrets, live test-connect — no editing <code>~/.claude/mcp.json</code> by hand.
            </p>
            <ul class="diff-row__bullets">
              <li><span class="diff-row__check" aria-hidden="true">✓</span> Pre-built templates for 8+ providers</li>
              <li><span class="diff-row__check" aria-hidden="true">✓</span> Live test-connect per server</li>
              <li><span class="diff-row__check" aria-hidden="true">✓</span> Raw JSON tab for power users</li>
              <li><span class="diff-row__check" aria-hidden="true">✓</span> Marketplace install in one click</li>
            </ul>
          </div>
          <div class="diff-row__visual">
            <div class="window-frame">
              <div class="window-frame__bar">
                <span class="window-frame__dot window-frame__dot--red"></span>
                <span class="window-frame__dot window-frame__dot--yellow"></span>
                <span class="window-frame__dot window-frame__dot--green"></span>
              </div>
              <div class="window-frame__body">
                <img src="screenshots/mcp-editor.png" alt="folk MCP server editor with the Postgres template open showing host, port, database, and password fields" class="window-frame__image" onerror="this.style.display='none'; this.parentElement.classList.add('window-frame__body--placeholder');">
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
```

- [x] **Step 2: Add diff-row styles**

Append to `landing/landing.css`:

```css
/* ============================================================ Differentiator rows */
.features {
  padding: 120px 0;
}
.diff-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 5%;
  align-items: center;
  margin-bottom: 80px;
}
.diff-row:last-child { margin-bottom: 0; }
.diff-row--image-right .diff-row__visual { order: 2; }
.diff-row--image-left  .diff-row__visual { order: 1; }
.diff-row--image-right .diff-row__text   { order: 1; }
.diff-row--image-left  .diff-row__text   { order: 2; }

.diff-row__heading {
  font-size: 36px;
  font-weight: 300;
  letter-spacing: -0.015em;
  color: var(--heading);
  margin: 12px 0 16px;
  line-height: 1.15;
}
.diff-row__body {
  font-size: 16px;
  color: var(--body);
  max-width: 460px;
  line-height: 1.55;
  margin: 0 0 24px;
}
.diff-row__body code {
  font-family: var(--ff-mono);
  font-size: 14px;
  background: var(--bg-sub);
  border: 1px solid var(--border);
  border-radius: var(--r-xs);
  padding: 1px 5px;
  color: var(--heading);
}
.diff-row__bullets {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.diff-row__bullets li {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  color: var(--fg-muted);
}
.diff-row__check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  background: var(--stripe-purple-bg);
  color: var(--stripe-purple);
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  flex: none;
}

.diff-row__visual {
  width: 100%;
}
```

- [x] **Step 3: Verify in browser**

Reload. Confirm:
- Two-column row, text on left, window-frame visual on right
- Eyebrow `MCP EDITOR`, large 36px heading, body copy with mono `~/.claude/mcp.json`
- Four bullets each with a small purple circle check
- Visual is a placeholder window-frame (since no screenshot yet)
- Resize browser to ~700px wide — the row stays side-by-side (responsive media queries come in Task 13)

- [x] **Step 4: Commit**

```bash
git add landing/
git commit -m "feat(landing): MCP editor differentiator row"
```

---

## Task 7: Differentiator row 2.2 — Multi-provider (image-left)

**Files:**
- Modify: `landing/index.html` (add second row inside `.features` section)

- [x] **Step 1: Add the second row HTML**

Inside the existing `<div class="page">` of the `.features` section, after the first `.diff-row`, add:

```html
        <div class="diff-row diff-row--image-left">
          <div class="diff-row__text">
            <div class="eyebrow eyebrow--purple">MULTI-PROVIDER</div>
            <h2 class="diff-row__heading">Any model. Any provider.</h2>
            <p class="diff-row__body">
              First-class support for Anthropic, OpenAI, Google, GLM, Kimi, Qwen, and any OpenAI-compatible endpoint. Switch providers per session from the composer — same chat, different brain.
            </p>
            <ul class="diff-row__bullets">
              <li><span class="diff-row__check" aria-hidden="true">✓</span> 7 providers out of the box</li>
              <li><span class="diff-row__check" aria-hidden="true">✓</span> Custom OpenAI-compatible endpoints</li>
              <li><span class="diff-row__check" aria-hidden="true">✓</span> Per-model context &amp; output limits</li>
              <li><span class="diff-row__check" aria-hidden="true">✓</span> Hot-swap mid-session</li>
            </ul>
          </div>
          <div class="diff-row__visual">
            <div class="window-frame">
              <div class="window-frame__bar">
                <span class="window-frame__dot window-frame__dot--red"></span>
                <span class="window-frame__dot window-frame__dot--yellow"></span>
                <span class="window-frame__dot window-frame__dot--green"></span>
              </div>
              <div class="window-frame__body">
                <img src="screenshots/model-providers.png" alt="folk Model and API page with provider tabs along the top showing Anthropic, OpenAI, and Google" class="window-frame__image" onerror="this.style.display='none'; this.parentElement.classList.add('window-frame__body--placeholder');">
              </div>
            </div>
          </div>
        </div>
```

- [x] **Step 2: Verify**

Reload. Confirm the second row renders with text on the right, visual on the left (mirrored layout). 80px gap above it from the first row.

- [x] **Step 3: Commit**

```bash
git add landing/
git commit -m "feat(landing): multi-provider differentiator row"
```

---

## Task 8: Differentiator row 2.3 — Rich sessions with side-by-side comparison panel

**Files:**
- Modify: `landing/index.html` (add third row with comparison panel)
- Modify: `landing/landing.css` (append comparison panel styles)

The comparison panel is built entirely in HTML/CSS — no screenshot needed. Two cards side-by-side inside a window-frame: the left simulates terminal output (mono, ASCII), the right simulates folk's render (HTML table, inline thumbnail, real link).

- [x] **Step 1: Add the third row HTML with the comparison panel**

Inside `.features` section, after the second `.diff-row`, add:

```html
        <div class="diff-row diff-row--image-right">
          <div class="diff-row__text">
            <div class="eyebrow eyebrow--purple">RICH SESSIONS</div>
            <h2 class="diff-row__heading">A terminal you can read.</h2>
            <p class="diff-row__body">
              Tables render as tables. Images show inline. Links are clickable. Tool calls collapse into rich cards instead of scrolling past in monospace. Same Claude Code transparency, none of the squinting.
            </p>
            <ul class="diff-row__bullets">
              <li><span class="diff-row__check" aria-hidden="true">✓</span> Markdown, tables, images, links</li>
              <li><span class="diff-row__check" aria-hidden="true">✓</span> Collapsible tool cards</li>
              <li><span class="diff-row__check" aria-hidden="true">✓</span> Wizard blocks for mid-turn forms</li>
              <li><span class="diff-row__check" aria-hidden="true">✓</span> Drag-and-drop attachments</li>
            </ul>
          </div>
          <div class="diff-row__visual">
            <div class="window-frame">
              <div class="window-frame__bar">
                <span class="window-frame__dot window-frame__dot--red"></span>
                <span class="window-frame__dot window-frame__dot--yellow"></span>
                <span class="window-frame__dot window-frame__dot--green"></span>
              </div>
              <div class="compare">
                <div class="compare__col compare__col--cli">
                  <div class="compare__label">claude-code CLI</div>
                  <pre class="compare__cli-output">+----------+---------+--------+
| package  | version | status |
+----------+---------+--------+
| react    | 19.0.0  | ok     |
| zustand  | 5.0.0   | ok     |
| electron | 35.0.0  | warn   |
+----------+---------+--------+

[Image: chart.png]

See https://github.com/anthropics/
claude-code/releases/v2.1</pre>
                </div>
                <div class="compare__col compare__col--folk">
                  <div class="compare__label compare__label--purple">folk</div>
                  <table class="compare__table">
                    <thead>
                      <tr><th>package</th><th>version</th><th>status</th></tr>
                    </thead>
                    <tbody>
                      <tr><td>react</td><td><code>19.0.0</code></td><td><span class="compare__pill compare__pill--ok">ok</span></td></tr>
                      <tr><td>zustand</td><td><code>5.0.0</code></td><td><span class="compare__pill compare__pill--ok">ok</span></td></tr>
                      <tr><td>electron</td><td><code>35.0.0</code></td><td><span class="compare__pill compare__pill--warn">warn</span></td></tr>
                    </tbody>
                  </table>
                  <div class="compare__chart" aria-hidden="true">
                    <div class="compare__bar" style="height:30%"></div>
                    <div class="compare__bar" style="height:55%"></div>
                    <div class="compare__bar" style="height:80%"></div>
                    <div class="compare__bar" style="height:42%"></div>
                  </div>
                  <a class="compare__link" href="#">
                    <span class="compare__favicon" aria-hidden="true">G</span>
                    github.com/anthropics/claude-code/releases/v2.1
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
```

- [x] **Step 2: Add comparison panel styles**

Append to `landing/landing.css`:

```css
/* ============================================================ Comparison panel */
.compare {
  display: grid;
  grid-template-columns: 1fr 1fr;
  min-height: 380px;
  background: var(--bg-card);
  position: relative;
}
.compare::before {
  content: "";
  position: absolute;
  top: 16px;
  bottom: 16px;
  left: 50%;
  width: 1px;
  background: var(--border-soft-purple);
}
.compare__col {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}
.compare__col--cli {
  background: var(--bg-sink);
}
.compare__col--folk {
  background: var(--bg-card);
}
.compare__label {
  font-family: var(--ff-mono);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--fg-faint);
}
.compare__label--purple { color: var(--stripe-purple); }

.compare__cli-output {
  font-family: var(--ff-mono);
  font-size: 11px;
  line-height: 1.5;
  color: var(--fg-muted);
  margin: 0;
  white-space: pre;
  overflow-x: auto;
}

.compare__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.compare__table th {
  text-align: left;
  font-weight: 500;
  color: var(--fg-muted);
  padding: 6px 8px;
  border-bottom: 1px solid var(--border);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.compare__table td {
  padding: 8px;
  border-bottom: 1px solid var(--border);
  color: var(--heading);
}
.compare__table code {
  font-family: var(--ff-mono);
  font-size: 11px;
  color: var(--body);
}
.compare__pill {
  display: inline-block;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: var(--r-xs);
  font-weight: 500;
}
.compare__pill--ok { background: var(--ok-bg); color: var(--ok-text); }
.compare__pill--warn { background: rgba(155,104,41,0.12); color: var(--warn); }

.compare__chart {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  align-items: end;
  height: 60px;
  padding: 6px;
  background: var(--bg-sub);
  border-radius: var(--r-xs);
}
.compare__bar {
  background: var(--stripe-purple);
  border-radius: var(--r-xs) var(--r-xs) 0 0;
}

.compare__link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--stripe-purple);
  text-decoration: none;
  margin-top: auto;
}
.compare__link:hover { text-decoration: underline; }
.compare__favicon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  background: #181717;
  color: #fff;
  font-family: var(--ff-mono);
  font-size: 9px;
  font-weight: 700;
  border-radius: 3px;
}
```

- [x] **Step 3: Verify**

Reload. Confirm:
- Third row, image on right
- Inside the window-frame: split view, left side mono ASCII table + `[Image: ...]` placeholder + bare URL, right side real HTML table with pill badges + tiny bar chart + clickable link with favicon glyph
- Vertical purple divider down the middle
- Labels at top of each side: `claude-code CLI` (faint) / `folk` (purple)
- Switch to dark mode — the comparison stays legible (CLI side gets darker, folk side stays card-bg)

- [x] **Step 4: Commit**

```bash
git add landing/
git commit -m "feat(landing): rich sessions row with CLI vs folk comparison panel"
```

---

## Task 9: Section 3 — How it works

**Files:**
- Modify: `landing/index.html` (add `.howitworks` section after `.features`)
- Modify: `landing/landing.css` (append howitworks styles)

- [x] **Step 1: Add the section HTML**

After the `</section>` closing `.features`, add:

```html
    <section class="section section--sub howitworks">
      <div class="page">
        <div class="howitworks__head">
          <div class="eyebrow eyebrow--purple eyebrow--center">GET STARTED</div>
          <h2 class="howitworks__heading">Three steps to your first session.</h2>
        </div>
        <div class="howitworks__grid">
          <div class="step-card">
            <div class="step-card__num">01</div>
            <h3 class="step-card__title">Bring your key.</h3>
            <p class="step-card__body">
              Paste an API key from Anthropic, OpenAI, Google, or any OpenAI-compatible endpoint. Stored locally with macOS <code>safeStorage</code> — never leaves your machine.
            </p>
            <code class="step-card__chip">~/Library/Application Support/folk/keys.db</code>
          </div>
          <div class="step-card">
            <div class="step-card__num">02</div>
            <h3 class="step-card__title">Connect your MCP servers.</h3>
            <p class="step-card__body">
              Pick a template (Filesystem, GitHub, Postgres…), fill the form, hit Test. Or import an existing <code>mcp.json</code>.
            </p>
            <code class="step-card__chip">templates: filesystem, github, postgres, slack, notion, +3</code>
          </div>
          <div class="step-card">
            <div class="step-card__num">03</div>
            <h3 class="step-card__title">Start a session.</h3>
            <p class="step-card__body">
              Open a folder, pick a model, optionally tweak permissions. The exact <code>claude-code</code> invocation is previewed before launch.
            </p>
            <code class="step-card__chip">claude-code --model sonnet-4.6 --cwd ~/code/folk</code>
          </div>
        </div>
        <div class="howitworks__footnote">No accounts. No telemetry. No phone-home.</div>
      </div>
    </section>
```

- [x] **Step 2: Add styles**

Append to `landing/landing.css`:

```css
/* ============================================================ How it works */
.howitworks__head {
  text-align: center;
  margin-bottom: 48px;
}
.howitworks__heading {
  font-size: 36px;
  font-weight: 300;
  letter-spacing: -0.015em;
  color: var(--heading);
  margin: 12px 0 0;
}
.howitworks__grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
}
.step-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  box-shadow: var(--sh-ambient);
  padding: 32px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.step-card__num {
  font-family: var(--ff-mono);
  font-size: 32px;
  font-weight: 500;
  color: var(--stripe-purple);
  font-feature-settings: "tnum";
  line-height: 1;
}
.step-card__title {
  font-size: 18px;
  font-weight: 500;
  color: var(--heading);
  margin: 0;
}
.step-card__body {
  font-size: 14px;
  color: var(--body);
  line-height: 1.55;
  margin: 0;
}
.step-card__body code {
  font-family: var(--ff-mono);
  font-size: 12px;
  background: var(--bg-sub);
  border: 1px solid var(--border);
  border-radius: var(--r-xs);
  padding: 1px 4px;
  color: var(--heading);
}
.step-card__chip {
  display: block;
  font-family: var(--ff-mono);
  font-size: 12px;
  background: var(--bg-sink);
  border: 1px solid var(--border);
  border-radius: var(--r-xs);
  padding: 8px 10px;
  color: var(--fg-muted);
  margin-top: auto;
  overflow-x: auto;
  white-space: nowrap;
}
.howitworks__footnote {
  text-align: center;
  font-size: 13px;
  color: var(--fg-faint);
  margin-top: 40px;
}
```

- [x] **Step 3: Verify**

Reload. Confirm:
- Section has `--bg-sub` background (subtle off-white separation from above)
- Centered eyebrow + heading
- Three equal-width cards, each with `01`/`02`/`03` purple mono number, title, body, and a mono chip at the bottom
- Centered footnote line below
- Dark mode: cards keep contrast, mono chips remain legible

- [x] **Step 4: Commit**

```bash
git add landing/
git commit -m "feat(landing): how-it-works section with three step cards"
```

---

## Task 10: Section 4 — Provider grid

**Files:**
- Modify: `landing/index.html` (add `.providers` section)
- Modify: `landing/landing.css` (append provider grid styles)

7 cards: 6 brand-monogram cards + 1 "Custom endpoint" card with dashed border. Brand monograms are colored squares with single letters — no trademarked logos shipped.

- [x] **Step 1: Add the section HTML**

After the `</section>` closing `.howitworks`, add:

```html
    <section class="section section--sub providers" id="providers">
      <div class="page">
        <div class="providers__head">
          <div class="eyebrow eyebrow--purple eyebrow--center">MODEL PROVIDERS</div>
          <h2 class="providers__heading">Bring your own model.</h2>
          <p class="providers__subhead">
            folk doesn't lock you to one vendor. Configure as many providers as you want, switch per session, or run them side-by-side.
          </p>
        </div>
        <div class="providers__grid">
          <div class="provider-card">
            <div class="provider-card__head">
              <span class="provider-card__monogram" style="background:#d97757">A</span>
              <span class="badge badge-ac">7 models</span>
            </div>
            <h3 class="provider-card__name">Anthropic</h3>
            <p class="provider-card__body">Claude Opus, Sonnet, Haiku — direct from console.anthropic.com.</p>
            <code class="provider-card__id">anthropic</code>
          </div>
          <div class="provider-card">
            <div class="provider-card__head">
              <span class="provider-card__monogram" style="background:#0d0d0d">O</span>
              <span class="badge badge-ac">6 models</span>
            </div>
            <h3 class="provider-card__name">OpenAI</h3>
            <p class="provider-card__body">GPT-5, o3, o4-mini — including codex-cli compatible models.</p>
            <code class="provider-card__id">openai</code>
          </div>
          <div class="provider-card">
            <div class="provider-card__head">
              <span class="provider-card__monogram" style="background:#1a73e8">G</span>
              <span class="badge badge-ac">4 models</span>
            </div>
            <h3 class="provider-card__name">Google</h3>
            <p class="provider-card__body">Gemini 2.5 Pro/Flash via AI Studio or Vertex.</p>
            <code class="provider-card__id">google</code>
          </div>
          <div class="provider-card">
            <div class="provider-card__head">
              <span class="provider-card__monogram" style="background:#533afd">Z</span>
              <span class="badge badge-ac">3 models</span>
            </div>
            <h3 class="provider-card__name">GLM / Zhipu</h3>
            <p class="provider-card__body">GLM-4.6, GLM-4-Air — China-region capable.</p>
            <code class="provider-card__id">glm</code>
          </div>
          <div class="provider-card">
            <div class="provider-card__head">
              <span class="provider-card__monogram" style="background:#1c1e54">K</span>
              <span class="badge badge-ac">2 models</span>
            </div>
            <h3 class="provider-card__name">Kimi / Moonshot</h3>
            <p class="provider-card__body">Kimi-K2 long-context (200K+ tokens).</p>
            <code class="provider-card__id">kimi</code>
          </div>
          <div class="provider-card">
            <div class="provider-card__head">
              <span class="provider-card__monogram" style="background:#ea2261">Q</span>
              <span class="badge badge-ac">3 models</span>
            </div>
            <h3 class="provider-card__name">Qwen</h3>
            <p class="provider-card__body">Qwen3-Coder, Qwen3-Max — Alibaba Cloud or open-weight.</p>
            <code class="provider-card__id">qwen</code>
          </div>
          <div class="provider-card provider-card--custom">
            <div class="provider-card__head">
              <span class="provider-card__monogram provider-card__monogram--plus" aria-hidden="true">+</span>
            </div>
            <h3 class="provider-card__name">Custom endpoint</h3>
            <p class="provider-card__body">Any OpenAI-compatible API. Paste a base URL and key.</p>
            <code class="provider-card__id">custom</code>
          </div>
        </div>
      </div>
    </section>
```

- [x] **Step 2: Add provider styles**

Append to `landing/landing.css`:

```css
/* ============================================================ Provider grid */
.providers__head {
  text-align: center;
  margin-bottom: 48px;
}
.providers__heading {
  font-size: 36px;
  font-weight: 300;
  letter-spacing: -0.015em;
  color: var(--heading);
  margin: 12px 0 16px;
}
.providers__subhead {
  font-size: 16px;
  color: var(--body);
  max-width: 600px;
  line-height: 1.55;
  margin: 0 auto;
}
.providers__grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}
.provider-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--r);
  box-shadow: var(--sh-ambient);
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 140px;
  transition: box-shadow .12s, transform .12s;
}
.provider-card:hover {
  box-shadow: var(--sh-standard);
  transform: translateY(-1px);
}
.provider-card--custom {
  border: 1px dashed var(--border-dashed);
  background: transparent;
  box-shadow: none;
}
.provider-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.provider-card__monogram {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--r-xs);
  color: #fff;
  font-weight: 600;
  font-size: 14px;
  font-family: var(--ff-sans);
}
.provider-card__monogram--plus {
  background: var(--stripe-purple-bg) !important;
  color: var(--stripe-purple);
  font-weight: 400;
  font-size: 18px;
  border: 1px dashed var(--border-dashed);
}
.provider-card__name {
  font-size: 16px;
  font-weight: 500;
  color: var(--heading);
  margin: 0;
}
.provider-card__body {
  font-size: 13px;
  color: var(--body);
  line-height: 1.5;
  margin: 0;
}
.provider-card__id {
  display: inline-block;
  font-family: var(--ff-mono);
  font-size: 11px;
  color: var(--fg-muted);
  background: var(--bg-sink);
  border: 1px solid var(--border);
  border-radius: var(--r-xs);
  padding: 2px 6px;
  margin-top: auto;
  align-self: flex-start;
}
```

- [x] **Step 3: Verify**

Reload. Confirm:
- 4-column grid with 7 provider cards (the 7th wraps to a second row)
- Each card has a colored monogram chip top-left, a model-count badge top-right
- Custom card has dashed border, no model count, plus-icon chip
- Hover: cards lift slightly with deeper shadow

- [x] **Step 4: Commit**

```bash
git add landing/
git commit -m "feat(landing): provider grid with 6 brand cards plus custom endpoint"
```

---

## Task 11: Section 5 — Open-source dark band

**Files:**
- Modify: `landing/index.html` (add `.commitments` section)
- Modify: `landing/landing.css` (append commitments styles)

This is the **only dark band** on the page — full-bleed `--brand-dark` background with white text.

- [x] **Step 1: Add the section HTML**

After the `</section>` closing `.providers`, add:

```html
    <section class="commitments" id="open-source">
      <div class="page commitments__inner">
        <div class="eyebrow commitments__eyebrow">THE COMMITMENTS</div>
        <h2 class="commitments__heading">Local-first. BYO-key. No phone-home.</h2>
        <p class="commitments__body">
          folk doesn't have an account system, doesn't ship telemetry, and doesn't run any of your sessions through our servers. Your keys stay in macOS Keychain. Your sessions stay in <code>~/.claude/</code>. Your MCP configs stay on disk.
        </p>
        <div class="commitments__grid">
          <div class="commitment">
            <svg class="commitment__icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
              <rect x="4" y="10" width="16" height="10" rx="2"/>
              <path d="M8 10V7a4 4 0 0 1 8 0v3"/>
            </svg>
            <h3 class="commitment__title">Local-first</h3>
            <p class="commitment__body">Sessions, keys, configs, and history all live on your machine. No cloud sync, no account.</p>
          </div>
          <div class="commitment">
            <svg class="commitment__icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
              <circle cx="9" cy="12" r="4"/>
              <path d="M13 12h8M17 12v3M19 12v2"/>
            </svg>
            <h3 class="commitment__title">BYO-key</h3>
            <p class="commitment__body">You bring keys for the providers you want. We're not in the inference business.</p>
          </div>
          <div class="commitment">
            <svg class="commitment__icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
              <path d="M12 3v18M5 7h14M5 7l-2 6h4zM19 7l-2 6h4z"/>
            </svg>
            <h3 class="commitment__title">MIT licensed</h3>
            <p class="commitment__body">Source on GitHub. Read it, fork it, audit the binary. We sign every release.</p>
          </div>
        </div>
        <div class="commitments__cta">
          <a href="https://github.com/folk-app/folk" class="btn btn-lg commitments__btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 .5a11.5 11.5 0 0 0-3.63 22.42c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.34-1.3-1.7-1.3-1.7-1.07-.73.08-.71.08-.71 1.18.08 1.8 1.21 1.8 1.21 1.05 1.8 2.76 1.28 3.43.98.1-.76.41-1.28.74-1.57-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.2-3.1-.12-.3-.52-1.47.11-3.06 0 0 .98-.31 3.21 1.18a11.13 11.13 0 0 1 5.85 0c2.23-1.49 3.21-1.18 3.21-1.18.63 1.59.23 2.76.11 3.06.75.81 1.2 1.84 1.2 3.1 0 4.42-2.69 5.39-5.25 5.68.42.36.8 1.07.8 2.16v3.2c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5z"/>
            </svg>
            View source on GitHub
          </a>
          <code class="commitments__clone">git clone github.com/folk-app/folk</code>
        </div>
      </div>
    </section>
```

- [x] **Step 2: Add commitments styles**

Append to `landing/landing.css`:

```css
/* ============================================================ Commitments dark band */
.commitments {
  background: var(--brand-dark);
  color: #fff;
  padding: 120px 0;
}
.commitments__inner {
  max-width: 1120px;
}
.commitments__eyebrow {
  color: var(--stripe-purple-light);
}
.commitments__heading {
  color: #fff;
  font-size: 40px;
  font-weight: 300;
  letter-spacing: -0.02em;
  margin: 12px 0 24px;
  max-width: 720px;
  line-height: 1.15;
}
.commitments__body {
  font-size: 17px;
  color: rgba(255,255,255,0.75);
  max-width: 640px;
  line-height: 1.6;
  margin: 0;
}
.commitments__body code {
  font-family: var(--ff-mono);
  font-size: 14px;
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: var(--r-xs);
  padding: 1px 5px;
  color: #fff;
}
.commitments__grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
  margin-top: 40px;
}
.commitment {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.commitment__icon {
  color: var(--stripe-purple-light);
}
.commitment__title {
  font-size: 16px;
  font-weight: 500;
  color: #fff;
  margin: 0;
}
.commitment__body {
  font-size: 14px;
  color: rgba(255,255,255,0.6);
  line-height: 1.6;
  margin: 0;
}

.commitments__cta {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-top: 56px;
  flex-wrap: wrap;
}
.commitments__btn {
  background: transparent;
  color: var(--stripe-purple-light);
  border: 1px solid var(--stripe-purple-light);
  box-shadow: none;
}
.commitments__btn:hover {
  background: rgba(83,58,253,0.18);
  color: #fff;
}
.commitments__clone {
  font-family: var(--ff-mono);
  font-size: 12px;
  color: var(--stripe-purple-light);
  cursor: pointer;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.12);
  padding: 6px 10px;
  border-radius: var(--r-xs);
}
.commitments__clone:hover {
  background: rgba(255,255,255,0.08);
}
```

- [x] **Step 3: Add a click-to-copy handler for the git clone chip**

In the inline `<script>` block in `landing/index.html`, before `})();`, add:

```javascript
      // Click-to-copy on the git clone chip
      var cloneChip = document.querySelector('.commitments__clone');
      if (cloneChip) {
        cloneChip.addEventListener('click', function () {
          var text = cloneChip.textContent.trim();
          if (navigator.clipboard) {
            navigator.clipboard.writeText(text);
            var orig = cloneChip.textContent;
            cloneChip.textContent = 'copied!';
            setTimeout(function () { cloneChip.textContent = orig; }, 1200);
          }
        });
      }
```

- [x] **Step 4: Verify**

Reload. Scroll to the dark band. Confirm:
- Full-width dark navy background
- Eyebrow in light purple, large white heading, body text in faded white
- 3 commitments side-by-side with light-purple icons
- CTA row: ghost button (purple text on transparent) + mono `git clone …` chip
- Click the clone chip — text briefly changes to "copied!" and the URL is in your clipboard
- Switch to light theme — band is still dark (this is intentional — it's a brand-color band, not a theme-bound surface)

- [x] **Step 5: Commit**

```bash
git add landing/
git commit -m "feat(landing): open-source commitments dark band with copy-to-clipboard clone chip"
```

---

## Task 12: Section 6 — Footer

**Files:**
- Modify: `landing/index.html` (add `<footer>` after the last section, inside `<main>` or as a sibling)
- Modify: `landing/landing.css` (append footer styles)

- [x] **Step 1: Add footer HTML**

After the `</section>` closing `.commitments`, and after `</main>` if you placed it there, add (placing it as a sibling to `<main>` is cleaner semantically — put it after `</main>`):

```html
  </main>
  <footer class="footer" id="download">
    <div class="page">
      <div class="footer__top">
        <div class="footer__brand">
          <div class="nav__brand">
            <span class="nav__chevron" aria-hidden="true">›</span>
            <span class="nav__wordmark">folk</span>
          </div>
          <p class="footer__tag">A native shell for Claude Code.</p>
          <p class="footer__version">v0.1.0 · Apr 2026 · MIT</p>
        </div>
        <div class="footer__col">
          <h4 class="footer__heading">Product</h4>
          <ul class="footer__links">
            <li><a href="#features">Features</a></li>
            <li><a href="#features">MCP Editor</a></li>
            <li><a href="#providers">Model Providers</a></li>
            <li><a href="https://github.com/folk-app/folk/releases">Changelog</a></li>
            <li><a href="https://github.com/folk-app/folk/projects">Roadmap</a></li>
          </ul>
        </div>
        <div class="footer__col">
          <h4 class="footer__heading">Open source</h4>
          <ul class="footer__links">
            <li><a href="https://github.com/folk-app/folk">GitHub</a></li>
            <li><a href="https://github.com/folk-app/folk/issues">Issues</a></li>
            <li><a href="https://github.com/folk-app/folk/discussions">Discussions</a></li>
            <li><a href="https://github.com/folk-app/folk/blob/main/CONTRIBUTING.md">Contributing</a></li>
            <li><a href="https://github.com/folk-app/folk/blob/main/LICENSE">License</a></li>
          </ul>
        </div>
        <div class="footer__col footer__col--download">
          <h4 class="footer__heading">Download</h4>
          <div class="footer__downloads">
            <a class="btn btn-primary btn-sm footer__dl" href="https://github.com/folk-app/folk/releases/latest/download/folk-apple-silicon.dmg">macOS (Apple Silicon)</a>
            <a class="btn btn-sm footer__dl" href="https://github.com/folk-app/folk/releases/latest/download/folk-intel.dmg">macOS (Intel)</a>
            <span class="btn btn-sm footer__dl footer__dl--soon" aria-disabled="true">
              Windows
              <span class="badge badge-warn">coming soon</span>
            </span>
            <span class="btn btn-sm footer__dl footer__dl--soon" aria-disabled="true">
              Linux
              <span class="badge badge-warn">coming soon</span>
            </span>
          </div>
        </div>
      </div>
      <div class="footer__bottom">
        <div class="footer__legal">© 2026 folk · Not affiliated with Anthropic, PBC.</div>
        <div class="footer__icons">
          <a class="nav__icon-link" href="https://github.com/folk-app/folk" aria-label="GitHub">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .5a11.5 11.5 0 0 0-3.63 22.42c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.34-1.3-1.7-1.3-1.7-1.07-.73.08-.71.08-.71 1.18.08 1.8 1.21 1.8 1.21 1.05 1.8 2.76 1.28 3.43.98.1-.76.41-1.28.74-1.57-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.2-3.1-.12-.3-.52-1.47.11-3.06 0 0 .98-.31 3.21 1.18a11.13 11.13 0 0 1 5.85 0c2.23-1.49 3.21-1.18 3.21-1.18.63 1.59.23 2.76.11 3.06.75.81 1.2 1.84 1.2 3.1 0 4.42-2.69 5.39-5.25 5.68.42.36.8 1.07.8 2.16v3.2c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5z"/></svg>
          </a>
          <a class="nav__icon-link" href="https://github.com/folk-app/folk/releases.atom" aria-label="Changelog RSS feed">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1.5" fill="currentColor"/></svg>
          </a>
          <a class="nav__icon-link" href="mailto:security@folk-app.dev" aria-label="Email security reports">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>
          </a>
        </div>
      </div>
    </div>
  </footer>
```

- [x] **Step 2: Add footer styles**

Append to `landing/landing.css`:

```css
/* ============================================================ Footer */
.footer {
  background: var(--bg);
  border-top: 1px solid var(--border);
  padding: 80px 0 40px;
}
.footer__top {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1.5fr;
  gap: 24px;
  margin-bottom: 48px;
}
.footer__brand .nav__brand {
  margin-bottom: 12px;
}
.footer__tag {
  font-size: 14px;
  color: var(--body);
  margin: 0 0 8px;
  max-width: 280px;
  line-height: 1.5;
}
.footer__version {
  font-family: var(--ff-mono);
  font-size: 12px;
  color: var(--fg-faint);
  margin: 0;
}
.footer__heading {
  font-size: 12px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--fg-muted);
  margin: 0 0 16px;
}
.footer__links {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.footer__links a {
  font-size: 14px;
  color: var(--body);
  text-decoration: none;
  transition: color .12s;
}
.footer__links a:hover {
  color: var(--heading);
}
.footer__downloads {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;
}
.footer__dl {
  width: 100%;
  justify-content: space-between;
}
.footer__dl--soon {
  background: var(--bg-sub);
  color: var(--fg-faint);
  border-color: var(--border);
  cursor: not-allowed;
  pointer-events: none;
}
.footer__bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid var(--border);
  padding-top: 24px;
}
.footer__legal {
  font-size: 13px;
  color: var(--fg-faint);
}
.footer__icons {
  display: flex;
  gap: 4px;
}
```

- [x] **Step 3: Verify**

Reload. Confirm:
- Footer with 4-column top row: brand+tag, Product links, Open source links, Download buttons
- Apple Silicon button is purple (primary), Intel is plain
- Windows/Linux buttons are dimmed with `coming soon` badge inline
- Bottom strip: copyright text on left, three icon links on right
- Switch to dark mode — all colors invert correctly

- [x] **Step 4: Commit**

```bash
git add landing/
git commit -m "feat(landing): footer with brand, links, downloads, and bottom strip"
```

---

## Task 13: Responsive media queries

**Files:**
- Modify: `landing/landing.css` (append a `@media` block at the bottom)

Three breakpoints: `≥1120px` (default desktop, no overrides), `768px–1119px` (tablet), `<768px` (mobile).

- [x] **Step 1: Append responsive overrides**

Append to `landing/landing.css`:

```css
/* ============================================================ Responsive */

/* Tablet: 768px – 1119px */
@media (max-width: 1119px) {
  .nav__links { gap: 16px; }
  .hero { padding: 100px 0 64px; }
  .hero__headline { font-size: 44px; }
  .hero__visual { max-width: 100%; }
  .diff-row {
    grid-template-columns: 1fr;
    gap: 32px;
  }
  .diff-row--image-right .diff-row__visual,
  .diff-row--image-left  .diff-row__visual { order: 2; }
  .diff-row--image-right .diff-row__text,
  .diff-row--image-left  .diff-row__text   { order: 1; }
  .howitworks__grid { grid-template-columns: 1fr; }
  .providers__grid { grid-template-columns: repeat(2, 1fr); }
  .commitments__grid { grid-template-columns: 1fr; }
  .footer__top {
    grid-template-columns: 1fr 1fr;
  }
}

/* Mobile: <768px */
@media (max-width: 767px) {
  .page { padding: 0 20px; }
  .nav { height: 52px; }
  .nav__links { display: none; }
  .hero { padding: 64px 0 48px; }
  .hero__headline { font-size: 36px; }
  .hero__subhead { font-size: 16px; }
  .hero__ctas { flex-direction: column; width: 100%; }
  .hero__ctas .btn { width: 100%; justify-content: center; }
  .credibility {
    flex-direction: column;
    gap: 6px;
  }
  .credibility__sep { display: none; }
  .section { padding: 80px 0; }
  .diff-row__heading { font-size: 28px; }
  .commitments__heading { font-size: 30px; }
  .providers__grid { grid-template-columns: 1fr; }
  .footer__top { grid-template-columns: 1fr; }
  .footer__bottom {
    flex-direction: column;
    gap: 12px;
    align-items: flex-start;
  }
}
```

- [x] **Step 2: Verify at three viewport widths**

Reload. Test responsively:
- **1280px** (desktop): everything as designed, 4-col provider grid, side-by-side diff rows.
- **900px** (tablet): diff rows stack with text below visual; provider grid drops to 2 cols; nav links visible but tighter.
- **600px** (mobile): nav center links hidden; hero CTAs stack full-width; commitments grid stacks; footer columns stack.

Use Chrome DevTools device toolbar to resize and confirm. No element overflows the viewport at 360px width.

- [x] **Step 3: Commit**

```bash
git add landing/
git commit -m "feat(landing): responsive breakpoints for tablet and mobile"
```

---

## Task 14: Accessibility audit + fixes

**Files:**
- Modify: `landing/index.html` (any aria/alt fixes)
- Modify: `landing/landing.css` (any focus-visible styles)

- [x] **Step 1: Run an audit checklist manually**

Open the page in Chrome, press `Tab` repeatedly from the top. Confirm:
- Every interactive element gets a visible focus ring (purple `--ring` glow)
- Tab order: nav brand → nav links → GitHub icon → theme toggle → hero CTAs → comparison link → footer links → footer downloads → footer icons
- The theme toggle has `aria-label="Toggle dark mode"` (already in Task 2)
- All `<img>` tags have meaningful `alt` attributes (already in Tasks 3, 6, 7)
- All decorative SVGs have `aria-hidden="true"` (already in Tasks 2, 3, 11, 12)

- [x] **Step 2: Add focus-visible coverage to footer download placeholders + clone chip**

Append to `landing/landing.css`:

```css
.footer__dl--soon:focus-visible,
.commitments__clone:focus-visible,
.compare__link:focus-visible {
  outline: none;
  box-shadow: var(--ring);
  border-radius: var(--r-xs);
}
.commitments__clone {
  /* keyboard-activatable */
  tabindex: 0;
}
```

In `landing/index.html`, on the clone chip, add `tabindex="0"` and a keyboard handler. Change:

```html
<code class="commitments__clone">git clone github.com/folk-app/folk</code>
```

to:

```html
<code class="commitments__clone" tabindex="0" role="button" aria-label="Copy git clone command">git clone github.com/folk-app/folk</code>
```

And in the inline script's clone-copy handler, also handle `Enter`/`Space`:

```javascript
      if (cloneChip) {
        function copyClone() {
          var text = cloneChip.textContent.trim();
          if (navigator.clipboard) {
            navigator.clipboard.writeText(text);
            var orig = cloneChip.textContent;
            cloneChip.textContent = 'copied!';
            setTimeout(function () { cloneChip.textContent = orig; }, 1200);
          }
        }
        cloneChip.addEventListener('click', copyClone);
        cloneChip.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            copyClone();
          }
        });
      }
```

- [x] **Step 3: Run a contrast check**

Open the page in Chrome DevTools → Lighthouse → Run accessibility audit. Confirm score is 95+ and there are no contrast warnings on body text. If any warnings appear, the most likely culprits are `--fg-faint` over `--bg-sub` — adjust by darkening the offending color slightly in landing.css with an override only on the landing page, not in styles.css.

- [x] **Step 4: Commit**

```bash
git add landing/
git commit -m "feat(landing): a11y pass — keyboard support for clone chip, focus rings on extras"
```

---

## Task 15: Capture real screenshots and swap into placeholders

**Files:**
- Create: `landing/screenshots/hero-app.png`
- Create: `landing/screenshots/mcp-editor.png`
- Create: `landing/screenshots/model-providers.png`

The placeholder fallback (`onerror` handler from Task 3) means the page works even without these files. This task replaces the placeholders with real screenshots from the prototype at the repo root.

- [ ] **Step 1: Run the prototype locally**

The prototype is the standalone React app at `/Users/zidnimubarok/code-at-amartha/folk/index.html`. Serve it:

```bash
python3 -m http.server 9000 &
sleep 1
open "http://localhost:9000/"
```

The prototype loads in the browser. Complete the first-run onboarding (or skip it) so the app shell is visible.

- [ ] **Step 2: Capture three screenshots**

For each, use Chrome's DevTools device emulation set to a 1440×900 viewport at 2x DPR, then take a full-element screenshot of the main content area (not the OS chrome — the in-page window-frame in `landing/index.html` provides that).

1. **`hero-app.png`** — Sessions page with an active conversation. Open Sessions in the sidebar, ensure a conversation is loaded with at least one user message and one assistant response (a tool card if possible).
2. **`mcp-editor.png`** — MCP Servers page with the form-editor drawer open on a Postgres or GitHub template. Click an MCP server in the list to open the drawer.
3. **`model-providers.png`** — Model & API page with the Anthropic/OpenAI/Google provider tabs visible across the top.

Save each as PNG to `landing/screenshots/` with the names above. Target file size <300KB per image (use `pngquant` or `oxipng` to compress if needed).

- [ ] **Step 3: Verify the screenshots load in the landing page**

Reload `http://localhost:8000/landing/`. Confirm:
- Hero visual now shows the real Sessions screenshot (no more diagonal-stripe placeholder)
- Differentiator rows 2.1 and 2.2 show their respective screenshots
- Differentiator row 2.3 still shows the HTML/CSS comparison panel (not screenshot-based — correct)
- Resize the browser — screenshots scale down inside their window-frames

- [ ] **Step 4: Commit**

```bash
git add landing/screenshots/
git commit -m "feat(landing): real screenshots for hero, MCP editor, model providers"
```

---

## Self-review

**Spec coverage:**
- Section 1 (Purpose) — covered by all tasks (positioning baked into hero copy in Task 3 + commitments in Task 11).
- Section 2 (Tech stack & file structure) — Task 1.
- Section 3 (Top nav) — Task 2 + Task 4 (theme toggle wiring).
- Section 4 (Hero) — Task 3 + Task 4 (theme) + Task 5 (platform detection).
- Section 5 (Three differentiators) — Tasks 6, 7, 8.
- Section 6 (How it works) — Task 9.
- Section 7 (Provider grid) — Task 10.
- Section 8 (Open-source dark band) — Task 11.
- Section 9 (Footer) — Task 12.
- Section 10 (Responsive) — Task 13.
- Section 11 (Accessibility) — Task 14.
- Section 12 (Out of scope) — confirmed not in plan.
- Section 13 (Open questions) — Task 15 covers screenshots; placeholder URLs (`folk-app/folk`) are used as-is and noted in the README for the engineer to replace before publishing.

**Placeholder scan:** No "TBD"/"TODO" steps. Every code block is complete. Every CSS class referenced in HTML has a corresponding rule in CSS.

**Type/name consistency:** Class names used consistently across tasks (`.diff-row`, `.window-frame`, `.compare__col`, `.provider-card`, `.commitments__clone`, etc.). The clone-copy handler in Task 11 references the same chip element extended in Task 14.

**One known concern noted for the engineer:** The `landing.css` `@import url('../styles.css')` requires the parent directory to be served alongside `landing/`. The README explicitly calls this out and gives the workaround (vendor inline before deploying to a host that doesn't include the parent). This is a deliberate trade-off to avoid duplicating ~700 lines of token CSS.

---

**Plan complete and saved to `docs/superpowers/plans/2026-04-24-landing-page-build.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
