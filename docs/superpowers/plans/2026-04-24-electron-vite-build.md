# folk — Electron + Vite Build Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the standalone HTML/JSX React prototype into a production Electron + Vite app with `@anthropic-ai/claude-agent-sdk` integration, SQLite persistence, MCP management, and multi-provider support.

**Architecture:** SDK-in-Main (main process imports `@anthropic-ai/claude-agent-sdk`, spawns `claude-code` per session). IPC bridges agent events to a React 19 renderer. SQLite stores folk metadata only — message history lives in Claude Code's native JSONL files. Hybrid persistence: SQLite (sessions meta, providers, MCP configs, profile) + Zustand (UI/transient) + localStorage (onboarding flag, last tab).

**Tech Stack:** Electron 35 · electron-vite 3 · React 19 · TypeScript 5.7 · better-sqlite3 12 · Zustand 5 · Vitest · @anthropic-ai/claude-agent-sdk 0.2.119.

**Source material:** Existing prototype files (`index.html`, `pages.jsx`, `mcp.jsx`, `onboarding.jsx`, `shell.jsx`, `data.jsx`, `icons.jsx`, `tweaks-panel.jsx`, `app.css`, `onboarding.css`, `styles.css`) at the repo root. They remain in-tree as reference material until Phase 10 cleanup.

**Assumptions (open questions deferred):**
- Build target: macOS only for the first iteration. Cross-platform can be added by flipping `electron-builder.yml`.
- Auto-update: **off** for v0 (no `electron-updater` wiring).
- Code signing: **off** for v0 (unsigned dev builds).

---

## Phases

1. Scaffolding (Tasks 1–5)
2. Shared types (Task 6)
3. Database layer (Tasks 7–11)
4. Backend services — Agent & MCP (Tasks 12–16)
5. IPC bridge (Tasks 17–19)
6. Renderer foundation (Tasks 20–23)
7. Renderer shell (Tasks 24–26)
8. Renderer pages (Tasks 27–33)
9. Onboarding (Tasks 34–35)
10. Error handling & cleanup (Tasks 36–37)
11. Packaging (Task 38)

---

## Phase 1 — Scaffolding

### Task 1: `package.json` + install dependencies ✅

**Files:**
- Create: `package.json`

- [x] **Step 1: Create `package.json`**

```json
{
  "name": "folk",
  "version": "0.1.0",
  "private": true,
  "description": "folk — a local-first Claude Code desktop app",
  "main": "out/main/index.js",
  "type": "module",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "start": "electron-vite preview",
    "typecheck:node": "tsc --noEmit -p tsconfig.node.json",
    "typecheck:web": "tsc --noEmit -p tsconfig.web.json",
    "typecheck": "npm run typecheck:node && npm run typecheck:web",
    "test": "vitest run",
    "test:watch": "vitest",
    "package:mac": "npm run build && electron-builder --mac --config electron-builder.yml"
  },
  "dependencies": {
    "@anthropic-ai/claude-agent-sdk": "^0.2.119",
    "@anthropic-ai/sdk": "^0.85.0",
    "@electron-toolkit/preload": "^3.0.2",
    "@electron-toolkit/utils": "^4.0.0",
    "better-sqlite3": "^12.8.0",
    "electron-updater": "^6.3.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zustand": "^5.0.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.11",
    "@types/node": "^22.10.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "electron": "^35.0.0",
    "electron-builder": "^26.0.0",
    "electron-vite": "^3.0.0",
    "typescript": "^5.7.0",
    "vite": "^6.0.0",
    "vitest": "^2.1.0"
  }
}
```

- [x] **Step 2: Install dependencies**

Run: `npm install`
Expected: packages installed, `node_modules/` created. Ignore peer-dep warnings from Electron.

- [x] **Step 3: Update `.gitignore`**

Append to `.gitignore`:
```
node_modules
out
dist
.vite
.DS_Store
```

- [x] **Step 4: Commit**

```bash
git add package.json package-lock.json .gitignore
git commit -m "chore: scaffold package.json with Electron+Vite deps"
```

**Completion notes (2026-04-24):** Commit `2ad0599`. 628 packages installed; better-sqlite3 native build succeeded on darwin arm64. Code review flagged non-blocking follow-ups to address in a later polish pass: add `*.tsbuildinfo` / `.env*` / `coverage` to `.gitignore`, add `"engines": { "node": ">=20.19.0" }`, add `"license": "UNLICENSED"`, remove duplicate `"start"` script. `npm audit` shows 6 advisories (5 moderate, 1 high in Electron 35) — accepted for v0 dev builds; revisit at Task 38 before packaging.

---

### Task 2: TypeScript configs ✅

**Files:**
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `tsconfig.web.json`

- [x] **Step 1: Create root `tsconfig.json`**

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.node.json" },
    { "path": "./tsconfig.web.json" }
  ]
}
```

- [x] **Step 2: Create `tsconfig.node.json`** (main + preload + shared)

```json
{
  "compilerOptions": {
    "composite": true,
    "baseUrl": ".",
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "types": ["node", "electron-vite/node"],
    "paths": {
      "@shared/*": ["src/shared/*"]
    }
  },
  "include": ["src/main/**/*", "src/preload/**/*", "src/shared/**/*", "electron.vite.config.ts"]
}
```

- [x] **Step 3: Create `tsconfig.web.json`** (renderer)

```json
{
  "compilerOptions": {
    "composite": true,
    "baseUrl": ".",
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "useDefineForClassFields": true,
    "types": ["vite/client"],
    "paths": {
      "@shared/*": ["src/shared/*"],
      "@/*": ["src/renderer/src/*"]
    }
  },
  "include": ["src/renderer/src/**/*", "src/shared/**/*"]
}
```

- [x] **Step 4: Verify the configs parse cleanly (typecheck deferred to Task 4)**

Do **not** run `npm run typecheck` here — TypeScript 5.x treats "no inputs found" (TS18003) as a hard error, and no `src/**` files exist until Task 4. Instead, validate each JSON file parses:

Run:
```bash
node -e "JSON.parse(require('fs').readFileSync('tsconfig.json','utf8'))" \
  && node -e "JSON.parse(require('fs').readFileSync('tsconfig.node.json','utf8'))" \
  && node -e "JSON.parse(require('fs').readFileSync('tsconfig.web.json','utf8'))"
```
Expected: exit 0 with no output.

Task 4 is the first task that creates real `src/` inputs and will run `npm run typecheck` to validate the full config.

**Plan amendment note (2026-04-24):** Initial draft omitted `baseUrl` (TS5090) and assumed TS18003 was a warning. Both corrections applied above.

- [x] **Step 5: Commit**

```bash
git add tsconfig.json tsconfig.node.json tsconfig.web.json
git commit -m "chore: add TypeScript project references for node + web"
```

**Completion notes (2026-04-24):** Commit `a9f70ec`. Initial typecheck attempt surfaced the two plan bugs (TS5090 missing baseUrl; TS18003 hard-error semantics in TS 5.x), plan was amended, then configs landed cleanly. Code review suggested (non-blocking) enabling `noUncheckedIndexedAccess`, `noFallthroughCasesInSwitch`, `noImplicitOverride` in both leaf tsconfigs — deferred to polish pass.

---

### Task 3: `electron.vite.config.ts` ✅

**Files:**
- Create: `electron.vite.config.ts`

- [x] **Step 1: Write the config**

```ts
import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    }
  },
  renderer: {
    root: 'src/renderer',
    build: {
      rollupOptions: {
        input: resolve('src/renderer/index.html')
      }
    },
    resolve: {
      alias: {
        '@': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [react()]
  }
})
```

- [x] **Step 2: Commit**

```bash
git add electron.vite.config.ts
git commit -m "chore: configure electron-vite with React and path aliases"
```

**Completion notes (2026-04-24):** Commit `c961887`. Electron-vite 3.1.0 confirmed. Code review notes: Vite alias `@shared` matches bare imports while tsconfig `@shared/*` matches subpaths only — non-issue in practice. Optional `build.target: 'chrome134'` polish deferred.

---

### Task 4: Main process entry & window creation ✅

**Files:**
- Create: `src/main/index.ts`
- Create: `resources/` (empty dir placeholder — just commit `.gitkeep`)

- [x] **Step 1: Create `src/main/index.ts`**

```ts
import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    show: false,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow.show())
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.folk.app')
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

- [x] **Step 2: Create placeholder preload so renderer bundle has a target**

Create `src/preload/index.ts`:

```ts
import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

contextBridge.exposeInMainWorld('electron', electronAPI)
contextBridge.exposeInMainWorld('folk', {})
```

- [x] **Step 3: Create placeholder renderer entry**

Create `src/renderer/index.html`:

```html
<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>folk</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Create `src/renderer/src/main.tsx`:

```tsx
import { createRoot } from 'react-dom/client'
import App from './App'

createRoot(document.getElementById('root')!).render(<App />)
```

Create `src/renderer/src/App.tsx`:

```tsx
export default function App() {
  return <div style={{ padding: 40, fontFamily: 'system-ui' }}>folk is booting…</div>
}
```

- [x] **Step 4: Run the dev server**

Run: `npm run dev`
Expected: Electron window opens showing "folk is booting…". Close it (Cmd+Q) to stop.

- [x] **Step 5: Commit**

```bash
git add src/main/index.ts src/preload/index.ts src/renderer/index.html src/renderer/src/main.tsx src/renderer/src/App.tsx
git commit -m "feat: electron app boots with React renderer shell"
```

**Completion notes (2026-04-24):** Commit `06f97b0`. Typecheck + build both exit 0 (main 1.48 kB, preload 0.20 kB, renderer bundle 555 kB). Dev-server visual smoke skipped (headless). Follow-up commit `755b596` added `resources/.gitkeep` (the missed Files entry) and `*.tsbuildinfo` to `.gitignore` — closes the recurring `.tsbuildinfo` hygiene flag from Tasks 1/3/4 reviews.

---

### Task 5: Vitest config ✅

**Files:**
- Create: `vitest.config.ts`

- [x] **Step 1: Write Vitest config**

```ts
import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: false
  },
  resolve: {
    alias: {
      '@shared': resolve('src/shared')
    }
  }
})
```

- [x] **Step 2: Verify Vitest runs on empty test set**

Run: `npm test -- --passWithNoTests`
Expected: exit 0 with "No test files found". This is fine; tests come in Task 7+.

- [x] **Step 3: Commit**

```bash
git add vitest.config.ts
git commit -m "chore: add Vitest config for node tests"
```

**Completion notes (2026-04-24):** Commit `2088690`. Vitest 2.1.9 resolves config + `@shared` alias. Latent concern flagged for Task 7 review: bare `electron:` alias key also matches `electron-updater` / `@electron-toolkit/*` — if any tested module imports those, switch to regex form `{ find: /^electron$/, replacement: ... }`.

**Phase 1 complete** — scaffolding done. App boots, typechecks, builds, and the test runner is wired.

---

## Phase 2 — Shared types

### Task 6: Shared types module ✅

**Files:**
- Create: `src/shared/types.ts`

- [x] **Step 1: Write the type definitions**

```ts
// Convention:
//   `| null`  — persisted column that always exists but may be empty.
//   `?`       — optional key in an input/DTO/nested-JSON shape.

export type SessionStatus = 'idle' | 'running' | 'error' | 'cancelled'

export interface Session {
  id: string
  title: string
  modelId: string
  workingDir: string
  goal: string | null
  flags: string | null
  status: SessionStatus
  createdAt: number
  updatedAt: number
}

export interface SessionConfig {
  title?: string
  modelId: string
  workingDir: string
  goal?: string
  flags?: string
}

export interface ProviderConfig {
  id: string
  name: string
  apiKey: string
  baseUrl: string | null
  models: ModelConfig[]
  isEnabled: boolean
  createdAt: number
}

export interface ModelConfig {
  id: string
  label: string
  enabled: boolean
  contextWindow?: number
  maxOutput?: number
}

export type MCPTransport = 'stdio' | 'http'

export interface MCPServer {
  id: string
  name: string
  template: string | null
  transport: MCPTransport
  command: string | null
  args: string[] | null
  env: Record<string, string> | null
  url: string | null
  isEnabled: boolean
  status: 'running' | 'stopped' | 'error'
  lastError: string | null
  toolCount: number | null
  createdAt: number
}

export interface ToolInfo {
  name: string
  description?: string
}

export interface Profile {
  nickname: string
  pronouns: string
  role: string
  tone: string
  avatarColor: string
  about: string
}

export interface Attachment {
  kind: 'image' | 'text' | 'binary'
  name: string
  mimeType: string
  size: number
  dataBase64: string
}

export interface AgentChunk {
  sessionId: string
  text: string
}

export interface AgentToolCall {
  sessionId: string
  callId: string
  tool: string
  input: unknown
}

export interface AgentToolResult {
  sessionId: string
  callId: string
  tool: string
  output: unknown
  isError?: boolean
}

export interface AgentError {
  sessionId: string
  code: 'auth' | 'quota' | 'offline' | 'cancelled' | 'invalid-model' | 'crash' | 'unknown'
  message: string
  retryable: boolean
}

export interface MCPTemplate {
  id: string
  label: string
  command?: string
  baseArgs?: string[]
  transport: MCPTransport
  fields: Array<{ key: string; label: string; placeholder?: string; secret?: boolean }>
}
```

- [x] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [x] **Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat: define shared types for sessions, providers, MCP, agent events"
```

**Completion notes (2026-04-24):** Commits `28d945e` (initial) + `d0d677e` (amendments from code review). Amendments added: (a) convention header comment for `| null` vs `?`, (b) `'cancelled'` and `'invalid-model'` to `AgentError.code` so user cancels / removed models can be surfaced distinctly from crashes, (c) `MCPTemplate` interface promoted here from `mcp-manager.ts` so the preload API and renderer can import it without a later refactor. **Downstream plan changes:** Task 15 now imports `MCPTemplate` from `@shared/types` instead of declaring it locally; Task 29's "move to shared" instruction is satisfied by Task 6. Task 14's `mapError` can now emit `'cancelled'` when the SDK throws an AbortError during `cancel()`.

---

## Phase 3 — Database layer (TDD)

### Task 7: `Database` class with init + schema migration ✅

**Files:**
- Create: `src/main/database.ts`
- Create: `src/main/database.test.ts`

- [x] **Step 1: Write failing test**

```ts
// src/main/database.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Database } from './database'
import { rmSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('Database.init', () => {
  let dir: string
  let db: Database

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'folk-db-'))
  })

  afterEach(() => {
    db?.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('creates all tables on first init', () => {
    db = new Database(join(dir, 'folk.db'))
    const tables = db.rawTableNames()
    expect(tables).toEqual(
      expect.arrayContaining(['sessions', 'providers', 'mcp_servers', 'profile'])
    )
  })

  it('enables WAL journaling', () => {
    db = new Database(join(dir, 'folk.db'))
    expect(db.rawPragma('journal_mode')).toBe('wal')
  })
})
```

- [x] **Step 2: Run and verify failure**

Run: `npm test -- database`
Expected: FAIL — `./database` not found.

- [x] **Step 3: Implement `Database` class**

```ts
// src/main/database.ts
import BetterSqlite3, { Database as SQLiteDB } from 'better-sqlite3'
import { safeStorage } from 'electron'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  model_id TEXT NOT NULL,
  working_dir TEXT NOT NULL,
  goal TEXT,
  flags TEXT,
  status TEXT NOT NULL DEFAULT 'idle',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  api_key BLOB NOT NULL,
  base_url TEXT,
  models TEXT NOT NULL,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS mcp_servers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  template TEXT,
  transport TEXT NOT NULL,
  command TEXT,
  args TEXT,
  env TEXT,
  url TEXT,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'stopped',
  last_error TEXT,
  tool_count INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  nickname TEXT,
  pronouns TEXT,
  role TEXT,
  tone TEXT,
  avatar_color TEXT,
  about TEXT
);
`

export class Database {
  readonly db: SQLiteDB

  constructor(filePath: string) {
    this.db = new BetterSqlite3(filePath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    this.db.exec(SCHEMA)
  }

  close(): void {
    this.db.close()
  }

  // --- raw helpers used by tests & feature modules ---
  rawTableNames(): string[] {
    return this.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r: any) => r.name as string)
  }

  rawPragma(key: string): string {
    const row = this.db.pragma(key, { simple: true })
    return String(row)
  }

  // --- API-key encryption helpers (used by provider CRUD) ---
  encryptSecret(plain: string): Buffer {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('safeStorage encryption not available on this platform')
    }
    return safeStorage.encryptString(plain)
  }

  decryptSecret(buf: Buffer): string {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('safeStorage encryption not available on this platform')
    }
    return safeStorage.decryptString(buf)
  }
}
```

- [x] **Step 4: Stub `safeStorage` for tests**

Create `src/main/__mocks__/electron.ts`:

```ts
// Test-only stub for Electron's safeStorage API. Aliased from vitest.config.ts.
// Do not import from production code — the electron-vite build does not include this file.

export const safeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (s: string) =>
    Buffer.from('enc:' + Buffer.from(s, 'utf8').toString('base64'), 'utf8'),
  decryptString: (b: Buffer) => {
    const str = b.toString('utf8')
    if (!str.startsWith('enc:')) throw new Error('bad cipher')
    return Buffer.from(str.slice(4), 'base64').toString('utf8')
  }
}
```

The base64 step ensures the plaintext key never appears verbatim in the "encrypted" buffer — otherwise the plaintext-leakage test in Task 9 would pass the substring check by accident.

Edit `vitest.config.ts` to alias `electron` to the mock — use the regex-anchored array form so the alias doesn't collide with `electron-updater` / `@electron-toolkit/*` in future test modules:

```ts
import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: false
  },
  resolve: {
    alias: [
      { find: '@shared', replacement: resolve('src/shared') },
      { find: /^electron$/, replacement: resolve('src/main/__mocks__/electron.ts') }
    ]
  }
})
```

- [x] **Step 5: Run tests and verify pass**

Run: `npm test -- database`
Expected: 2 tests pass.

- [x] **Step 6: Commit**

```bash
git add src/main/database.ts src/main/database.test.ts src/main/__mocks__/electron.ts vitest.config.ts
git commit -m "feat: Database class with schema init and WAL mode"
```

**Completion notes (2026-04-24):** Commits `e75a0e9` (initial) + `7e29954` (amendments from code review). Amendments: tightened NOT NULL constraints on required columns (sessions title/model_id/working_dir/status/created_at/updated_at; providers is_enabled/created_at; mcp_servers is_enabled/status/created_at) to match the shared-type contracts; switched vitest `electron` alias to regex-anchored form `{ find: /^electron$/, ... }` to avoid prefix collision with `electron-updater`/`@electron-toolkit/*` in later task tests; added "test-only" header comment to the mock. Deferred to polish: `user_version` migration runner (unnecessary until first schema change); stricter `rawPragma` typing; `.prepare` generics to drop `as any`. 2/2 tests passing.

---

### Task 8: Session CRUD ✅

**Files:**
- Modify: `src/main/database.ts`
- Modify: `src/main/database.test.ts`

- [x] **Step 1: Add failing tests**

Append to `src/main/database.test.ts`:

```ts
import type { Session } from '@shared/types'

describe('sessions CRUD', () => {
  let dir: string
  let db: Database

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'folk-db-'))
    db = new Database(join(dir, 'folk.db'))
  })

  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('createSession persists and returns the row', () => {
    const s = db.createSession({
      modelId: 'claude-sonnet-4-5',
      workingDir: '/tmp/project'
    })
    expect(s.id).toBeTruthy()
    expect(s.status).toBe('idle')
    expect(s.createdAt).toBeGreaterThan(0)
  })

  it('listSessions returns rows in updatedAt desc', () => {
    db.createSession({ modelId: 'm', workingDir: '/a' })
    const b = db.createSession({ modelId: 'm', workingDir: '/b' })
    db.updateSession(b.id, { title: 'B' })
    const rows = db.listSessions()
    expect(rows[0].id).toBe(b.id)
  })

  it('deleteSession removes the row', () => {
    const s = db.createSession({ modelId: 'm', workingDir: '/a' })
    db.deleteSession(s.id)
    expect(db.getSession(s.id)).toBeNull()
  })
})
```

- [x] **Step 2: Run and verify failure**

Run: `npm test -- database`
Expected: 3 failures on missing methods.

- [x] **Step 3: Implement CRUD**

Add to `src/main/database.ts`:

```ts
import type { Session, SessionConfig } from '@shared/types'
import { randomUUID } from 'node:crypto'

// inside class Database { ... }
createSession(config: SessionConfig): Session {
  const now = Date.now()
  const row: Session = {
    id: randomUUID(),
    title: config.title ?? 'Untitled session',
    modelId: config.modelId,
    workingDir: config.workingDir,
    goal: config.goal ?? null,
    flags: config.flags ?? null,
    status: 'idle',
    createdAt: now,
    updatedAt: now
  }
  this.db
    .prepare(
      `INSERT INTO sessions (id, title, model_id, working_dir, goal, flags, status, created_at, updated_at)
       VALUES (@id, @title, @modelId, @workingDir, @goal, @flags, @status, @createdAt, @updatedAt)`
    )
    .run(row)
  return row
}

listSessions(): Session[] {
  const rows = this.db
    .prepare(`SELECT * FROM sessions ORDER BY updated_at DESC`)
    .all() as Array<Record<string, unknown>>
  return rows.map(this.#toSession)
}

getSession(id: string): Session | null {
  const row = this.db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(id) as
    | Record<string, unknown>
    | undefined
  return row ? this.#toSession(row) : null
}

updateSession(id: string, patch: Partial<Session>): void {
  const existing = this.getSession(id)
  if (!existing) throw new Error(`session ${id} not found`)
  // Guarantee monotonic increase so listSessions ordering is stable even
  // when Date.now() resolution (1ms) is coarser than operation latency.
  const maxRow = this.db
    .prepare(`SELECT MAX(updated_at) AS m FROM sessions`)
    .get() as { m: number | null }
  const nextTs = Math.max(Date.now(), (maxRow.m ?? 0) + 1)
  const merged = { ...existing, ...patch, updatedAt: nextTs }
  this.db
    .prepare(
      `UPDATE sessions SET title = @title, model_id = @modelId, working_dir = @workingDir,
       goal = @goal, flags = @flags, status = @status, updated_at = @updatedAt WHERE id = @id`
    )
    .run(merged)
}

deleteSession(id: string): void {
  this.db.prepare(`DELETE FROM sessions WHERE id = ?`).run(id)
}

#toSession = (row: Record<string, unknown>): Session => ({
  id: row.id as string,
  title: (row.title as string) ?? '',
  modelId: (row.model_id as string) ?? '',
  workingDir: (row.working_dir as string) ?? '',
  goal: (row.goal as string) ?? null,
  flags: (row.flags as string) ?? null,
  status: (row.status as Session['status']) ?? 'idle',
  createdAt: Number(row.created_at ?? 0),
  updatedAt: Number(row.updated_at ?? 0)
})
```

- [x] **Step 4: Run tests**

Run: `npm test -- database`
Expected: all 5 tests pass.

- [x] **Step 5: Commit**

```bash
git add src/main/database.ts src/main/database.test.ts
git commit -m "feat: session CRUD with update-ordered listing"
```

**Completion notes (2026-04-24):** Commit `9c1e754`. 5/5 tests green. Plan amended above to include the monotonic `updatedAt` guard in `updateSession` — without it, create→update within one millisecond ties `updated_at` and SQLite falls back to insertion order, breaking the listing test. Principled deviation approved by spec review. Follow-up: add a dedicated monotonic-invariant test so a future refactor can't silently remove the MAX select.

---

### Task 9: Provider CRUD with encrypted API keys ✅

**Files:**
- Modify: `src/main/database.ts`
- Modify: `src/main/database.test.ts`

- [x] **Step 1: Add failing tests**

Append to `src/main/database.test.ts`:

```ts
import type { ProviderConfig } from '@shared/types'

describe('providers CRUD', () => {
  let dir: string
  let db: Database

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'folk-db-'))
    db = new Database(join(dir, 'folk.db'))
  })

  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('saveProvider encrypts api key at rest', () => {
    db.saveProvider({
      id: 'anthropic',
      name: 'Anthropic',
      apiKey: 'sk-ant-xxx',
      baseUrl: null,
      models: [{ id: 'claude-sonnet-4-5', label: 'Sonnet', enabled: true }],
      isEnabled: true,
      createdAt: Date.now()
    })
    const raw = db.db
      .prepare('SELECT api_key FROM providers WHERE id = ?')
      .get('anthropic') as { api_key: Buffer }
    expect(raw.api_key.toString('utf8')).not.toContain('sk-ant-xxx')
  })

  it('listProviders decrypts api keys', () => {
    db.saveProvider({
      id: 'anthropic',
      name: 'Anthropic',
      apiKey: 'sk-ant-xxx',
      baseUrl: null,
      models: [],
      isEnabled: true,
      createdAt: Date.now()
    })
    const rows = db.listProviders()
    expect(rows[0].apiKey).toBe('sk-ant-xxx')
  })

  it('deleteProvider removes the row', () => {
    db.saveProvider({
      id: 'p1',
      name: 'X',
      apiKey: 'k',
      baseUrl: null,
      models: [],
      isEnabled: true,
      createdAt: Date.now()
    })
    db.deleteProvider('p1')
    expect(db.listProviders().length).toBe(0)
  })
})
```

- [x] **Step 2: Run and verify failure**

Run: `npm test -- database`
Expected: 3 new failures.

- [x] **Step 3: Implement provider CRUD**

Add to `src/main/database.ts`:

```ts
import type { ProviderConfig, ModelConfig } from '@shared/types'

// inside class Database { ... }
saveProvider(p: ProviderConfig): void {
  const encKey = this.encryptSecret(p.apiKey)
  this.db
    .prepare(
      `INSERT INTO providers (id, name, api_key, base_url, models, is_enabled, created_at)
       VALUES (@id, @name, @apiKey, @baseUrl, @models, @isEnabled, @createdAt)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         api_key = excluded.api_key,
         base_url = excluded.base_url,
         models = excluded.models,
         is_enabled = excluded.is_enabled`
    )
    .run({
      id: p.id,
      name: p.name,
      apiKey: encKey,
      baseUrl: p.baseUrl,
      models: JSON.stringify(p.models),
      isEnabled: p.isEnabled ? 1 : 0,
      createdAt: p.createdAt
    })
}

listProviders(): ProviderConfig[] {
  const rows = this.db
    .prepare(`SELECT * FROM providers ORDER BY created_at ASC`)
    .all() as Array<Record<string, unknown>>
  return rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    apiKey: this.decryptSecret(r.api_key as Buffer),
    baseUrl: (r.base_url as string) ?? null,
    models: JSON.parse((r.models as string) ?? '[]') as ModelConfig[],
    isEnabled: Number(r.is_enabled ?? 0) === 1,
    createdAt: Number(r.created_at ?? 0)
  }))
}

deleteProvider(id: string): void {
  this.db.prepare(`DELETE FROM providers WHERE id = ?`).run(id)
}
```

- [x] **Step 4: Run tests**

Run: `npm test -- database`
Expected: all provider tests pass.

- [x] **Step 5: Commit**

```bash
git add src/main/database.ts src/main/database.test.ts
git commit -m "feat: provider CRUD with safeStorage-encrypted API keys"
```

**Completion notes (2026-04-24):** Commit `c4523e1`. 8/8 tests green. Plaintext-leakage check passes because mock encrypts as `'enc:' + base64(plain)` — base64 alphabet never reproduces the source substring for `'sk-ant-xxx'`.

---

### Task 10: MCP server CRUD ✅

**Files:**
- Modify: `src/main/database.ts`
- Modify: `src/main/database.test.ts`

- [x] **Step 1: Add failing tests**

Append to `src/main/database.test.ts`:

```ts
describe('mcp servers CRUD', () => {
  let dir: string
  let db: Database

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'folk-db-'))
    db = new Database(join(dir, 'folk.db'))
  })

  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('saveMCP persists stdio server with args/env round-trip', () => {
    db.saveMCP({
      id: 'fs',
      name: 'Filesystem',
      template: 'filesystem',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
      env: { DEBUG: '1' },
      url: null,
      isEnabled: true,
      status: 'stopped',
      lastError: null,
      toolCount: null,
      createdAt: Date.now()
    })
    const got = db.listMCPs()[0]
    expect(got.args).toEqual(['-y', '@modelcontextprotocol/server-filesystem', '/tmp'])
    expect(got.env).toEqual({ DEBUG: '1' })
  })
})
```

- [x] **Step 2: Run and verify failure**

Run: `npm test -- database`

- [x] **Step 3: Implement MCP CRUD**

Add to `src/main/database.ts`:

```ts
import type { MCPServer } from '@shared/types'

// inside class Database { ... }
saveMCP(m: MCPServer): void {
  this.db
    .prepare(
      `INSERT INTO mcp_servers (id, name, template, transport, command, args, env, url,
         is_enabled, status, last_error, tool_count, created_at)
       VALUES (@id, @name, @template, @transport, @command, @args, @env, @url,
         @isEnabled, @status, @lastError, @toolCount, @createdAt)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name, template = excluded.template, transport = excluded.transport,
         command = excluded.command, args = excluded.args, env = excluded.env, url = excluded.url,
         is_enabled = excluded.is_enabled, status = excluded.status,
         last_error = excluded.last_error, tool_count = excluded.tool_count`
    )
    .run({
      id: m.id,
      name: m.name,
      template: m.template,
      transport: m.transport,
      command: m.command,
      args: m.args ? JSON.stringify(m.args) : null,
      env: m.env ? JSON.stringify(m.env) : null,
      url: m.url,
      isEnabled: m.isEnabled ? 1 : 0,
      status: m.status,
      lastError: m.lastError,
      toolCount: m.toolCount,
      createdAt: m.createdAt
    })
}

listMCPs(): MCPServer[] {
  const rows = this.db
    .prepare(`SELECT * FROM mcp_servers ORDER BY created_at ASC`)
    .all() as Array<Record<string, unknown>>
  return rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    template: (r.template as string) ?? null,
    transport: r.transport as MCPServer['transport'],
    command: (r.command as string) ?? null,
    args: r.args ? (JSON.parse(r.args as string) as string[]) : null,
    env: r.env ? (JSON.parse(r.env as string) as Record<string, string>) : null,
    url: (r.url as string) ?? null,
    isEnabled: Number(r.is_enabled ?? 0) === 1,
    status: r.status as MCPServer['status'],
    lastError: (r.last_error as string) ?? null,
    toolCount: r.tool_count == null ? null : Number(r.tool_count),
    createdAt: Number(r.created_at ?? 0)
  }))
}

deleteMCP(id: string): void {
  this.db.prepare(`DELETE FROM mcp_servers WHERE id = ?`).run(id)
}
```

- [x] **Step 4: Run tests**

Run: `npm test -- database`
Expected: all pass.

- [x] **Step 5: Commit**

```bash
git add src/main/database.ts src/main/database.test.ts
git commit -m "feat: MCP server CRUD with args/env JSON round-trip"
```

**Completion notes (2026-04-24):** Commit `0491d5c`. 9/9 tests green. `saveMCP` UPSERT intentionally omits `created_at` from `DO UPDATE SET` — preserves original creation timestamp across updates (matches `saveProvider` pattern).

---

### Task 11: Profile CRUD (singleton row) ✅

**Files:**
- Modify: `src/main/database.ts`
- Modify: `src/main/database.test.ts`

- [x] **Step 1: Add failing tests**

Append to `src/main/database.test.ts`:

```ts
describe('profile', () => {
  let dir: string
  let db: Database

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'folk-db-'))
    db = new Database(join(dir, 'folk.db'))
  })

  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('getProfile returns defaults when empty', () => {
    const p = db.getProfile()
    expect(p.nickname).toBe('')
    expect(p.avatarColor).toBeTruthy()
  })

  it('saveProfile upserts singleton row', () => {
    db.saveProfile({
      nickname: 'Z',
      pronouns: 'they/them',
      role: 'dev',
      tone: 'direct',
      avatarColor: '#635bff',
      about: 'hi'
    })
    const p = db.getProfile()
    expect(p.nickname).toBe('Z')
    db.saveProfile({ ...p, nickname: 'Zid' })
    expect(db.getProfile().nickname).toBe('Zid')
  })
})
```

- [x] **Step 2: Run and verify failure**

Run: `npm test -- database`

- [x] **Step 3: Implement profile getters/setters**

Add to `src/main/database.ts`:

```ts
import type { Profile } from '@shared/types'

const DEFAULT_PROFILE: Profile = {
  nickname: '',
  pronouns: '',
  role: '',
  tone: '',
  avatarColor: '#635bff',
  about: ''
}

// inside class Database { ... }
getProfile(): Profile {
  const row = this.db.prepare(`SELECT * FROM profile WHERE id = 1`).get() as
    | Record<string, unknown>
    | undefined
  if (!row) return { ...DEFAULT_PROFILE }
  return {
    nickname: (row.nickname as string) ?? '',
    pronouns: (row.pronouns as string) ?? '',
    role: (row.role as string) ?? '',
    tone: (row.tone as string) ?? '',
    avatarColor: (row.avatar_color as string) ?? DEFAULT_PROFILE.avatarColor,
    about: (row.about as string) ?? ''
  }
}

saveProfile(p: Profile): void {
  this.db
    .prepare(
      `INSERT INTO profile (id, nickname, pronouns, role, tone, avatar_color, about)
       VALUES (1, @nickname, @pronouns, @role, @tone, @avatarColor, @about)
       ON CONFLICT(id) DO UPDATE SET
         nickname = excluded.nickname, pronouns = excluded.pronouns,
         role = excluded.role, tone = excluded.tone,
         avatar_color = excluded.avatar_color, about = excluded.about`
    )
    .run(p)
}
```

- [x] **Step 4: Run tests**

Run: `npm test -- database`
Expected: all pass.

- [x] **Step 5: Commit**

```bash
git add src/main/database.ts src/main/database.test.ts
git commit -m "feat: profile singleton with defaults"
```

**Completion notes (2026-04-24):** Commit `426a371`. 11/11 tests green. **Phase 3 complete** — the Database layer (schema + all four entities) is done with full TDD coverage. `db.db` escape hatch kept for raw row inspection in tests; all other access via typed methods.

---

## Phase 4 — Backend services

> **Phase 4 decision (2026-04-24):** The plan's assumed SDK API (`createAgent` factory + `Agent extends EventEmitter`) does not match `@anthropic-ai/claude-agent-sdk@0.2.119`, which actually exports `query({prompt, options}) → Query extends AsyncGenerator<SDKMessage>`. We chose **Option B**: build Tasks 12–16 against the plan's mock (EventEmitter-shaped `Agent`), then add a new **Task 16a** that reconciles AgentManager against the real SDK before Phase 5's IPC work. The `AgentManager`'s external event surface (`chunk`/`thinking`/`toolCall`/`toolResult`/`done`/`error`) stays stable, so downstream code in Phases 5+ is unaffected. Temporary `tsconfig.node.json` paths override keeps typecheck green until 16a removes it. Phase 4 `npm run build` for main will fail until 16a lands — this is known debt.

### Task 12: `AgentManager` skeleton + session registry ✅

**Files:**
- Create: `src/main/agent-manager.ts`
- Create: `src/main/agent-manager.test.ts`
- Create: `src/main/__mocks__/claude-agent-sdk.ts`

- [x] **Step 1: Write failing test**

```ts
// src/main/agent-manager.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { AgentManager } from './agent-manager'
import { Database } from './database'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('AgentManager.createSession', () => {
  let db: Database
  let dir: string
  let mgr: AgentManager

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'folk-agent-'))
    db = new Database(join(dir, 'folk.db'))
    mgr = new AgentManager(db)
  })

  afterEach(() => {
    mgr.dispose()
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('persists a session and exposes it via getSession', async () => {
    db.saveProvider({
      id: 'anthropic',
      name: 'Anthropic',
      apiKey: 'sk-ant',
      baseUrl: null,
      models: [{ id: 'claude-sonnet-4-5', label: 'Sonnet', enabled: true }],
      isEnabled: true,
      createdAt: Date.now()
    })
    const s = await mgr.createSession({
      modelId: 'claude-sonnet-4-5',
      workingDir: dir
    })
    expect(s.id).toBeTruthy()
    expect(mgr.getSession(s.id)).toBeTruthy()
  })
})
```

- [x] **Step 2: Run and verify failure**

Run: `npm test -- agent-manager`

- [x] **Step 3: Create SDK mock**

```ts
// src/main/__mocks__/claude-agent-sdk.ts
import { EventEmitter } from 'node:events'

export class Agent extends EventEmitter {
  opts: Record<string, unknown>
  cancelled = false
  constructor(opts: Record<string, unknown>) {
    super()
    this.opts = opts
  }
  async sendMessage(_text: string, _attachments?: unknown[]): Promise<void> {
    queueMicrotask(() => {
      this.emit('chunk', { text: 'hello' })
      this.emit('done')
    })
  }
  async cancel(): Promise<void> {
    this.cancelled = true
    this.emit('done')
  }
  async dispose(): Promise<void> {
    /* noop */
  }
}

export function createAgent(opts: Record<string, unknown>): Agent {
  return new Agent(opts)
}
```

Alias this in `vitest.config.ts`:

```ts
resolve: {
  alias: {
    '@shared': resolve('src/shared'),
    electron: resolve('src/main/__mocks__/electron.ts'),
    '@anthropic-ai/claude-agent-sdk': resolve('src/main/__mocks__/claude-agent-sdk.ts')
  }
}
```

- [x] **Step 4: Implement `AgentManager` skeleton**

```ts
// src/main/agent-manager.ts
import { EventEmitter } from 'node:events'
import { createAgent, Agent } from '@anthropic-ai/claude-agent-sdk'
import { Database } from './database'
import type {
  Session,
  SessionConfig,
  Attachment,
  AgentChunk,
  AgentToolCall,
  AgentToolResult,
  AgentError
} from '@shared/types'

export interface AgentManagerEvents {
  chunk: (e: AgentChunk) => void
  thinking: (e: AgentChunk) => void
  toolCall: (e: AgentToolCall) => void
  toolResult: (e: AgentToolResult) => void
  done: (e: { sessionId: string }) => void
  error: (e: AgentError) => void
}

export class AgentManager extends EventEmitter {
  #agents = new Map<string, Agent>()
  constructor(private db: Database) {
    super()
  }

  async createSession(config: SessionConfig): Promise<Session> {
    return this.db.createSession(config)
  }

  getSession(id: string): Session | null {
    return this.db.getSession(id)
  }

  listSessions(): Session[] {
    return this.db.listSessions()
  }

  async deleteSession(id: string): Promise<void> {
    const a = this.#agents.get(id)
    if (a) {
      await a.cancel().catch(() => undefined)
      await a.dispose().catch(() => undefined)
      this.#agents.delete(id)
    }
    this.db.deleteSession(id)
  }

  dispose(): void {
    for (const a of this.#agents.values()) {
      void a.dispose().catch(() => undefined)
    }
    this.#agents.clear()
  }

  // exposed so Task 13 can augment
  protected ensureAgent(session: Session): Agent {
    const existing = this.#agents.get(session.id)
    if (existing) return existing
    const provider = this.#resolveProvider(session.modelId)
    const agent = createAgent({
      model: session.modelId,
      workingDirectory: session.workingDir,
      apiKey: provider.apiKey,
      baseUrl: provider.baseUrl ?? undefined,
      mcpServers: this.db.listMCPs().filter((m) => m.isEnabled),
      extraFlags: session.flags ?? ''
    })
    this.#wire(session.id, agent)
    this.#agents.set(session.id, agent)
    return agent
  }

  #resolveProvider(modelId: string) {
    const providers = this.db.listProviders()
    const match = providers.find((p) => p.models.some((m) => m.id === modelId))
    if (!match) throw new Error(`no provider configured for model ${modelId}`)
    return match
  }

  #wire(sessionId: string, agent: Agent): void {
    agent.on('chunk', (e: { text: string }) => this.emit('chunk', { sessionId, text: e.text }))
    agent.on('thinking', (e: { text: string }) =>
      this.emit('thinking', { sessionId, text: e.text })
    )
    agent.on('toolCall', (e: { callId: string; tool: string; input: unknown }) =>
      this.emit('toolCall', { sessionId, ...e })
    )
    agent.on('toolResult', (e: { callId: string; tool: string; output: unknown }) =>
      this.emit('toolResult', { sessionId, ...e })
    )
    agent.on('done', () => this.emit('done', { sessionId }))
    agent.on('error', (err: Error) =>
      this.emit('error', {
        sessionId,
        code: 'crash',
        message: err.message,
        retryable: true
      })
    )
  }
}
```

- [x] **Step 5: Run tests**

Run: `npm test -- agent-manager`
Expected: pass.

- [x] **Step 6: Commit**

```bash
git add src/main/agent-manager.ts src/main/agent-manager.test.ts src/main/__mocks__/claude-agent-sdk.ts vitest.config.ts
git commit -m "feat: AgentManager skeleton with session registry + SDK mock"
```

**Completion notes (2026-04-24):** Commit `f85594e`. 12/12 total tests green, typecheck 0. Implementer flagged real vs. assumed SDK API mismatch — see Phase 4 decision banner above. Kept 5th file diff: `tsconfig.node.json` `paths` override `@anthropic-ai/claude-agent-sdk → src/main/__mocks__/claude-agent-sdk.ts` (to be removed in Task 16a).

---

### Task 13: `AgentManager.sendMessage` streams events ✅

**Files:**
- Modify: `src/main/agent-manager.ts`
- Modify: `src/main/agent-manager.test.ts`

- [x] **Step 1: Add failing test**

Append to `src/main/agent-manager.test.ts`:

```ts
describe('AgentManager.sendMessage', () => {
  let db: Database
  let dir: string
  let mgr: AgentManager

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'folk-agent-'))
    db = new Database(join(dir, 'folk.db'))
    mgr = new AgentManager(db)
    db.saveProvider({
      id: 'anthropic',
      name: 'Anthropic',
      apiKey: 'sk',
      baseUrl: null,
      models: [{ id: 'm', label: 'M', enabled: true }],
      isEnabled: true,
      createdAt: Date.now()
    })
  })

  afterEach(() => {
    mgr.dispose()
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('emits chunk and done events and sets status', async () => {
    const s = await mgr.createSession({ modelId: 'm', workingDir: dir })
    const chunks: string[] = []
    mgr.on('chunk', (e) => chunks.push(e.text))
    const done = new Promise<void>((res) => mgr.once('done', () => res()))
    await mgr.sendMessage(s.id, 'hi')
    await done
    expect(chunks).toEqual(['hello'])
    expect(mgr.getSession(s.id)?.status).toBe('idle')
  })
})
```

- [x] **Step 2: Run and verify failure**

Run: `npm test -- agent-manager`

- [x] **Step 3: Implement `sendMessage`**

Add to `AgentManager` in `src/main/agent-manager.ts`:

```ts
async sendMessage(sessionId: string, text: string, attachments?: Attachment[]): Promise<void> {
  const session = this.db.getSession(sessionId)
  if (!session) throw new Error(`session ${sessionId} not found`)
  this.db.updateSession(sessionId, { status: 'running' })
  const agent = this.ensureAgent(session)

  const cleanup = (): void => {
    this.db.updateSession(sessionId, { status: 'idle' })
  }
  const onDone = (): void => {
    cleanup()
    agent.off('done', onDone)
    agent.off('error', onError)
  }
  const onError = (): void => {
    this.db.updateSession(sessionId, { status: 'error' })
    agent.off('done', onDone)
    agent.off('error', onError)
  }
  agent.once('done', onDone)
  agent.once('error', onError)

  await agent.sendMessage(text, attachments)
}
```

- [x] **Step 4: Run tests**

Run: `npm test -- agent-manager`
Expected: pass.

- [x] **Step 5: Commit**

```bash
git add src/main/agent-manager.ts src/main/agent-manager.test.ts
git commit -m "feat: AgentManager.sendMessage emits streaming events and tracks status"
```

**Completion notes (2026-04-24):** Commit `32be06c`. 13/13 tests green.

---

### Task 14: `AgentManager.cancel` + error mapping ✅

**Files:**
- Modify: `src/main/agent-manager.ts`
- Modify: `src/main/agent-manager.test.ts`
- Modify: `src/main/__mocks__/claude-agent-sdk.ts`

- [x] **Step 1: Augment mock to simulate errors**

Add to `src/main/__mocks__/claude-agent-sdk.ts`:

```ts
export class ErrorAgent extends Agent {
  errorCode: string
  constructor(opts: Record<string, unknown>, code: string) {
    super(opts)
    this.errorCode = code
  }
  async sendMessage(): Promise<void> {
    queueMicrotask(() => {
      const err = new Error(`simulated:${this.errorCode}`)
      ;(err as unknown as { code: string }).code = this.errorCode
      this.emit('error', err)
    })
  }
}

let factory: (opts: Record<string, unknown>) => Agent = (opts) => new Agent(opts)
export function __setFactory(fn: (opts: Record<string, unknown>) => Agent): void {
  factory = fn
}
```

**Also update the existing `createAgent` in the same file** so there is a single implementation that reads from `factory`:

```ts
export function createAgent(opts: Record<string, unknown>): Agent {
  return factory(opts)
}
```

Remove the earlier top-level implementation from Task 12 so only this one remains.

- [x] **Step 2: Add failing tests**

Append to `src/main/agent-manager.test.ts`:

```ts
import { __setFactory, ErrorAgent, Agent as MockAgent } from './__mocks__/claude-agent-sdk'

describe('AgentManager.cancel & error mapping', () => {
  let db: Database
  let dir: string
  let mgr: AgentManager

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'folk-agent-'))
    db = new Database(join(dir, 'folk.db'))
    mgr = new AgentManager(db)
    db.saveProvider({
      id: 'anthropic',
      name: 'Anthropic',
      apiKey: 'sk',
      baseUrl: null,
      models: [{ id: 'm', label: 'M', enabled: true }],
      isEnabled: true,
      createdAt: Date.now()
    })
  })

  afterEach(() => {
    mgr.dispose()
    db.close()
    rmSync(dir, { recursive: true, force: true })
    __setFactory((opts) => new MockAgent(opts))
  })

  it('maps 401 to auth error, not retryable', async () => {
    __setFactory((opts) => new ErrorAgent(opts, '401'))
    const s = await mgr.createSession({ modelId: 'm', workingDir: dir })
    const err = new Promise<AgentError>((res) => mgr.once('error', (e) => res(e)))
    await mgr.sendMessage(s.id, 'hi').catch(() => undefined)
    const e = await err
    expect(e.code).toBe('auth')
    expect(e.retryable).toBe(false)
  })

  it('cancel sets session status to cancelled', async () => {
    const s = await mgr.createSession({ modelId: 'm', workingDir: dir })
    await mgr.sendMessage(s.id, 'hi').catch(() => undefined)
    await mgr.cancel(s.id)
    expect(mgr.getSession(s.id)?.status).toBe('cancelled')
  })
})
```

Also import `AgentError` at the top of the test file.

- [x] **Step 3: Run and verify failure**

Run: `npm test -- agent-manager`

- [x] **Step 4: Implement cancel + error mapping**

Replace the `#wire` method in `src/main/agent-manager.ts`:

```ts
#wire(sessionId: string, agent: Agent): void {
  agent.on('chunk', (e: { text: string }) => this.emit('chunk', { sessionId, text: e.text }))
  agent.on('thinking', (e: { text: string }) =>
    this.emit('thinking', { sessionId, text: e.text })
  )
  agent.on('toolCall', (e: { callId: string; tool: string; input: unknown }) =>
    this.emit('toolCall', { sessionId, ...e })
  )
  agent.on('toolResult', (e: { callId: string; tool: string; output: unknown }) =>
    this.emit('toolResult', { sessionId, ...e })
  )
  agent.on('done', () => this.emit('done', { sessionId }))
  agent.on('error', (err: Error & { code?: string }) =>
    this.emit('error', mapError(sessionId, err))
  )
}

async cancel(sessionId: string): Promise<void> {
  const agent = this.#agents.get(sessionId)
  if (!agent) return
  await agent.cancel().catch(() => undefined)
  this.db.updateSession(sessionId, { status: 'cancelled' })
}
```

Add `mapError` helper at the top of the file:

```ts
function mapError(sessionId: string, err: Error & { code?: string }): AgentError {
  const code = err.code
  if (code === '401') {
    return { sessionId, code: 'auth', message: err.message, retryable: false }
  }
  if (code === '429') {
    return { sessionId, code: 'quota', message: err.message, retryable: true }
  }
  if (code === 'ECONNREFUSED' || code === 'ENETUNREACH') {
    return { sessionId, code: 'offline', message: err.message, retryable: true }
  }
  return { sessionId, code: 'crash', message: err.message, retryable: true }
}
```

- [x] **Step 5: Run tests**

Run: `npm test -- agent-manager`
Expected: all pass.

- [x] **Step 6: Commit**

```bash
git add src/main/agent-manager.ts src/main/agent-manager.test.ts src/main/__mocks__/claude-agent-sdk.ts
git commit -m "feat: AgentManager cancel + auth/quota/offline error mapping"
```

**Completion notes (2026-04-24):** Commit `0ff80be`. 15/15 tests green. TDD red confirmed both expected failures: `crash` code where `auth` expected, and `cancel is not a function`. Note: `cancelled` / `invalid-model` codes from the Task 6 amendment are available in the shared type but not yet emitted by `mapError` — Task 16a should wire them when mapping real SDK errors (AbortError → cancelled; provider-lookup failure → invalid-model).

---

### Task 15: `MCPManager` — templates + config ✅

**Files:**
- Create: `src/main/mcp-manager.ts`
- Create: `src/main/mcp-manager.test.ts`

- [x] **Step 1: Write failing test**

```ts
// src/main/mcp-manager.test.ts
import { describe, it, expect } from 'vitest'
import { MCP_TEMPLATES, templateToServer } from './mcp-manager'

describe('MCP templates', () => {
  it('exposes filesystem, github, postgres, slack, notion, custom', () => {
    expect(Object.keys(MCP_TEMPLATES).sort()).toEqual([
      'custom',
      'filesystem',
      'github',
      'notion',
      'postgres',
      'slack'
    ])
  })

  it('templateToServer fills in command + args from template', () => {
    const s = templateToServer('filesystem', { name: 'FS', args: ['/tmp'] })
    expect(s.transport).toBe('stdio')
    expect(s.command).toBe('npx')
    expect(s.args).toContain('-y')
    expect(s.args).toContain('@modelcontextprotocol/server-filesystem')
    expect(s.args).toContain('/tmp')
  })
})
```

- [x] **Step 2: Run and verify failure**

Run: `npm test -- mcp-manager`

- [x] **Step 3: Implement templates**

```ts
// src/main/mcp-manager.ts
import { randomUUID } from 'node:crypto'
import type { MCPServer, MCPTemplate } from '@shared/types'
import { Database } from './database'

export const MCP_TEMPLATES: Record<string, MCPTemplate> = {
  filesystem: {
    id: 'filesystem',
    label: 'Filesystem',
    command: 'npx',
    baseArgs: ['-y', '@modelcontextprotocol/server-filesystem'],
    transport: 'stdio',
    fields: [{ key: 'path', label: 'Root path', placeholder: '/Users/you/projects' }]
  },
  github: {
    id: 'github',
    label: 'GitHub',
    command: 'npx',
    baseArgs: ['-y', '@modelcontextprotocol/server-github'],
    transport: 'stdio',
    fields: [{ key: 'GITHUB_PERSONAL_ACCESS_TOKEN', label: 'GitHub PAT', secret: true }]
  },
  postgres: {
    id: 'postgres',
    label: 'Postgres',
    command: 'npx',
    baseArgs: ['-y', '@modelcontextprotocol/server-postgres'],
    transport: 'stdio',
    fields: [
      {
        key: 'connectionString',
        label: 'Connection string',
        placeholder: 'postgres://user:pass@host:5432/db'
      }
    ]
  },
  slack: {
    id: 'slack',
    label: 'Slack',
    command: 'npx',
    baseArgs: ['-y', '@modelcontextprotocol/server-slack'],
    transport: 'stdio',
    fields: [
      { key: 'SLACK_BOT_TOKEN', label: 'Bot token', secret: true },
      { key: 'SLACK_TEAM_ID', label: 'Team ID' }
    ]
  },
  notion: {
    id: 'notion',
    label: 'Notion',
    command: 'npx',
    baseArgs: ['-y', '@modelcontextprotocol/server-notion'],
    transport: 'stdio',
    fields: [{ key: 'NOTION_API_KEY', label: 'Integration token', secret: true }]
  },
  custom: {
    id: 'custom',
    label: 'Custom',
    transport: 'stdio',
    fields: []
  }
}

export interface TemplateOverrides {
  name?: string
  args?: string[]
  env?: Record<string, string>
  url?: string | null
  command?: string
  transport?: 'stdio' | 'http'
}

export function templateToServer(
  templateId: string,
  overrides: TemplateOverrides = {}
): MCPServer {
  const tpl = MCP_TEMPLATES[templateId]
  if (!tpl) throw new Error(`unknown template ${templateId}`)
  return {
    id: randomUUID(),
    name: overrides.name ?? tpl.label,
    template: templateId,
    transport: overrides.transport ?? tpl.transport,
    command: overrides.command ?? tpl.command ?? null,
    // Concat semantics: template's baseArgs are prepended to user overrides.
    // Rationale: `baseArgs` is literally "base" (e.g. ['-y', 'server-name']); the user's
    // `args` carries positional params (paths, IDs) appended at the end.
    args: overrides.args
      ? [...(tpl.baseArgs ?? []), ...overrides.args]
      : (tpl.baseArgs ?? []).slice(),
    env: overrides.env ?? null,
    url: overrides.url ?? null,
    isEnabled: true,
    status: 'stopped',
    lastError: null,
    toolCount: null,
    createdAt: Date.now()
  }
}

export class MCPManager {
  constructor(private db: Database) {}

  list(): MCPServer[] {
    return this.db.listMCPs()
  }

  save(server: MCPServer): void {
    this.db.saveMCP(server)
  }

  delete(id: string): void {
    this.db.deleteMCP(id)
  }
}
```

- [x] **Step 4: Run tests**

Run: `npm test -- mcp-manager`
Expected: pass.

- [x] **Step 5: Commit**

```bash
git add src/main/mcp-manager.ts src/main/mcp-manager.test.ts
git commit -m "feat: MCP templates + config manager"
```

**Completion notes (2026-04-24):** Commit `3bf3869`. 17/17 tests green. Plan amended above: `args` override uses **concat** (base + user) not replace. Rationale: the test asserts both baseArgs and override args must appear in the result; replace semantics can't satisfy this and would produce nonsensical invocations (`npx /tmp` instead of `npx -y @modelcontextprotocol/server-filesystem /tmp`). Convention for future callers and template authors: `baseArgs` is literally "base", callers' `args` are positional append (paths, IDs). `env` currently keeps replace semantics (no template has `baseEnv` yet) — revisit when one does.

---

### Task 16: `MCPManager.testConnection` — spawn temp client ✅

**Files:**
- Modify: `src/main/mcp-manager.ts`
- Modify: `src/main/mcp-manager.test.ts`

- [x] **Step 1: Add failing test**

Append to `src/main/mcp-manager.test.ts`:

```ts
import { Database } from './database'
import { MCPManager, templateToServer } from './mcp-manager'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, afterEach } from 'vitest'

describe('MCPManager.testConnection', () => {
  let dir: string
  let db: Database
  let mgr: MCPManager

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'folk-mcp-'))
    db = new Database(join(dir, 'folk.db'))
    mgr = new MCPManager(db)
  })

  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('returns ok:false with a useful error when command is missing', async () => {
    const s = templateToServer('custom', { name: 'X', command: '/no/such/bin', args: [] })
    db.saveMCP(s)
    const res = await mgr.testConnection(s.id)
    expect(res.ok).toBe(false)
    expect(res.error).toBeTruthy()
  })
})
```

- [x] **Step 2: Run and verify failure**

Run: `npm test -- mcp-manager`

- [x] **Step 3: Implement `testConnection`**

Add to `src/main/mcp-manager.ts`:

```ts
import { spawn } from 'node:child_process'
import type { ToolInfo } from '@shared/types'

// inside class MCPManager { ... }
async testConnection(id: string): Promise<{ ok: boolean; tools: ToolInfo[]; error?: string }> {
  const server = this.db.listMCPs().find((m) => m.id === id)
  if (!server) return { ok: false, tools: [], error: 'not found' }
  if (server.transport !== 'stdio' || !server.command) {
    return { ok: false, tools: [], error: 'only stdio transport supported in test-connect' }
  }

  return new Promise((resolve) => {
    const child = spawn(server.command!, server.args ?? [], {
      env: { ...process.env, ...(server.env ?? {}) },
      stdio: ['pipe', 'pipe', 'pipe']
    })
    let stderr = ''
    let resolved = false
    const finish = (out: { ok: boolean; tools: ToolInfo[]; error?: string }): void => {
      if (resolved) return
      resolved = true
      try {
        child.kill('SIGTERM')
      } catch {
        /* ignore */
      }
      resolve(out)
    }
    child.on('error', (err) => finish({ ok: false, tools: [], error: err.message }))
    child.stderr.on('data', (b) => (stderr += b.toString()))

    const initReq = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'folk', version: '0.1' } }
    }
    const listReq = { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }
    child.stdin.write(JSON.stringify(initReq) + '\n')
    child.stdin.write(JSON.stringify(listReq) + '\n')

    let buf = ''
    child.stdout.on('data', (b) => {
      buf += b.toString()
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const msg = JSON.parse(line)
          if (msg.id === 2 && msg.result?.tools) {
            const tools: ToolInfo[] = msg.result.tools.map(
              (t: { name: string; description?: string }) => ({
                name: t.name,
                description: t.description
              })
            )
            this.db.saveMCP({ ...server, toolCount: tools.length, lastError: null })
            finish({ ok: true, tools })
            return
          }
        } catch {
          /* ignore */
        }
      }
    })

    setTimeout(() => {
      this.db.saveMCP({ ...server, lastError: stderr || 'timed out' })
      finish({ ok: false, tools: [], error: stderr || 'timed out' })
    }, 8000)
  })
}
```

- [x] **Step 4: Run tests**

Run: `npm test -- mcp-manager`
Expected: pass (the spawn-failure path returns ok:false within ms).

- [x] **Step 5: Commit**

```bash
git add src/main/mcp-manager.ts src/main/mcp-manager.test.ts
git commit -m "feat: MCPManager.testConnection spawns stdio server and lists tools"
```

**Completion notes (2026-04-24):** Commit `c3e0a8b`. 18/18 tests green. ENOENT path resolves in <10ms via `child.on('error')`. Defensive `try/catch` added around the two `child.stdin.write` calls — on some Node versions the write can throw synchronously when spawn fails before the `'error'` event fires; the catch is empty because `child.on('error')` is the canonical resolution path. **Phase 4 mock-based implementation complete.** Task 16a is next (real-SDK reconciliation) before Phase 5 IPC.

---

### Task 16a: Reconcile `AgentManager` against real SDK ✅

**Files:**
- Modify: `src/main/__mocks__/claude-agent-sdk.ts`
- Modify: `src/main/agent-manager.ts`
- Modify: `src/main/agent-manager.test.ts`
- Modify: `tsconfig.node.json` (remove `paths` override)

**Why this task exists:** Tasks 12–14 were built against a plan-assumed SDK API (`createAgent` factory + `Agent extends EventEmitter`). The installed `@anthropic-ai/claude-agent-sdk@0.2.119` actually exports `query({prompt, options}) → Query extends AsyncGenerator<SDKMessage>`. This task reconciles without disturbing the external event contract that Tasks 15–16 and Phase 5+ depend on.

**Invariant to preserve:** `AgentManager` still emits `chunk`, `thinking`, `toolCall`, `toolResult`, `done`, `error` externally — only the internal bridge between `AgentManager` and the SDK changes.

- [x] **Step 1: Study the real SDK shape**

Read `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts` for: `query`, `Query`, `Options`, `SDKMessage` (and variants `SDKAssistantMessage`, `SDKSystemMessage`, `SDKResultMessage`), `ContentBlock` shapes (text, tool_use, tool_result, thinking). Also skim `AgentMcpServerSpec` since MCP servers plug in via `options.mcpServers`.

- [x] **Step 2: Rewrite the mock to match**

Replace `src/main/__mocks__/claude-agent-sdk.ts` so it exports `query(params)` that returns an `AsyncGenerator<SDKMessage>`-shaped stub plus `interrupt()` / `setModel()` methods. Default behavior: yield one assistant-text message then return. Keep a `__setQueryImpl(fn)` hook so Task 14-equivalent error simulation still works.

- [x] **Step 3: Rewrite `AgentManager` internals**

- Replace `#agents: Map<string, Agent>` with `#streams: Map<string, Query>`.
- `ensureAgent` deleted — sessions don't own long-lived Agent instances. Streams are per-sendMessage.
- `sendMessage(sessionId, text, attachments)` now:
  - Calls `query({ prompt: text, options: { model, cwd, env, mcpServers, permissionMode, ... } })`
  - Stores the `Query` in `#streams` so `cancel` can `interrupt()` it
  - Iterates `for await (const msg of q)` and dispatches each `SDKMessage` to the existing emit helpers via a new `#dispatchMessage(sessionId, msg)` router:
    - `SDKAssistantMessage` text block → `chunk`
    - `ContentBlock` thinking → `thinking`
    - `tool_use` → `toolCall` with callId from `msg.message.id`
    - `tool_result` → `toolResult`
    - `SDKResultMessage` / `SDKSystemMessage` stop-reason → `done`
    - `query` throws → `error` via `mapError`
- `cancel(sessionId)` calls `query.interrupt()` and sets status `'cancelled'`.

- [x] **Step 4: Update tests**

The existing agent-manager tests interact only with `AgentManager`'s external events — they should continue to pass after the internal rewrite, with mock yields matching the new per-message yield shape. Adjust test setup (e.g. replace `__setFactory` calls with `__setQueryImpl`). Still expect all suites green (database + agent-manager).

- [x] **Step 5: Remove `tsconfig.node.json` paths override**

The Task 12 override `"@anthropic-ai/claude-agent-sdk": ["src/main/__mocks__/claude-agent-sdk.ts"]` is no longer needed — `agent-manager.ts` now imports names that the real SDK actually exports. Verify with `npm run typecheck` then `npm run build` (main build should now succeed end-to-end).

- [x] **Step 6: Commit**

```bash
git add src/main/agent-manager.ts src/main/agent-manager.test.ts src/main/__mocks__/claude-agent-sdk.ts tsconfig.node.json
git commit -m "refactor: reconcile AgentManager with real @anthropic-ai/claude-agent-sdk API"
```

**Completion notes (2026-04-24):** Commit `a5491bf`. 18/18 tests green, typecheck 0, build 0. External EventEmitter contract preserved unchanged. Key internal changes: `#streams: Map<string, {abort: AbortController}>` replaces `#agents`; `ensureAgent`/`#wire` deleted; `sendMessage` opens a `query()` per call, iterates with `for await`, routes via `#dispatchMessage`; provider creds plumbed via env `ANTHROPIC_API_KEY` / `ANTHROPIC_BASE_URL`; MCPs passed as `Record<string, McpServerConfig>` keyed by server name; `cancel` aborts the stream (if any) and unconditionally sets status `'cancelled'`; `mapError` extended for `AbortError` → cancelled and `/model.*not.*found|invalid.*model/i` → invalid-model. `tsconfig.node.json` paths override removed. **Phase 5 (IPC) is now unblocked.**

---

## Phase 5 — IPC bridge

### Task 17: IPC request/response handlers ✅

**Files:**
- Create: `src/main/ipc-handlers.ts`
- Modify: `src/main/index.ts`

- [x] **Step 1: Write handler module**

```ts
// src/main/ipc-handlers.ts
import { ipcMain } from 'electron'
import { Database } from './database'
import { AgentManager } from './agent-manager'
import { MCPManager } from './mcp-manager'
import type {
  SessionConfig,
  ProviderConfig,
  MCPServer,
  Profile,
  Attachment
} from '@shared/types'

export function registerIpc(
  db: Database,
  agent: AgentManager,
  mcp: MCPManager
): void {
  ipcMain.handle('sessions:list', () => agent.listSessions())
  ipcMain.handle('sessions:get', (_e, id: string) => agent.getSession(id))
  ipcMain.handle('sessions:create', (_e, config: SessionConfig) => agent.createSession(config))
  ipcMain.handle('sessions:delete', (_e, id: string) => agent.deleteSession(id))

  ipcMain.handle(
    'agent:sendMessage',
    (_e, sessionId: string, text: string, attachments?: Attachment[]) =>
      agent.sendMessage(sessionId, text, attachments)
  )
  ipcMain.handle('agent:cancel', (_e, sessionId: string) => agent.cancel(sessionId))

  ipcMain.handle('providers:list', () => db.listProviders())
  ipcMain.handle('providers:save', (_e, p: ProviderConfig) => db.saveProvider(p))
  ipcMain.handle('providers:delete', (_e, id: string) => db.deleteProvider(id))
  ipcMain.handle('providers:test', async (_e, id: string) => {
    const p = db.listProviders().find((x) => x.id === id)
    if (!p) return { ok: false, error: 'not found' }
    try {
      const res = await fetch((p.baseUrl ?? 'https://api.anthropic.com') + '/v1/models', {
        headers: { 'x-api-key': p.apiKey, 'anthropic-version': '2023-06-01' }
      })
      return { ok: res.ok, error: res.ok ? undefined : `HTTP ${res.status}` }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('mcpServers:list', () => mcp.list())
  ipcMain.handle('mcpServers:save', (_e, s: MCPServer) => mcp.save(s))
  ipcMain.handle('mcpServers:delete', (_e, id: string) => mcp.delete(id))
  ipcMain.handle('mcpServers:test', (_e, id: string) => mcp.testConnection(id))

  ipcMain.handle('profile:get', () => db.getProfile())
  ipcMain.handle('profile:save', (_e, p: Profile) => db.saveProfile(p))
}
```

- [x] **Step 2: Wire up in main entry**

Modify `src/main/index.ts` — add imports and bootstrap at top:

```ts
import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { Database } from './database'
import { AgentManager } from './agent-manager'
import { MCPManager } from './mcp-manager'
import { registerIpc } from './ipc-handlers'
import { wireStreaming } from './ipc-streaming'

let db: Database
let agentManager: AgentManager
let mcpManager: MCPManager
let mainWindow: BrowserWindow | null = null
```

Replace the body of `app.whenReady().then(...)`:

```ts
app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.folk.app')
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  db = new Database(join(app.getPath('userData'), 'folk.db'))
  agentManager = new AgentManager(db)
  mcpManager = new MCPManager(db)
  registerIpc(db, agentManager, mcpManager)

  createWindow()
  if (mainWindow) wireStreaming(agentManager, mainWindow)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  agentManager?.dispose()
  db?.close()
})
```

Modify `createWindow()` to assign `mainWindow`:

```ts
function createWindow(): void {
  mainWindow = new BrowserWindow({ /* existing opts */ })
  /* existing body */
  mainWindow.on('closed', () => (mainWindow = null))
}
```

- [x] **Step 3: Commit**

```bash
git add src/main/ipc-handlers.ts src/main/index.ts
git commit -m "feat: wire IPC request/response handlers for all channels"
```

**Completion notes (2026-04-24):** Commit `fb25099`. Typecheck + build + 18/18 tests all 0/green. Main bundle jumped from 1.5kB → 20.98kB — confirms backend (database, agent-manager, mcp-manager, ipc-handlers) now reachable from entry. Added `mcpServers:templates` channel here (rather than deferring to Task 29) because `MCPTemplate` moved to shared types in Task 6. 17 `ipcMain.handle` registrations total.

---

### Task 18: IPC streaming events (Main → Renderer) ✅

**Files:**
- Create: `src/main/ipc-streaming.ts`

- [x] **Step 1: Implement the forwarder**

```ts
// src/main/ipc-streaming.ts
import { BrowserWindow } from 'electron'
import { AgentManager } from './agent-manager'

export function wireStreaming(agent: AgentManager, win: BrowserWindow): void {
  const send = (channel: string, payload: unknown): void => {
    if (win.isDestroyed()) return
    win.webContents.send(channel, payload)
  }
  agent.on('chunk', (e) => send('agent:chunk', e))
  agent.on('thinking', (e) => send('agent:thinking', e))
  agent.on('toolCall', (e) => send('agent:toolCall', e))
  agent.on('toolResult', (e) => send('agent:toolResult', e))
  agent.on('done', (e) => send('agent:done', e))
  agent.on('error', (e) => send('agent:error', e))
}
```

- [x] **Step 2: Build the main process**

Run: `npm run build`
Expected: builds without errors.

- [x] **Step 3: Commit**

```bash
git add src/main/ipc-streaming.ts src/main/index.ts
git commit -m "feat: forward AgentManager events to renderer via IPC"
```

**Completion notes (2026-04-24):** Commit `0a28764`. Forwarder delegates to `win.webContents.send` with an `isDestroyed()` guard. Wired in `app.whenReady().then(...)` after `createWindow()` returns (TS requires the `if (mainWindow)` guard because the module-level ref is nullable). Main bundle grew by ~550 bytes. 18/18 tests still green.

---

### Task 19: Preload contextBridge API ✅

**Files:**
- Modify: `src/preload/index.ts`
- Create: `src/shared/preload-api.ts`
- Create: `src/renderer/src/env.d.ts`

- [x] **Step 1: Declare the API type**

```ts
// src/shared/preload-api.ts
import type {
  Session,
  SessionConfig,
  ProviderConfig,
  MCPServer,
  Profile,
  Attachment,
  ToolInfo,
  AgentChunk,
  AgentToolCall,
  AgentToolResult,
  AgentError
} from './types'

export interface FolkAPI {
  sessions: {
    list: () => Promise<Session[]>
    get: (id: string) => Promise<Session | null>
    create: (config: SessionConfig) => Promise<Session>
    delete: (id: string) => Promise<void>
  }
  agent: {
    sendMessage: (sessionId: string, text: string, attachments?: Attachment[]) => Promise<void>
    cancel: (sessionId: string) => Promise<void>
    onChunk: (fn: (e: AgentChunk) => void) => () => void
    onThinking: (fn: (e: AgentChunk) => void) => () => void
    onToolCall: (fn: (e: AgentToolCall) => void) => () => void
    onToolResult: (fn: (e: AgentToolResult) => void) => () => void
    onDone: (fn: (e: { sessionId: string }) => void) => () => void
    onError: (fn: (e: AgentError) => void) => () => void
  }
  providers: {
    list: () => Promise<ProviderConfig[]>
    save: (p: ProviderConfig) => Promise<void>
    delete: (id: string) => Promise<void>
    test: (id: string) => Promise<{ ok: boolean; error?: string }>
  }
  mcp: {
    list: () => Promise<MCPServer[]>
    save: (s: MCPServer) => Promise<void>
    delete: (id: string) => Promise<void>
    test: (id: string) => Promise<{ ok: boolean; tools: ToolInfo[]; error?: string }>
  }
  profile: {
    get: () => Promise<Profile>
    save: (p: Profile) => Promise<void>
  }
}
```

- [x] **Step 2: Implement the bridge**

Replace `src/preload/index.ts`:

```ts
import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { FolkAPI } from '@shared/preload-api'

function listen<T>(channel: string, fn: (e: T) => void): () => void {
  const wrapper = (_e: unknown, payload: T): void => fn(payload)
  ipcRenderer.on(channel, wrapper)
  return () => ipcRenderer.removeListener(channel, wrapper)
}

const folk: FolkAPI = {
  sessions: {
    list: () => ipcRenderer.invoke('sessions:list'),
    get: (id) => ipcRenderer.invoke('sessions:get', id),
    create: (config) => ipcRenderer.invoke('sessions:create', config),
    delete: (id) => ipcRenderer.invoke('sessions:delete', id)
  },
  agent: {
    sendMessage: (sessionId, text, attachments) =>
      ipcRenderer.invoke('agent:sendMessage', sessionId, text, attachments),
    cancel: (sessionId) => ipcRenderer.invoke('agent:cancel', sessionId),
    onChunk: (fn) => listen('agent:chunk', fn),
    onThinking: (fn) => listen('agent:thinking', fn),
    onToolCall: (fn) => listen('agent:toolCall', fn),
    onToolResult: (fn) => listen('agent:toolResult', fn),
    onDone: (fn) => listen('agent:done', fn),
    onError: (fn) => listen('agent:error', fn)
  },
  providers: {
    list: () => ipcRenderer.invoke('providers:list'),
    save: (p) => ipcRenderer.invoke('providers:save', p),
    delete: (id) => ipcRenderer.invoke('providers:delete', id),
    test: (id) => ipcRenderer.invoke('providers:test', id)
  },
  mcp: {
    list: () => ipcRenderer.invoke('mcpServers:list'),
    save: (s) => ipcRenderer.invoke('mcpServers:save', s),
    delete: (id) => ipcRenderer.invoke('mcpServers:delete', id),
    test: (id) => ipcRenderer.invoke('mcpServers:test', id)
  },
  profile: {
    get: () => ipcRenderer.invoke('profile:get'),
    save: (p) => ipcRenderer.invoke('profile:save', p)
  }
}

contextBridge.exposeInMainWorld('electron', electronAPI)
contextBridge.exposeInMainWorld('folk', folk)
```

- [x] **Step 3: Add global type for renderer**

Create `src/renderer/src/env.d.ts`:

```ts
/// <reference types="vite/client" />
import type { FolkAPI } from '@shared/preload-api'

declare global {
  interface Window {
    folk: FolkAPI
  }
}

export {}
```

- [x] **Step 4: Typecheck & build**

Run: `npm run typecheck && npm run build`
Expected: exit 0.

- [x] **Step 5: Commit**

```bash
git add src/preload/index.ts src/shared/preload-api.ts src/renderer/src/env.d.ts
git commit -m "feat: preload contextBridge exposes typed Folk API"
```

**Completion notes (2026-04-24):** Commit `d08927c`. Typecheck + build + 18/18 tests all 0/green. Preload bundle 0.2kB → 1.89kB. `listen<T>` helper captures a named closure so `ipcRenderer.removeListener` targets only that subscriber (concurrent listeners on the same channel aren't disturbed). All 17 channel names align 1:1 between `ipc-handlers.ts` registrations and the preload invokes. **Phase 5 (IPC bridge) complete. Renderer can now consume `window.folk` with full type safety.**

---

## Phase 6 — Renderer foundation

### Task 20: Port global styles

**Files:**
- Create: `src/renderer/src/styles/tokens.css`
- Create: `src/renderer/src/styles/components.css`
- Create: `src/renderer/src/styles/onboarding.css`
- Modify: `src/renderer/src/main.tsx`

- [ ] **Step 1: Copy existing CSS files into new locations**

```bash
cp styles.css src/renderer/src/styles/tokens.css
cp app.css src/renderer/src/styles/components.css
cp onboarding.css src/renderer/src/styles/onboarding.css
```

- [ ] **Step 2: Import them in `main.tsx`**

Replace `src/renderer/src/main.tsx`:

```tsx
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/tokens.css'
import './styles/components.css'
import './styles/onboarding.css'

createRoot(document.getElementById('root')!).render(<App />)
```

- [ ] **Step 3: Run dev server and verify styles load**

Run: `npm run dev`
Expected: Electron window opens; inspect DevTools → the design-token CSS variables (`--stripe-purple` etc.) should resolve on the `html` element.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/styles src/renderer/src/main.tsx
git commit -m "chore: port design-system CSS into renderer"
```

---

### Task 21: Zustand stores

**Files:**
- Create: `src/renderer/src/stores/useSessionStore.ts`
- Create: `src/renderer/src/stores/useProvidersStore.ts`
- Create: `src/renderer/src/stores/useMCPStore.ts`
- Create: `src/renderer/src/stores/useProfileStore.ts`
- Create: `src/renderer/src/stores/useUIStore.ts`

- [ ] **Step 1: Sessions store**

```ts
// src/renderer/src/stores/useSessionStore.ts
import { create } from 'zustand'
import type {
  Session,
  AgentChunk,
  AgentToolCall,
  AgentToolResult,
  AgentError
} from '@shared/types'

export type MessageRole = 'user' | 'assistant' | 'system'

export interface ChatMessage {
  id: string
  role: MessageRole
  text: string
  toolCalls: Array<{ callId: string; tool: string; input: unknown; output?: unknown; isError?: boolean }>
  thinking: string
  error?: AgentError
  createdAt: number
}

interface SessionState {
  sessions: Session[]
  activeId: string | null
  messages: Record<string, ChatMessage[]>
  setSessions: (s: Session[]) => void
  upsertSession: (s: Session) => void
  removeSession: (id: string) => void
  setActive: (id: string | null) => void
  pushUserMessage: (sessionId: string, text: string) => string
  appendChunk: (e: AgentChunk) => void
  appendThinking: (e: AgentChunk) => void
  appendToolCall: (e: AgentToolCall) => void
  appendToolResult: (e: AgentToolResult) => void
  setError: (e: AgentError) => void
}

const ensureAssistant = (messages: ChatMessage[]): ChatMessage[] => {
  const last = messages[messages.length - 1]
  if (last && last.role === 'assistant') return messages
  return [
    ...messages,
    {
      id: crypto.randomUUID(),
      role: 'assistant',
      text: '',
      toolCalls: [],
      thinking: '',
      createdAt: Date.now()
    }
  ]
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  activeId: null,
  messages: {},
  setSessions: (sessions) => set({ sessions }),
  upsertSession: (s) =>
    set((st) => {
      const idx = st.sessions.findIndex((x) => x.id === s.id)
      const next = [...st.sessions]
      if (idx >= 0) next[idx] = s
      else next.unshift(s)
      return { sessions: next }
    }),
  removeSession: (id) =>
    set((st) => ({
      sessions: st.sessions.filter((x) => x.id !== id),
      activeId: st.activeId === id ? null : st.activeId
    })),
  setActive: (id) => set({ activeId: id }),
  pushUserMessage: (sessionId, text) => {
    const id = crypto.randomUUID()
    set((st) => ({
      messages: {
        ...st.messages,
        [sessionId]: [
          ...(st.messages[sessionId] ?? []),
          {
            id,
            role: 'user',
            text,
            toolCalls: [],
            thinking: '',
            createdAt: Date.now()
          }
        ]
      }
    }))
    return id
  },
  appendChunk: ({ sessionId, text }) =>
    set((st) => {
      const cur = ensureAssistant(st.messages[sessionId] ?? [])
      const next = [...cur]
      next[next.length - 1] = { ...next[next.length - 1], text: next[next.length - 1].text + text }
      return { messages: { ...st.messages, [sessionId]: next } }
    }),
  appendThinking: ({ sessionId, text }) =>
    set((st) => {
      const cur = ensureAssistant(st.messages[sessionId] ?? [])
      const next = [...cur]
      next[next.length - 1] = {
        ...next[next.length - 1],
        thinking: next[next.length - 1].thinking + text
      }
      return { messages: { ...st.messages, [sessionId]: next } }
    }),
  appendToolCall: ({ sessionId, callId, tool, input }) =>
    set((st) => {
      const cur = ensureAssistant(st.messages[sessionId] ?? [])
      const next = [...cur]
      next[next.length - 1] = {
        ...next[next.length - 1],
        toolCalls: [...next[next.length - 1].toolCalls, { callId, tool, input }]
      }
      return { messages: { ...st.messages, [sessionId]: next } }
    }),
  appendToolResult: ({ sessionId, callId, tool, output, isError }) =>
    set((st) => {
      const cur = st.messages[sessionId] ?? []
      const next = cur.map((m) => {
        if (m.role !== 'assistant') return m
        return {
          ...m,
          toolCalls: m.toolCalls.map((t) =>
            t.callId === callId ? { ...t, tool, output, isError } : t
          )
        }
      })
      return { messages: { ...st.messages, [sessionId]: next } }
    }),
  setError: (e) =>
    set((st) => {
      const cur = ensureAssistant(st.messages[e.sessionId] ?? [])
      const next = [...cur]
      next[next.length - 1] = { ...next[next.length - 1], error: e }
      return { messages: { ...st.messages, [e.sessionId]: next } }
    })
}))
```

- [ ] **Step 2: Providers store**

```ts
// src/renderer/src/stores/useProvidersStore.ts
import { create } from 'zustand'
import type { ProviderConfig } from '@shared/types'

interface ProvidersState {
  providers: ProviderConfig[]
  hydrated: boolean
  load: () => Promise<void>
  save: (p: ProviderConfig) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const useProvidersStore = create<ProvidersState>((set, get) => ({
  providers: [],
  hydrated: false,
  load: async () => {
    const providers = await window.folk.providers.list()
    set({ providers, hydrated: true })
  },
  save: async (p) => {
    await window.folk.providers.save(p)
    await get().load()
  },
  remove: async (id) => {
    await window.folk.providers.delete(id)
    await get().load()
  }
}))
```

- [ ] **Step 3: MCP store**

```ts
// src/renderer/src/stores/useMCPStore.ts
import { create } from 'zustand'
import type { MCPServer, ToolInfo } from '@shared/types'

interface MCPState {
  servers: MCPServer[]
  hydrated: boolean
  load: () => Promise<void>
  save: (s: MCPServer) => Promise<void>
  remove: (id: string) => Promise<void>
  test: (id: string) => Promise<{ ok: boolean; tools: ToolInfo[]; error?: string }>
}

export const useMCPStore = create<MCPState>((set, get) => ({
  servers: [],
  hydrated: false,
  load: async () => {
    const servers = await window.folk.mcp.list()
    set({ servers, hydrated: true })
  },
  save: async (s) => {
    await window.folk.mcp.save(s)
    await get().load()
  },
  remove: async (id) => {
    await window.folk.mcp.delete(id)
    await get().load()
  },
  test: async (id) => {
    const res = await window.folk.mcp.test(id)
    await get().load()
    return res
  }
}))
```

- [ ] **Step 4: Profile store**

```ts
// src/renderer/src/stores/useProfileStore.ts
import { create } from 'zustand'
import type { Profile } from '@shared/types'

interface ProfileState {
  profile: Profile | null
  load: () => Promise<void>
  save: (p: Profile) => Promise<void>
}

export const useProfileStore = create<ProfileState>((set) => ({
  profile: null,
  load: async () => set({ profile: await window.folk.profile.get() }),
  save: async (p) => {
    await window.folk.profile.save(p)
    set({ profile: p })
  }
}))
```

- [ ] **Step 5: UI store (page, cmdk, toasts, density, theme)**

```ts
// src/renderer/src/stores/useUIStore.ts
import { create } from 'zustand'

export type PageKey =
  | 'sessions'
  | 'mcp'
  | 'skills'
  | 'plugins'
  | 'marketplace'
  | 'model'
  | 'keybindings'
  | 'profile'

export interface Toast {
  id: string
  kind: 'info' | 'ok' | 'warn' | 'err'
  text: string
}

interface UIState {
  page: PageKey
  cmdkOpen: boolean
  toasts: Toast[]
  theme: 'light' | 'dark'
  density: 'compact' | 'regular'
  sidebarCollapsed: boolean
  setPage: (p: PageKey) => void
  openCmdk: () => void
  closeCmdk: () => void
  toast: (t: Omit<Toast, 'id'>) => void
  dismissToast: (id: string) => void
  setTheme: (t: 'light' | 'dark') => void
  setDensity: (d: 'compact' | 'regular') => void
  toggleSidebar: () => void
}

export const useUIStore = create<UIState>((set) => ({
  page: (localStorage.getItem('folk.lastTab') as PageKey) || 'sessions',
  cmdkOpen: false,
  toasts: [],
  theme: (localStorage.getItem('folk.theme') as 'light' | 'dark') || 'light',
  density: (localStorage.getItem('folk.density') as 'compact' | 'regular') || 'compact',
  sidebarCollapsed: localStorage.getItem('folk.sidebarCollapsed') === '1',
  setPage: (p) => {
    localStorage.setItem('folk.lastTab', p)
    set({ page: p })
  },
  openCmdk: () => set({ cmdkOpen: true }),
  closeCmdk: () => set({ cmdkOpen: false }),
  toast: (t) =>
    set((st) => ({ toasts: [...st.toasts, { ...t, id: crypto.randomUUID() }] })),
  dismissToast: (id) => set((st) => ({ toasts: st.toasts.filter((x) => x.id !== id) })),
  setTheme: (t) => {
    localStorage.setItem('folk.theme', t)
    document.documentElement.setAttribute('data-theme', t)
    set({ theme: t })
  },
  setDensity: (d) => {
    localStorage.setItem('folk.density', d)
    document.documentElement.setAttribute('data-density', d)
    set({ density: d })
  },
  toggleSidebar: () =>
    set((st) => {
      const v = !st.sidebarCollapsed
      localStorage.setItem('folk.sidebarCollapsed', v ? '1' : '0')
      return { sidebarCollapsed: v }
    })
}))
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck:web`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/stores
git commit -m "feat: Zustand stores for sessions, providers, MCP, profile, UI"
```

---

### Task 22: Hooks — `useAgent`, `useSessions`, `useProviders`

**Files:**
- Create: `src/renderer/src/hooks/useAgent.ts`
- Create: `src/renderer/src/hooks/useSessions.ts`
- Create: `src/renderer/src/hooks/useProviders.ts`

- [ ] **Step 1: `useAgent` — attaches streaming listeners once**

```ts
// src/renderer/src/hooks/useAgent.ts
import { useEffect } from 'react'
import { useSessionStore } from '../stores/useSessionStore'
import { useUIStore } from '../stores/useUIStore'

export function useAgent(): void {
  const { appendChunk, appendThinking, appendToolCall, appendToolResult, setError } =
    useSessionStore()
  const { toast } = useUIStore()
  useEffect(() => {
    const offs = [
      window.folk.agent.onChunk((e) => appendChunk(e)),
      window.folk.agent.onThinking((e) => appendThinking(e)),
      window.folk.agent.onToolCall((e) => appendToolCall(e)),
      window.folk.agent.onToolResult((e) => appendToolResult(e)),
      window.folk.agent.onDone(() => {
        /* no-op for now; status is read from session row */
      }),
      window.folk.agent.onError((e) => {
        setError(e)
        toast({ kind: 'err', text: e.message })
      })
    ]
    return () => offs.forEach((o) => o())
  }, [appendChunk, appendThinking, appendToolCall, appendToolResult, setError, toast])
}
```

- [ ] **Step 2: `useSessions` — CRUD proxied through API**

```ts
// src/renderer/src/hooks/useSessions.ts
import { useEffect } from 'react'
import { useSessionStore } from '../stores/useSessionStore'
import type { SessionConfig } from '@shared/types'

export function useSessions() {
  const { sessions, activeId, setSessions, upsertSession, removeSession, setActive } =
    useSessionStore()

  useEffect(() => {
    void window.folk.sessions.list().then(setSessions)
  }, [setSessions])

  return {
    sessions,
    activeId,
    setActive,
    async create(config: SessionConfig) {
      const s = await window.folk.sessions.create(config)
      upsertSession(s)
      setActive(s.id)
      return s
    },
    async delete(id: string) {
      await window.folk.sessions.delete(id)
      removeSession(id)
    },
    async send(sessionId: string, text: string) {
      useSessionStore.getState().pushUserMessage(sessionId, text)
      await window.folk.agent.sendMessage(sessionId, text)
    },
    async cancel(sessionId: string) {
      await window.folk.agent.cancel(sessionId)
    }
  }
}
```

- [ ] **Step 3: `useProviders`**

```ts
// src/renderer/src/hooks/useProviders.ts
import { useEffect } from 'react'
import { useProvidersStore } from '../stores/useProvidersStore'

export function useProviders() {
  const { providers, hydrated, load, save, remove } = useProvidersStore()
  useEffect(() => {
    if (!hydrated) void load()
  }, [hydrated, load])
  return {
    providers,
    enabledModels: providers
      .filter((p) => p.isEnabled)
      .flatMap((p) =>
        p.models
          .filter((m) => m.enabled)
          .map((m) => ({ providerId: p.id, providerName: p.name, ...m }))
      ),
    save,
    remove
  }
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck:web`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/hooks
git commit -m "feat: renderer hooks for agent stream, sessions, providers"
```

---

### Task 23: Port `icons.jsx` → `icons.tsx` and `data.jsx` → `data.ts`

**Files:**
- Create: `src/renderer/src/components/icons.tsx`
- Create: `src/renderer/src/data.ts`

- [ ] **Step 1: Port icons**

Copy `icons.jsx` verbatim into `src/renderer/src/components/icons.tsx`. Apply the following adaptations:
- Add `import { SVGProps } from 'react'` at top.
- Replace `Object.assign(window, { Icon })` with `export { Icon }` at bottom.
- Type `Icon`: `export function Icon({ name, size = 16, ...rest }: { name: string; size?: number } & SVGProps<SVGSVGElement>) { ... }`

- [ ] **Step 2: Port seed data**

Copy `data.jsx` into `src/renderer/src/data.ts`. Convert to plain TS exports:
- Remove `Object.assign(window, { ... })` footer.
- Prefix each constant with `export const`.
- Type seed arrays explicitly (`INITIAL_MCPS: MCPServer[]`, etc.), importing from `@shared/types`.

Note: the prototype stored seed UI mock data. Convert types so they match backend `Session`/`MCPServer` shapes where those overlap — otherwise keep them as `UI*` types local to this file.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck:web`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/icons.tsx src/renderer/src/data.ts
git commit -m "chore: port icons and seed data to TypeScript"
```

---

## Phase 7 — Renderer shell

### Task 24: App shell + routing

**Files:**
- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: Compose providers, stores, routing**

```tsx
// src/renderer/src/App.tsx
import { useEffect } from 'react'
import { Shell } from './components/Shell'
import { useAgent } from './hooks/useAgent'
import { useUIStore } from './stores/useUIStore'
import { useProfileStore } from './stores/useProfileStore'
import { useProvidersStore } from './stores/useProvidersStore'
import { useMCPStore } from './stores/useMCPStore'
import { FirstRunOnboarding } from './onboarding/FirstRunOnboarding'
import { SessionsPage } from './pages/SessionsPage'
import { MCPPage } from './pages/MCPPage'
import { ModelPage } from './pages/ModelPage'
import { SkillsPage } from './pages/SkillsPage'
import { PluginsPage } from './pages/PluginsPage'
import { MarketplacePage } from './pages/MarketplacePage'
import { KeybindingsPage } from './pages/KeybindingsPage'
import { ProfilePage } from './pages/ProfilePage'

export default function App() {
  useAgent()
  const { page, theme, density } = useUIStore()

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    document.documentElement.setAttribute('data-density', density)
  }, [theme, density])

  useEffect(() => {
    void useProfileStore.getState().load()
    void useProvidersStore.getState().load()
    void useMCPStore.getState().load()
  }, [])

  const onboarded = localStorage.getItem('folk.onboarded') === '1'

  return (
    <>
      <Shell>
        {page === 'sessions' && <SessionsPage />}
        {page === 'mcp' && <MCPPage />}
        {page === 'model' && <ModelPage />}
        {page === 'skills' && <SkillsPage />}
        {page === 'plugins' && <PluginsPage />}
        {page === 'marketplace' && <MarketplacePage />}
        {page === 'keybindings' && <KeybindingsPage />}
        {page === 'profile' && <ProfilePage />}
      </Shell>
      {!onboarded && <FirstRunOnboarding />}
    </>
  )
}
```

- [ ] **Step 2: Create page stubs so TypeScript compiles**

For each of `SessionsPage`, `MCPPage`, `ModelPage`, `SkillsPage`, `PluginsPage`, `MarketplacePage`, `KeybindingsPage`, `ProfilePage`, create a file under `src/renderer/src/pages/` with:

```tsx
export function <PageName>() {
  return <div style={{ padding: 24 }}>{'<PageName> — stub'}</div>
}
```

Also create `src/renderer/src/onboarding/FirstRunOnboarding.tsx` as stub returning `null`.

- [ ] **Step 3: Build + run dev**

Run: `npm run dev`
Expected: window opens; clicking the sidebar (created in Task 25) will navigate. For now, stub pages render.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/App.tsx src/renderer/src/pages src/renderer/src/onboarding
git commit -m "feat: App shell wires routing, streaming listeners, store hydration"
```

---

### Task 25: Sidebar + Topbar (port from `shell.jsx`)

**Files:**
- Create: `src/renderer/src/components/Shell.tsx`
- Create: `src/renderer/src/components/Sidebar.tsx`
- Create: `src/renderer/src/components/Topbar.tsx`

- [ ] **Step 1: Port `shell.jsx`**

Use `shell.jsx` as the source. Split the file into three:
- `Shell.tsx` — wraps `<Sidebar />`, `<Topbar />`, and a `<main>` slot for `children`.
- `Sidebar.tsx` — the brand row, nav groups (Workspace / Discover / Configure), profile footer. Uses `useUIStore().page` / `setPage` instead of local state. Reads collapsed state from the store.
- `Topbar.tsx` — hosts the command palette trigger, breadcrumbs, and density/theme toggles.

Each ported `Nav` item receives `page` / `onPick` props; active state compares against the store. Clicks call `setPage(key)`. The profile footer reads `useProfileStore().profile?.nickname`.

- [ ] **Step 2: Typecheck + dev run**

Run: `npm run typecheck:web && npm run dev`
Expected: sidebar visible, clicking nav items flips the stubbed page content.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/Shell.tsx src/renderer/src/components/Sidebar.tsx src/renderer/src/components/Topbar.tsx
git commit -m "feat: sidebar + topbar connected to UI store"
```

---

### Task 26: Command palette + Toast container

**Files:**
- Create: `src/renderer/src/components/CommandPalette.tsx`
- Create: `src/renderer/src/components/ToastContainer.tsx`
- Modify: `src/renderer/src/components/Shell.tsx`

- [ ] **Step 1: Port command palette**

Extract the command-palette block from `shell.jsx` (the `cmdkOpen` / `commandItems` section) into `CommandPalette.tsx`. Read `cmdkOpen` / `closeCmdk` / `setPage` from `useUIStore`. Bind `⌘K` globally via a `useEffect` hook inside the component.

- [ ] **Step 2: Toast container**

```tsx
// src/renderer/src/components/ToastContainer.tsx
import { useEffect } from 'react'
import { useUIStore } from '../stores/useUIStore'

export function ToastContainer() {
  const { toasts, dismissToast } = useUIStore()
  useEffect(() => {
    const timers = toasts.map((t) =>
      window.setTimeout(() => dismissToast(t.id), 5000)
    )
    return () => timers.forEach(clearTimeout)
  }, [toasts, dismissToast])
  return (
    <div className="toast-stack">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`}>
          {t.text}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Mount both inside Shell**

Edit `Shell.tsx` to render `<CommandPalette />` and `<ToastContainer />` as overlays.

- [ ] **Step 4: Dev run**

Run: `npm run dev`
Expected: `⌘K` opens the palette, arrow keys navigate, `Enter` switches page.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/CommandPalette.tsx src/renderer/src/components/ToastContainer.tsx src/renderer/src/components/Shell.tsx
git commit -m "feat: command palette + toast container wired to UI store"
```

---

## Phase 8 — Renderer pages

### Task 27: `SessionsPage` — list + conversation (no streaming yet)

**Files:**
- Modify: `src/renderer/src/pages/SessionsPage.tsx`
- Create: `src/renderer/src/pages/sessions/HistoryRail.tsx`
- Create: `src/renderer/src/pages/sessions/Conversation.tsx`
- Create: `src/renderer/src/pages/sessions/Composer.tsx`

- [ ] **Step 1: `SessionsPage` composes the three subcomponents**

```tsx
// src/renderer/src/pages/SessionsPage.tsx
import { useSessions } from '../hooks/useSessions'
import { HistoryRail } from './sessions/HistoryRail'
import { Conversation } from './sessions/Conversation'
import { Composer } from './sessions/Composer'

export function SessionsPage() {
  const { sessions, activeId, setActive, create, delete: del, send, cancel } = useSessions()
  const active = sessions.find((s) => s.id === activeId) ?? null
  return (
    <div className="sessions-layout">
      <HistoryRail
        sessions={sessions}
        activeId={activeId}
        onPick={setActive}
        onDelete={del}
        onNew={() => setActive(null)}
      />
      <div className="sessions-main">
        <Conversation session={active} />
        <Composer
          session={active}
          onSend={(text) => active && send(active.id, text)}
          onCancel={() => active && cancel(active.id)}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Port `HistoryRail` from `pages.jsx` SessionsPage**

Extract the history-rail JSX (grouped by Today / Yesterday / This week / Earlier, search input, status dot, timestamp, preview line) into `HistoryRail.tsx`. Signature:

```tsx
interface HistoryRailProps {
  sessions: Session[]
  activeId: string | null
  onPick: (id: string) => void
  onDelete: (id: string) => Promise<void>
  onNew: () => void
}
```

Use the existing prototype styles — classes already in `components.css`.

- [ ] **Step 3: Port `Conversation` — render messages from store**

```tsx
// src/renderer/src/pages/sessions/Conversation.tsx
import { useSessionStore } from '../../stores/useSessionStore'
import type { Session } from '@shared/types'
import { ToolCard } from './ToolCard'

export function Conversation({ session }: { session: Session | null }) {
  const messages = useSessionStore((s) => (session ? s.messages[session.id] ?? [] : []))
  if (!session) {
    return <div className="session-empty">Pick a session or start a new one.</div>
  }
  return (
    <div className="session-transcript">
      {messages.map((m) => (
        <article key={m.id} className={`msg msg-${m.role}`}>
          <header className="msg-head">
            <span className="msg-who">{m.role === 'user' ? 'You' : 'folk'}</span>
            <time>{new Date(m.createdAt).toLocaleTimeString()}</time>
          </header>
          {m.thinking && <pre className="msg-thinking">{m.thinking}</pre>}
          <div className="msg-body">{m.text}</div>
          {m.toolCalls.map((t) => (
            <ToolCard key={t.callId} call={t} />
          ))}
          {m.error && <div className="msg-error">{m.error.message}</div>}
        </article>
      ))}
    </div>
  )
}
```

(The `ToolCard` component lands in Task 28.)

- [ ] **Step 3.5: Placeholder `ToolCard` so this task builds**

```tsx
// src/renderer/src/pages/sessions/ToolCard.tsx
export function ToolCard({ call }: { call: { callId: string; tool: string; input: unknown; output?: unknown; isError?: boolean } }) {
  return (
    <div className={`tool-card ${call.isError ? 'tool-err' : ''}`}>
      <strong>{call.tool}</strong>
    </div>
  )
}
```

- [ ] **Step 4: Port `Composer` from `pages.jsx`**

Extract the composer block (textarea, send button, attachments chips, model picker popover, brainstorm button, drag-drop overlay). Signature:

```tsx
interface ComposerProps {
  session: Session | null
  onSend: (text: string) => void
  onCancel: () => void
}
```

Wire the model chip to open a popover that reads `useProviders().enabledModels`, selecting emits `window.folk.sessions` isn't needed here — just update the local composer state and on send pass via `onSend` (per-send model override is a future task; MVP uses the session's model).

- [ ] **Step 5: Dev run**

Run: `npm run dev`
Expected: Sessions page renders with a blank rail; clicking "New session" flips to `SessionSetup` (Task 35) when that lands. For now, send remains a no-op on null session.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/pages/SessionsPage.tsx src/renderer/src/pages/sessions
git commit -m "feat: sessions page with history rail, conversation, composer"
```

---

### Task 28: Tool cards with streaming state

**Files:**
- Modify: `src/renderer/src/pages/sessions/ToolCard.tsx`

- [ ] **Step 1: Render collapsible card with running/success/error state**

```tsx
// src/renderer/src/pages/sessions/ToolCard.tsx
import { useState } from 'react'

export interface ToolCardProps {
  call: {
    callId: string
    tool: string
    input: unknown
    output?: unknown
    isError?: boolean
  }
}

export function ToolCard({ call }: ToolCardProps) {
  const [open, setOpen] = useState(false)
  const status: 'running' | 'success' | 'error' =
    call.output === undefined ? 'running' : call.isError ? 'error' : 'success'
  return (
    <div className={`tool-card tool-${status}`}>
      <button type="button" className="tool-head" onClick={() => setOpen((v) => !v)}>
        <span className="tool-name">{call.tool}</span>
        <span className="tool-status">{status}</span>
      </button>
      {open && (
        <div className="tool-body">
          <div className="tool-section">
            <div className="tool-label">input</div>
            <pre>{JSON.stringify(call.input, null, 2)}</pre>
          </div>
          {call.output !== undefined && (
            <div className="tool-section">
              <div className="tool-label">{call.isError ? 'error' : 'output'}</div>
              <pre>{typeof call.output === 'string' ? call.output : JSON.stringify(call.output, null, 2)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Dev smoke**

Run: `npm run dev`
Expected: tool cards show status pill and toggle open/closed on click.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/pages/sessions/ToolCard.tsx
git commit -m "feat: collapsible tool cards with running/success/error states"
```

---

### Task 29: `MCPPage` (port from `mcp.jsx`)

**Files:**
- Modify: `src/renderer/src/pages/MCPPage.tsx`
- Create: `src/renderer/src/pages/mcp/MCPList.tsx`
- Create: `src/renderer/src/pages/mcp/MCPConfigDrawer.tsx`

- [ ] **Step 1: Port list view**

Port the MCP list from `mcp.jsx` (name, status, tool count, last-tested timestamp) into `MCPList.tsx`. Read data from `useMCPStore`. Props:

```tsx
interface MCPListProps {
  onOpen: (id: string) => void
  onNew: () => void
}
```

- [ ] **Step 2: Port config drawer**

Port the drawer (template picker, schema-aware fields, Test connect button, Raw JSON tab) into `MCPConfigDrawer.tsx`. Import the `MCPTemplate` type from `@shared/types` (already there from Task 6). The actual `MCP_TEMPLATES` constant lives in main, so expose it via preload:

Add to `src/preload/index.ts` inside the `folk` object:

```ts
  mcp: {
    list: () => ipcRenderer.invoke('mcpServers:list'),
    save: (s) => ipcRenderer.invoke('mcpServers:save', s),
    delete: (id) => ipcRenderer.invoke('mcpServers:delete', id),
    test: (id) => ipcRenderer.invoke('mcpServers:test', id),
    templates: () => ipcRenderer.invoke('mcpServers:templates')
  }
```

Add to `src/shared/preload-api.ts` FolkAPI.mcp:

```ts
templates: () => Promise<Record<string, MCPTemplate>>
```

(`MCPTemplate` already lives in `src/shared/types.ts` as of Task 6. No move needed.)

Add handler in `src/main/ipc-handlers.ts`:

```ts
ipcMain.handle('mcpServers:templates', () => MCP_TEMPLATES)
```

(import `MCP_TEMPLATES` at top.)

- [ ] **Step 3: MCPPage composes**

```tsx
// src/renderer/src/pages/MCPPage.tsx
import { useState } from 'react'
import { MCPList } from './mcp/MCPList'
import { MCPConfigDrawer } from './mcp/MCPConfigDrawer'

export function MCPPage() {
  const [openId, setOpenId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  return (
    <div className="page-mcp">
      <MCPList onOpen={setOpenId} onNew={() => setCreating(true)} />
      {(openId || creating) && (
        <MCPConfigDrawer
          id={openId}
          isNew={creating}
          onClose={() => {
            setOpenId(null)
            setCreating(false)
          }}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Dev run**

Run: `npm run dev`
Expected: MCP page lists whatever is in SQLite (initially empty), "+ Add" opens drawer, templates dropdown populated, saving writes through IPC and list refreshes.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/pages/MCPPage.tsx src/renderer/src/pages/mcp src/preload/index.ts src/shared/preload-api.ts src/shared/types.ts src/main/ipc-handlers.ts
git commit -m "feat: MCP page with live SQLite-backed list + config drawer"
```

---

### Task 30: `ModelPage` (port from `pages.jsx`)

**Files:**
- Modify: `src/renderer/src/pages/ModelPage.tsx`

- [ ] **Step 1: Port provider tabs + per-provider panels**

Port the `ModelPage` block from `pages.jsx` into `ModelPage.tsx`. Data source: `useProvidersStore()`. Features to wire:
- Provider tabs across the top (API key masked, base URL, per-model enable toggle, context/output limits).
- "Add provider" modal with presets: Anthropic, OpenAI, Google, GLM, Moonshot, Qwen, Custom (use the table in spec Section 7 for defaults).
- Save → `useProvidersStore.save`.
- Test button → `window.folk.providers.test(id)` → toast result.

Preset data:

```ts
const PROVIDER_PRESETS = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    baseUrl: null,
    models: ['claude-sonnet-4-5', 'claude-opus-4', 'claude-haiku-4-5']
  },
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o', 'gpt-4o-mini', 'o3-mini']
  },
  {
    id: 'google',
    name: 'Google',
    baseUrl: 'https://generativelanguage.googleapis.com',
    models: ['gemini-2.5-pro', 'gemini-2.5-flash']
  },
  {
    id: 'glm',
    name: 'GLM (Zhipu)',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: ['glm-4.6', 'glm-4-air']
  },
  {
    id: 'moonshot',
    name: 'Moonshot',
    baseUrl: 'https://api.moonshot.cn/v1',
    models: ['kimi-k2', 'moonshot-v1-128k']
  },
  {
    id: 'qwen',
    name: 'Qwen',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: ['qwen-max', 'qwen-coder-plus']
  }
]
```

- [ ] **Step 2: Dev run**

Run: `npm run dev`
Expected: adding a provider persists via IPC, toggling models updates DB, test button shows toast.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/pages/ModelPage.tsx
git commit -m "feat: model page with multi-provider persistence"
```

---

### Task 31: `SkillsPage` + `PluginsPage` + `MarketplacePage` (port UI only)

**Files:**
- Modify: `src/renderer/src/pages/SkillsPage.tsx`
- Modify: `src/renderer/src/pages/PluginsPage.tsx`
- Modify: `src/renderer/src/pages/MarketplacePage.tsx`

- [ ] **Step 1: Port each page from `pages.jsx`**

These pages are display-only in v0 — they render against seed data in `data.ts` (ported in Task 23). No IPC needed.

For each, copy the JSX block from `pages.jsx`, rewrite `React.useState` → `useState`, type props explicitly, remove `Object.assign(window, ...)` footers.

- [ ] **Step 2: Dev run**

Run: `npm run dev`
Expected: Skills, Plugins, Marketplace pages render the seed lists/cards; "Add from source" modal opens/closes.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/pages/SkillsPage.tsx src/renderer/src/pages/PluginsPage.tsx src/renderer/src/pages/MarketplacePage.tsx
git commit -m "feat: port Skills, Plugins, Marketplace pages"
```

---

### Task 32: `KeybindingsPage` + `ProfilePage`

**Files:**
- Modify: `src/renderer/src/pages/KeybindingsPage.tsx`
- Modify: `src/renderer/src/pages/ProfilePage.tsx`

- [ ] **Step 1: Port KeybindingsPage (read-only table)**

Extract the keybindings block from `pages.jsx`. Read from `INITIAL_KEYBINDS` in `data.ts`. Add a search input.

- [ ] **Step 2: Port ProfilePage (SQLite-backed)**

Extract ProfilePage. Data source: `useProfileStore()`. Form fields: nickname, pronouns, role, tone, about, avatar color picker. Save on blur / explicit Save button → `useProfileStore.save`.

- [ ] **Step 3: Dev run**

Run: `npm run dev`
Expected: keybindings search filters, profile edits persist across reloads.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/pages/KeybindingsPage.tsx src/renderer/src/pages/ProfilePage.tsx
git commit -m "feat: keybindings + profile pages"
```

---

### Task 33: Attachments in composer

**Files:**
- Modify: `src/renderer/src/pages/sessions/Composer.tsx`
- Modify: `src/renderer/src/hooks/useSessions.ts`

- [ ] **Step 1: Extend composer with drag/drop + paste**

Add state for `attachments: Attachment[]`. On drag-over show overlay (class `composer-drop`). On drop, for each file:

```ts
async function fileToAttachment(f: File): Promise<Attachment> {
  const buf = await f.arrayBuffer()
  const dataBase64 = btoa(String.fromCharCode(...new Uint8Array(buf)))
  return {
    kind: f.type.startsWith('image/') ? 'image' : f.type.startsWith('text/') ? 'text' : 'binary',
    name: f.name,
    mimeType: f.type || 'application/octet-stream',
    size: f.size,
    dataBase64
  }
}
```

Render attachment chips with remove (×).

- [ ] **Step 2: Wire `send` to pass attachments**

Update `useSessions.send`:

```ts
async send(sessionId: string, text: string, attachments?: Attachment[]) {
  useSessionStore.getState().pushUserMessage(sessionId, text)
  await window.folk.agent.sendMessage(sessionId, text, attachments)
}
```

And update `Composer`'s `onSend` prop signature accordingly.

- [ ] **Step 3: Dev run**

Run: `npm run dev`
Expected: drop a file on composer → chip appears → send → attachment flows to main process (which will be persisted/used by SDK when real agent is wired).

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/pages/sessions/Composer.tsx src/renderer/src/hooks/useSessions.ts
git commit -m "feat: composer drag-drop attachments with base64 pipeline"
```

---

## Phase 9 — Onboarding

### Task 34: `FirstRunOnboarding`

**Files:**
- Modify: `src/renderer/src/onboarding/FirstRunOnboarding.tsx`

- [ ] **Step 1: Port 4-step flow from `onboarding.jsx`**

Steps: Welcome → Profile (nickname + avatar color) → Provider picker → API key + validation. On complete:

```ts
async function finish(profile: Profile, provider: ProviderConfig | null) {
  await useProfileStore.getState().save(profile)
  if (provider) await useProvidersStore.getState().save(provider)
  localStorage.setItem('folk.onboarded', '1')
  useUIStore.getState().toast({ kind: 'ok', text: 'Welcome to folk' })
  // force rerender — parent reads localStorage; simplest: location.reload
  location.reload()
}
```

Use existing classes from `onboarding.css`. The component reads `localStorage['folk.onboarded']` itself only to early-return `null` when onboarded — outer `App.tsx` also gates rendering, but this is defense-in-depth.

- [ ] **Step 2: Add "Replay onboarding" affordance in Tweaks**

Port `tweaks-panel.jsx` into `src/renderer/src/components/TweaksPanel.tsx` (stripped to: dark mode, density, "Replay first-run onboarding" button that clears `folk.onboarded` and reloads).

- [ ] **Step 3: Dev run**

Run: `npm run dev`
Expected: fresh session shows onboarding; stepping through saves profile + provider; reload comes back into main UI.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/onboarding/FirstRunOnboarding.tsx src/renderer/src/components/TweaksPanel.tsx
git commit -m "feat: first-run onboarding with profile + provider setup"
```

---

### Task 35: `SessionSetup` sheet

**Files:**
- Create: `src/renderer/src/onboarding/SessionSetup.tsx`
- Modify: `src/renderer/src/pages/SessionsPage.tsx`

- [ ] **Step 1: Port SessionSetup from `onboarding.jsx`**

Layout sections in order:
1. Working folder (path input + native file picker via `window.folk.sessions.pickFolder()` — deferred: for MVP, use a plain text input plus a "Browse" button that opens `prompt()` or relies on drag-drop of a folder onto input).
2. Model (6-card grid of `useProviders().enabledModels`).
3. Goal picker (general / code / research / data / writing / ops).
4. Launch options (collapsible):
   - Permissions: "Ask before every action" vs "Skip permissions" segmented cards.
   - YOLO warning block when skip-permissions on, with "I understand" checkbox.
   - Raw CLI flags input (`$`-prefixed).
   - Command preview (dark terminal block showing `claude-code --model ... <folder> <flags>`).

Signature:

```tsx
interface SessionSetupProps {
  onLaunch: (config: SessionConfig) => Promise<void>
  onCancel: () => void
}
```

- [ ] **Step 2: Integrate into SessionsPage**

Modify `SessionsPage` to track "needsSetup" state. When the rail's "New session" is clicked, switch to `<SessionSetup />` in the main panel instead of `<Conversation />`. On launch, call `useSessions().create(config)` then clear the needsSetup flag.

- [ ] **Step 3: Dev run**

Run: `npm run dev`
Expected: "New session" → setup sheet renders, filling + launch creates row in SQLite (visible in sidebar rail), composer/conversation appear.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/onboarding/SessionSetup.tsx src/renderer/src/pages/SessionsPage.tsx
git commit -m "feat: in-place session setup sheet with YOLO guard"
```

---

## Phase 10 — Error handling & cleanup

### Task 36: Error handling per spec

**Files:**
- Modify: `src/renderer/src/hooks/useAgent.ts`
- Modify: `src/renderer/src/pages/sessions/Composer.tsx`
- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: Surface offline / auth / quota errors near composer**

Change `useAgent` so error events also call `useSessionStore.setError(e)` (already done in Task 22) AND add a dedicated "inline banner" state keyed by sessionId — reusing `setError` is sufficient; the Composer reads the last-assistant-message error and renders an inline banner above the textarea.

In `Composer.tsx` derive:

```ts
const lastErr = useSessionStore((s) => {
  if (!session) return null
  const msgs = s.messages[session.id] ?? []
  const lastAsst = [...msgs].reverse().find((m) => m.role === 'assistant')
  return lastAsst?.error ?? null
})
```

Render a banner when `lastErr`:
- `auth` → "Invalid API key. [Open Model & API]" — button calls `useUIStore.setPage('model')`.
- `quota` → "Rate limited. Try again in a moment."
- `offline` → "No connection."
- `crash` → "Agent crashed. [Retry]" — button calls `onSend(lastUserText)`.

- [ ] **Step 2: No-provider guard**

In `Composer.tsx`, derive `hasProvider = useProviders().enabledModels.length > 0`. When false, disable send and show "Add a provider first" with a link that sets page to `'model'`.

- [ ] **Step 3: Dev run**

Run: `npm run dev`
Expected: wiping the only provider from Model page disables send + shows banner; invalid key triggers error banner linking to Model page.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/hooks/useAgent.ts src/renderer/src/pages/sessions/Composer.tsx src/renderer/src/App.tsx
git commit -m "feat: inline error banners for auth, quota, offline, crash, missing-provider"
```

---

### Task 37: Cleanup — delete prototype files

**Files:**
- Delete: `index.html` (root), `styles.css` (root), `app.css` (root), `onboarding.css` (root)
- Delete: `icons.jsx`, `data.jsx`, `shell.jsx`, `mcp.jsx`, `pages.jsx`, `onboarding.jsx`, `tweaks-panel.jsx`
- Keep: `claude.md`, `design/`, `docs/`, `.gitignore`

- [ ] **Step 1: Delete prototype files**

```bash
git rm index.html styles.css app.css onboarding.css icons.jsx data.jsx shell.jsx mcp.jsx pages.jsx onboarding.jsx tweaks-panel.jsx
```

- [ ] **Step 2: Run full typecheck + build + smoke**

Run: `npm run typecheck && npm run build && npm run dev`
Expected: typecheck 0, build succeeds, dev window renders the app with all pages reachable.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: remove root-level prototype files (migrated to src/renderer)"
```

---

## Phase 11 — Packaging

### Task 38: `electron-builder.yml`

**Files:**
- Create: `electron-builder.yml`
- Create: `resources/.gitkeep`

- [ ] **Step 1: Write the builder config**

```yaml
appId: com.folk.app
productName: folk
directories:
  output: dist
  buildResources: resources
files:
  - out/**/*
  - package.json
asar: true
mac:
  target:
    - target: dmg
      arch:
        - arm64
        - x64
  category: public.app-category.developer-tools
  hardenedRuntime: false
  gatekeeperAssess: false
  identity: null
dmg:
  contents:
    - x: 130
      y: 220
    - x: 410
      y: 220
      type: link
      path: /Applications
```

- [ ] **Step 2: Run `package:mac` once to verify**

Run: `npm run package:mac`
Expected: `dist/folk-0.1.0-arm64.dmg` (and x64 variant) produced. First run may take several minutes as Electron binaries download.

- [ ] **Step 3: Manual smoke**

Open the produced `.dmg`, drag `folk.app` to Applications, launch it, click through:
- First-run onboarding appears
- Sessions page loads
- MCP page loads
- Model page loads

Close. If anything fails, fix before committing.

- [ ] **Step 4: Commit**

```bash
git add electron-builder.yml resources/.gitkeep
git commit -m "chore: electron-builder config for macOS unsigned dmg"
```

---

## Verification summary

By end of Task 38, the following must all be true:

- `npm run typecheck` exits 0.
- `npm test` reports all Vitest suites green (database, agent-manager, mcp-manager).
- `npm run dev` opens an Electron window that shows the folk shell with all 8 pages reachable from the sidebar.
- First-run onboarding triggers on fresh `~/Library/Application Support/folk/folk.db`.
- A created session persists across app restart.
- A saved provider persists with its API key encrypted at rest (verified by peeking at SQLite directly — `api_key` column must not contain the plaintext).
- A saved MCP server persists and the Test button returns either ok:true + tool count or ok:false + error.
- `npm run package:mac` produces a launchable `.dmg`.

---

## Notes

- **Scope**: this plan covers the full spec in one plan for traceability. It can be split into phased plans (e.g., Phases 1–5 as "backend", 6–9 as "renderer", 10–11 as "polish+package") by extracting task ranges.
- **SDK specifics**: the SDK event names (`chunk`, `toolCall`, etc.) and `createAgent` signature used here are best-guess based on the spec. The first implementation of Task 12 should consult the actual `@anthropic-ai/claude-agent-sdk` API docs and adjust mock + wire code accordingly. Treat the provided shape as a template.
- **Tool result types**: the SDK may stream tool results with richer typing (e.g., resource refs, images). If so, extend `AgentToolResult` and `ChatMessage.toolCalls[].output` accordingly — keep it narrow in v0.
- **JSONL history**: this plan does **not** load Claude Code JSONL history on session open. That's a follow-up plan — v0 shows only live-session messages. Add a task "Load JSONL on session select" in a subsequent plan.
- **Open questions (spec §10)**: tracked here but not addressed — cross-platform build, auto-update, code signing. File separate specs/plans when these are prioritized.
