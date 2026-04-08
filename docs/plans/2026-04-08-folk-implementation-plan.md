# Folk Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build Folk — a fully local AI agent desktop app powered by Gemma 4 E4B via llama.cpp, with Claude Agent SDK, Electron shell, React UI, and Composio-inspired dark design system.

**Architecture:** Electron app with llama-server as child process providing Anthropic-compatible API. Claude Agent SDK orchestrates multi-step agent loop. React renderer with Zustand state management. SQLite for conversation persistence. MCP client for external service integration.

**Tech Stack:** Electron 33 + electron-vite + React 19 + TypeScript 5.5 + Tailwind CSS 4 + Zustand 5 + better-sqlite3 + Claude Agent SDK + llama.cpp + Shiki + Lucide React

---

## Technical Context

**Language/Version**: TypeScript 5.5, Node.js 20+
**Primary Dependencies**: Electron 33, React 19, Zustand 5, better-sqlite3, @anthropic-ai/agent-sdk, Tailwind CSS 4, Shiki, react-markdown, react-window, lucide-react
**Storage**: SQLite (better-sqlite3) + local filesystem
**Testing**: Vitest (unit/integration), Playwright (E2E)
**Target Platform**: macOS (arm64/x64), Windows x64, Linux x64
**Project Type**: desktop-app (Electron)
**Performance Goals**: <100ms IPC latency, 60fps UI, <3s app startup (excluding model load)
**Constraints**: Must run on 8GB RAM machines, offline-capable, no remote calls except model download
**Scale/Scope**: Single-user desktop app, unlimited conversations, 128K context window

---

## Project Structure

```text
folk/
├── docs/plans/                          # Design & implementation plans
├── specs/                               # Speckit feature specs
├── electron.vite.config.ts              # electron-vite configuration
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── tsconfig.web.json
├── tailwind.config.ts
├── postcss.config.js
├── src/
│   ├── main/                            # Electron main process
│   │   ├── index.ts                     # App entry, window creation
│   │   ├── llama-server.ts              # LlamaServerManager class
│   │   ├── agent-manager.ts             # AgentManager (Agent SDK wrapper)
│   │   ├── database.ts                  # DatabaseManager (SQLite)
│   │   ├── model-manager.ts             # ModelManager (download, verify)
│   │   ├── ipc-handlers.ts              # All IPC handler registrations
│   │   ├── tools/
│   │   │   ├── file-system.ts           # Workspace-scoped file tools
│   │   │   └── system-info.ts           # OS/platform info tool
│   │   └── mcp/
│   │       └── client-manager.ts        # MCPClientManager
│   ├── preload/
│   │   ├── index.ts                     # contextBridge API exposure
│   │   └── types.ts                     # Shared IPC types
│   ├── renderer/
│   │   ├── index.html
│   │   ├── main.tsx                     # React entry
│   │   ├── App.tsx                      # Root component
│   │   ├── stores/
│   │   │   ├── conversation.ts          # Conversation CRUD + messages
│   │   │   ├── ui.ts                    # Panel states, modals
│   │   │   ├── agent.ts                 # Agent status, streaming
│   │   │   └── settings.ts              # App settings
│   │   ├── components/
│   │   │   ├── TitleBar.tsx
│   │   │   ├── Sidebar/
│   │   │   │   ├── Sidebar.tsx
│   │   │   │   ├── SearchInput.tsx
│   │   │   │   ├── ConversationList.tsx
│   │   │   │   └── ConversationItem.tsx
│   │   │   ├── ChatPanel/
│   │   │   │   ├── ChatPanel.tsx
│   │   │   │   ├── MessageList.tsx
│   │   │   │   ├── UserMessage.tsx
│   │   │   │   ├── AssistantMessage.tsx
│   │   │   │   ├── CodeBlock.tsx
│   │   │   │   ├── ToolUseBlock.tsx
│   │   │   │   ├── MarkdownRenderer.tsx
│   │   │   │   └── ChatInput.tsx
│   │   │   ├── ArtifactPanel/
│   │   │   │   ├── ArtifactPanel.tsx
│   │   │   │   ├── ArtifactTabs.tsx
│   │   │   │   ├── CodeViewer.tsx
│   │   │   │   ├── MarkdownViewer.tsx
│   │   │   │   └── ImageViewer.tsx
│   │   │   ├── ActivityLog/
│   │   │   │   ├── ActivityLog.tsx
│   │   │   │   └── ToolCallEntry.tsx
│   │   │   ├── SettingsDrawer/
│   │   │   │   ├── SettingsDrawer.tsx
│   │   │   │   ├── ModelSettings.tsx
│   │   │   │   ├── MCPSettings.tsx
│   │   │   │   ├── WorkspaceSettings.tsx
│   │   │   │   ├── AppearanceSettings.tsx
│   │   │   │   └── AboutSection.tsx
│   │   │   ├── Onboarding/
│   │   │   │   ├── OnboardingWizard.tsx
│   │   │   │   ├── WelcomeStep.tsx
│   │   │   │   ├── ModelDownloadStep.tsx
│   │   │   │   └── WorkspaceStep.tsx
│   │   │   └── EmptyState.tsx
│   │   ├── hooks/
│   │   │   ├── useIPC.ts
│   │   │   └── useStreamingMessage.ts
│   │   └── lib/
│   │       ├── ipc.ts                   # Typed IPC client
│   │       └── format.ts                # Date/size formatters
│   └── shared/
│       └── types.ts                     # Types shared between main/renderer
├── resources/
│   ├── icon.png
│   └── fonts/
│       ├── Inter-Variable.woff2
│       └── JetBrainsMono-Variable.woff2
└── tests/
    ├── main/
    │   ├── database.test.ts
    │   ├── llama-server.test.ts
    │   └── agent-manager.test.ts
    └── renderer/
        ├── stores/
        │   └── conversation.test.ts
        └── components/
            └── ChatInput.test.ts
```

---

## Phase 1: Setup (Project Scaffolding)

**Purpose**: Initialize Electron + React + TypeScript project with all dependencies and build tooling.

---

### Task 1: Initialize electron-vite project

**Files:**
- Create: `package.json`
- Create: `electron.vite.config.ts`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `tsconfig.web.json`

**Step 1: Scaffold electron-vite project**

```bash
cd /Users/barock/Code/folk
npm create @quick-start/electron@latest . -- --template react-ts
```

Select: React + TypeScript template. If prompted about existing files, allow overwrite of package.json but preserve docs/ and .specify/.

**Step 2: Verify scaffold created expected structure**

```bash
ls -la src/main/ src/preload/ src/renderer/
```

Expected: directories exist with template files.

**Step 3: Commit scaffold**

```bash
git add -A
git commit -m "feat: scaffold electron-vite project with React + TypeScript"
```

---

### Task 2: Install all dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install production dependencies**

```bash
npm install zustand better-sqlite3 react-markdown remark-gfm rehype-highlight react-window shiki lucide-react uuid
```

**Step 2: Install dev dependencies**

```bash
npm install -D @types/better-sqlite3 @types/react-window @types/uuid tailwindcss @tailwindcss/postcss postcss vitest @testing-library/react @testing-library/jest-dom jsdom
```

**Step 3: Install Claude Agent SDK**

```bash
npm install @anthropic-ai/sdk
```

Note: The Agent SDK package name may be `@anthropic-ai/agent-sdk` — check npm registry. If not available yet, install `@anthropic-ai/sdk` as the base SDK and we'll build the agent loop manually.

**Step 4: Verify installation**

```bash
npm ls --depth=0
```

Expected: all packages listed without errors.

**Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: install all production and dev dependencies"
```

---

### Task 3: Configure Tailwind CSS 4

**Files:**
- Create: `postcss.config.js`
- Create: `src/renderer/styles/globals.css`
- Create: `src/renderer/styles/design-tokens.css`

**Step 1: Create PostCSS config**

```javascript
// postcss.config.js
export default {
  plugins: {
    '@tailwindcss/postcss': {}
  }
}
```

**Step 2: Create global CSS with Tailwind imports and design tokens**

```css
/* src/renderer/styles/globals.css */
@import 'tailwindcss';
@import './design-tokens.css';

@font-face {
  font-family: 'Inter';
  src: url('../../../resources/fonts/Inter-Variable.woff2') format('woff2');
  font-weight: 100 900;
  font-display: swap;
}

@font-face {
  font-family: 'JetBrains Mono';
  src: url('../../../resources/fonts/JetBrainsMono-Variable.woff2') format('woff2');
  font-weight: 100 800;
  font-display: swap;
}

body {
  font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;
  background-color: #0f0f0f;
  color: #ffffff;
  margin: 0;
  padding: 0;
  overflow: hidden;
  -webkit-font-smoothing: antialiased;
}

code, pre, .font-mono {
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

/* Scrollbar styling */
::-webkit-scrollbar {
  width: 6px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}
```

**Step 3: Create design system tokens**

```css
/* src/renderer/styles/design-tokens.css */

/* Folk Design System — adapted from Composio */

@theme {
  /* Colors */
  --color-void-black: #0f0f0f;
  --color-pure-black: #000000;
  --color-electric-cyan: #00ffff;
  --color-composio-cobalt: #0007cd;
  --color-signal-blue: #0089ff;
  --color-ocean-blue: #0096ff;
  --color-charcoal: #2c2c2c;

  /* Text colors */
  --color-text-primary: #ffffff;
  --color-text-secondary: rgba(255, 255, 255, 0.6);
  --color-text-tertiary: rgba(255, 255, 255, 0.5);
  --color-text-muted: #444444;
  --color-text-phantom: rgba(255, 255, 255, 0.2);

  /* Border colors */
  --color-border-mist-04: rgba(255, 255, 255, 0.04);
  --color-border-mist-06: rgba(255, 255, 255, 0.06);
  --color-border-mist-08: rgba(255, 255, 255, 0.08);
  --color-border-mist-10: rgba(255, 255, 255, 0.10);
  --color-border-mist-12: rgba(255, 255, 255, 0.12);

  /* Accent backgrounds */
  --color-cyan-glow-12: rgba(0, 255, 255, 0.12);
  --color-cyan-glow-03: rgba(0, 255, 255, 0.03);
  --color-cobalt-glow-05: rgba(0, 7, 205, 0.05);

  /* Semantic */
  --color-error: #ff4444;
  --color-success: #22c55e;
  --color-warning: #f59e0b;

  /* Surfaces */
  --color-surface-elevated: rgba(255, 255, 255, 0.04);
  --color-surface-hover: rgba(255, 255, 255, 0.02);
  --color-surface-bubble: rgba(255, 255, 255, 0.06);

  /* Shadows */
  --shadow-brutalist: 4px 4px 0px rgba(0, 0, 0, 0.15);
  --shadow-floating: 0px 8px 32px rgba(0, 0, 0, 0.5);

  /* Font families */
  --font-sans: 'Inter', ui-sans-serif, system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;

  /* Spacing */
  --spacing-sidebar: 260px;
  --spacing-artifact-panel: 400px;
  --spacing-settings-drawer: 480px;

  /* Radii */
  --radius-sharp: 2px;
  --radius-default: 4px;
  --radius-pill: 37px;
  --radius-full: 9999px;
}
```

**Step 4: Commit**

```bash
git add postcss.config.js src/renderer/styles/
git commit -m "feat: configure Tailwind CSS 4 with Folk design system tokens"
```

---

### Task 4: Download and place font files

**Files:**
- Create: `resources/fonts/Inter-Variable.woff2`
- Create: `resources/fonts/JetBrainsMono-Variable.woff2`

**Step 1: Create fonts directory**

```bash
mkdir -p resources/fonts
```

**Step 2: Download Inter variable font**

```bash
curl -L -o resources/fonts/Inter-Variable.woff2 "https://github.com/rsms/inter/raw/master/docs/font-files/InterVariable.woff2"
```

**Step 3: Download JetBrains Mono variable font**

```bash
curl -L -o resources/fonts/JetBrainsMono-Variable.woff2 "https://github.com/JetBrains/JetBrainsMono/raw/master/fonts/variable/JetBrainsMono%5Bwght%5D.woff2"
```

**Step 4: Verify fonts downloaded**

```bash
ls -la resources/fonts/
```

Expected: both .woff2 files present, non-zero size.

**Step 5: Commit**

```bash
git add resources/fonts/
git commit -m "feat: add Inter and JetBrains Mono variable fonts"
```

---

### Task 5: Create shared types

**Files:**
- Create: `src/shared/types.ts`

**Step 1: Write shared type definitions**

```typescript
// src/shared/types.ts

export interface Conversation {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  workspacePath: string | null
  isArchived: boolean
}

export interface Message {
  id: string
  conversationId: string
  role: 'user' | 'assistant' | 'system'
  content: ContentBlock[]
  createdAt: number
  tokenCount: number | null
}

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; toolUseId: string; content: string; isError?: boolean }

export interface ToolCall {
  id: string
  messageId: string
  toolName: string
  input: Record<string, unknown> | null
  output: Record<string, unknown> | null
  status: 'running' | 'success' | 'error'
  startedAt: number
  completedAt: number | null
  durationMs: number | null
}

export interface Artifact {
  id: string
  conversationId: string
  messageId: string | null
  type: 'file' | 'code' | 'markdown' | 'image'
  title: string
  content: string | null
  filePath: string | null
  language: string | null
  createdAt: number
}

export interface MCPServer {
  id: string
  name: string
  transport: 'stdio' | 'sse'
  command: string | null
  url: string | null
  args: string[] | null
  env: Record<string, string> | null
  enabled: boolean
  createdAt: number
}

export interface ModelInfo {
  name: string
  path: string
  sizeBytes: number
  quantization: string
  contextSize: number
}

export type LlamaStatus = 'starting' | 'ready' | 'error' | 'stopped'

export interface DownloadProgress {
  percent: number
  speed: string
  eta: string
}

export interface ToolCallStart {
  id: string
  toolName: string
  input: Record<string, unknown>
}

export interface ToolCallResult {
  id: string
  toolName: string
  output: Record<string, unknown>
  status: 'success' | 'error'
  durationMs: number
}

// IPC Channel types
export interface FolkAPI {
  // Agent
  sendMessage: (conversationId: string, content: string) => Promise<void>
  stopAgent: (conversationId: string) => Promise<void>

  // Conversations
  createConversation: () => Promise<Conversation>
  listConversations: () => Promise<Conversation[]>
  deleteConversation: (id: string) => Promise<void>
  renameConversation: (id: string, title: string) => Promise<void>
  getMessages: (conversationId: string) => Promise<Message[]>

  // Settings
  getSetting: (key: string) => Promise<unknown>
  setSetting: (key: string, value: unknown) => Promise<void>

  // MCP
  listMCPServers: () => Promise<MCPServer[]>
  addMCPServer: (config: Omit<MCPServer, 'id' | 'createdAt'>) => Promise<MCPServer>
  removeMCPServer: (id: string) => Promise<void>
  testMCPConnection: (id: string) => Promise<{ ok: boolean; error?: string }>

  // Model
  getModelInfo: () => Promise<ModelInfo | null>
  changeModel: (path: string) => Promise<void>
  downloadModel: (url: string) => Promise<void>

  // Workspace
  selectWorkspace: () => Promise<string | null>
  getCurrentWorkspace: () => Promise<string>

  // System
  getLlamaStatus: () => Promise<LlamaStatus>
  getAppVersion: () => Promise<string>
  openFileDialog: (options?: { filters?: { name: string; extensions: string[] }[] }) => Promise<string[]>

  // Events (renderer listens)
  onToken: (callback: (data: { conversationId: string; token: string }) => void) => () => void
  onToolStart: (callback: (data: { conversationId: string; toolCall: ToolCallStart }) => void) => () => void
  onToolResult: (callback: (data: { conversationId: string; toolCall: ToolCallResult }) => void) => () => void
  onArtifact: (callback: (data: { conversationId: string; artifact: Artifact }) => void) => () => void
  onAgentComplete: (callback: (data: { conversationId: string; message: Message }) => void) => () => void
  onAgentError: (callback: (data: { conversationId: string; error: string }) => void) => () => void
  onDownloadProgress: (callback: (data: DownloadProgress) => void) => () => void
  onLlamaStatusChange: (callback: (status: LlamaStatus) => void) => () => void
}
```

**Step 2: Commit**

```bash
git add src/shared/
git commit -m "feat: define shared TypeScript types for IPC, models, and API contract"
```

---

### Task 6: Configure Vitest

**Files:**
- Create: `vitest.config.ts`

**Step 1: Create Vitest config**

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@main': path.resolve(__dirname, 'src/main'),
      '@renderer': path.resolve(__dirname, 'src/renderer'),
    },
  },
})
```

**Step 2: Create test setup file**

```typescript
// tests/setup.ts
import '@testing-library/jest-dom'
```

**Step 3: Add test script to package.json**

Add to `scripts` section of `package.json`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

**Step 4: Commit**

```bash
git add vitest.config.ts tests/setup.ts package.json
git commit -m "feat: configure Vitest with jsdom environment"
```

**Checkpoint**: Project scaffolding complete. `npm run dev` should launch empty Electron window.

---

## Phase 2: Foundational (Core Infrastructure)

**Purpose**: Database, llama-server lifecycle, IPC bridge, preload API — everything that MUST work before any UI.

**CRITICAL**: No UI work can begin until this phase is complete.

---

### Task 7: Implement DatabaseManager

**Files:**
- Create: `src/main/database.ts`
- Create: `tests/main/database.test.ts`

**Step 1: Write failing test**

```typescript
// tests/main/database.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DatabaseManager } from '@main/database'
import fs from 'fs'
import path from 'path'
import os from 'os'

describe('DatabaseManager', () => {
  let db: DatabaseManager
  let dbPath: string

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `folk-test-${Date.now()}.db`)
    db = new DatabaseManager(dbPath)
  })

  afterEach(() => {
    db.close()
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath)
  })

  it('creates tables on initialization', () => {
    const tables = db.listTables()
    expect(tables).toContain('conversations')
    expect(tables).toContain('messages')
    expect(tables).toContain('tool_calls')
    expect(tables).toContain('artifacts')
    expect(tables).toContain('mcp_servers')
    expect(tables).toContain('settings')
  })

  it('creates and retrieves a conversation', () => {
    const conv = db.createConversation('Test Chat', '/tmp/workspace')
    expect(conv.title).toBe('Test Chat')
    expect(conv.workspacePath).toBe('/tmp/workspace')

    const retrieved = db.getConversation(conv.id)
    expect(retrieved).toEqual(conv)
  })

  it('lists conversations ordered by updatedAt desc', () => {
    const c1 = db.createConversation('First', null)
    const c2 = db.createConversation('Second', null)
    const list = db.listConversations()
    expect(list[0].id).toBe(c2.id)
    expect(list[1].id).toBe(c1.id)
  })

  it('adds and retrieves messages', () => {
    const conv = db.createConversation('Test', null)
    const msg = db.addMessage(conv.id, 'user', [{ type: 'text', text: 'Hello' }])
    expect(msg.role).toBe('user')

    const messages = db.getMessages(conv.id)
    expect(messages).toHaveLength(1)
    expect(messages[0].content[0]).toEqual({ type: 'text', text: 'Hello' })
  })

  it('deletes conversation cascading messages', () => {
    const conv = db.createConversation('Test', null)
    db.addMessage(conv.id, 'user', [{ type: 'text', text: 'Hello' }])
    db.deleteConversation(conv.id)
    expect(db.getConversation(conv.id)).toBeNull()
    expect(db.getMessages(conv.id)).toHaveLength(0)
  })

  it('stores and retrieves settings', () => {
    db.setSetting('theme', 'dark')
    expect(db.getSetting('theme')).toBe('dark')
    db.setSetting('theme', 'light')
    expect(db.getSetting('theme')).toBe('light')
  })
})
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run tests/main/database.test.ts
```

Expected: FAIL — module `@main/database` not found.

**Step 3: Implement DatabaseManager**

```typescript
// src/main/database.ts
import Database from 'better-sqlite3'
import { v4 as uuid } from 'uuid'
import type { Conversation, Message, ContentBlock, ToolCall, Artifact, MCPServer } from '../shared/types'

export class DatabaseManager {
  private db: Database.Database

  constructor(dbPath: string) {
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    this.migrate()
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        workspace_path TEXT,
        is_archived INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        token_count INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);

      CREATE TABLE IF NOT EXISTS tool_calls (
        id TEXT PRIMARY KEY,
        message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        tool_name TEXT NOT NULL,
        input TEXT,
        output TEXT,
        status TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        completed_at INTEGER,
        duration_ms INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_tool_calls_msg ON tool_calls(message_id);

      CREATE TABLE IF NOT EXISTS artifacts (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        message_id TEXT REFERENCES messages(id),
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT,
        file_path TEXT,
        language TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_artifacts_conv ON artifacts(conversation_id);

      CREATE TABLE IF NOT EXISTS mcp_servers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        transport TEXT NOT NULL,
        command TEXT,
        url TEXT,
        args TEXT,
        env TEXT,
        enabled INTEGER DEFAULT 1,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `)
  }

  listTables(): string[] {
    const rows = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[]
    return rows.map(r => r.name)
  }

  // Conversations
  createConversation(title: string, workspacePath: string | null): Conversation {
    const id = uuid()
    const now = Date.now()
    this.db.prepare(
      'INSERT INTO conversations (id, title, created_at, updated_at, workspace_path) VALUES (?, ?, ?, ?, ?)'
    ).run(id, title, now, now, workspacePath)
    return { id, title, createdAt: now, updatedAt: now, workspacePath, isArchived: false }
  }

  getConversation(id: string): Conversation | null {
    const row = this.db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as any
    if (!row) return null
    return this.mapConversation(row)
  }

  listConversations(): Conversation[] {
    const rows = this.db.prepare('SELECT * FROM conversations WHERE is_archived = 0 ORDER BY updated_at DESC').all() as any[]
    return rows.map(this.mapConversation)
  }

  deleteConversation(id: string): void {
    this.db.prepare('DELETE FROM conversations WHERE id = ?').run(id)
  }

  renameConversation(id: string, title: string): void {
    this.db.prepare('UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?').run(title, Date.now(), id)
  }

  updateConversationTimestamp(id: string): void {
    this.db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(Date.now(), id)
  }

  // Messages
  addMessage(conversationId: string, role: string, content: ContentBlock[], tokenCount?: number): Message {
    const id = uuid()
    const now = Date.now()
    this.db.prepare(
      'INSERT INTO messages (id, conversation_id, role, content, created_at, token_count) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, conversationId, role, JSON.stringify(content), now, tokenCount ?? null)
    this.updateConversationTimestamp(conversationId)
    return { id, conversationId, role: role as Message['role'], content, createdAt: now, tokenCount: tokenCount ?? null }
  }

  getMessages(conversationId: string): Message[] {
    const rows = this.db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC').all(conversationId) as any[]
    return rows.map(this.mapMessage)
  }

  // Tool Calls
  addToolCall(messageId: string, toolName: string, input: Record<string, unknown> | null): ToolCall {
    const id = uuid()
    const now = Date.now()
    this.db.prepare(
      'INSERT INTO tool_calls (id, message_id, tool_name, input, status, started_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, messageId, toolName, input ? JSON.stringify(input) : null, 'running', now)
    return { id, messageId, toolName, input, output: null, status: 'running', startedAt: now, completedAt: null, durationMs: null }
  }

  completeToolCall(id: string, output: Record<string, unknown> | null, status: 'success' | 'error'): void {
    const now = Date.now()
    const row = this.db.prepare('SELECT started_at FROM tool_calls WHERE id = ?').get(id) as any
    const durationMs = row ? now - row.started_at : null
    this.db.prepare(
      'UPDATE tool_calls SET output = ?, status = ?, completed_at = ?, duration_ms = ? WHERE id = ?'
    ).run(output ? JSON.stringify(output) : null, status, now, durationMs, id)
  }

  getToolCalls(messageId: string): ToolCall[] {
    const rows = this.db.prepare('SELECT * FROM tool_calls WHERE message_id = ? ORDER BY started_at ASC').all(messageId) as any[]
    return rows.map(this.mapToolCall)
  }

  // Artifacts
  addArtifact(conversationId: string, messageId: string | null, type: Artifact['type'], title: string, content: string | null, filePath: string | null, language: string | null): Artifact {
    const id = uuid()
    const now = Date.now()
    this.db.prepare(
      'INSERT INTO artifacts (id, conversation_id, message_id, type, title, content, file_path, language, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, conversationId, messageId, type, title, content, filePath, language, now)
    return { id, conversationId, messageId, type, title, content, filePath, language, createdAt: now }
  }

  getArtifacts(conversationId: string): Artifact[] {
    const rows = this.db.prepare('SELECT * FROM artifacts WHERE conversation_id = ? ORDER BY created_at ASC').all(conversationId) as any[]
    return rows.map(this.mapArtifact)
  }

  // MCP Servers
  addMCPServer(config: Omit<MCPServer, 'id' | 'createdAt'>): MCPServer {
    const id = uuid()
    const now = Date.now()
    this.db.prepare(
      'INSERT INTO mcp_servers (id, name, transport, command, url, args, env, enabled, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, config.name, config.transport, config.command, config.url, config.args ? JSON.stringify(config.args) : null, config.env ? JSON.stringify(config.env) : null, config.enabled ? 1 : 0, now)
    return { id, ...config, createdAt: now }
  }

  listMCPServers(): MCPServer[] {
    const rows = this.db.prepare('SELECT * FROM mcp_servers ORDER BY created_at ASC').all() as any[]
    return rows.map(this.mapMCPServer)
  }

  removeMCPServer(id: string): void {
    this.db.prepare('DELETE FROM mcp_servers WHERE id = ?').run(id)
  }

  // Settings
  getSetting(key: string): unknown {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as any
    return row ? JSON.parse(row.value) : null
  }

  setSetting(key: string, value: unknown): void {
    this.db.prepare(
      'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)'
    ).run(key, JSON.stringify(value))
  }

  // Mappers
  private mapConversation(row: any): Conversation {
    return {
      id: row.id,
      title: row.title,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      workspacePath: row.workspace_path,
      isArchived: Boolean(row.is_archived),
    }
  }

  private mapMessage(row: any): Message {
    return {
      id: row.id,
      conversationId: row.conversation_id,
      role: row.role,
      content: JSON.parse(row.content),
      createdAt: row.created_at,
      tokenCount: row.token_count,
    }
  }

  private mapToolCall(row: any): ToolCall {
    return {
      id: row.id,
      messageId: row.message_id,
      toolName: row.tool_name,
      input: row.input ? JSON.parse(row.input) : null,
      output: row.output ? JSON.parse(row.output) : null,
      status: row.status,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      durationMs: row.duration_ms,
    }
  }

  private mapArtifact(row: any): Artifact {
    return {
      id: row.id,
      conversationId: row.conversation_id,
      messageId: row.message_id,
      type: row.type,
      title: row.title,
      content: row.content,
      filePath: row.file_path,
      language: row.language,
      createdAt: row.created_at,
    }
  }

  private mapMCPServer(row: any): MCPServer {
    return {
      id: row.id,
      name: row.name,
      transport: row.transport,
      command: row.command,
      url: row.url,
      args: row.args ? JSON.parse(row.args) : null,
      env: row.env ? JSON.parse(row.env) : null,
      enabled: Boolean(row.enabled),
      createdAt: row.created_at,
    }
  }

  close(): void {
    this.db.close()
  }
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/main/database.test.ts
```

Expected: all 6 tests PASS.

**Step 5: Commit**

```bash
git add src/main/database.ts tests/main/database.test.ts
git commit -m "feat: implement DatabaseManager with SQLite schema and CRUD operations"
```

---

### Task 8: Implement LlamaServerManager

**Files:**
- Create: `src/main/llama-server.ts`
- Create: `tests/main/llama-server.test.ts`

**Step 1: Write failing test**

```typescript
// tests/main/llama-server.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { LlamaServerManager } from '@main/llama-server'

// Mock child_process since we can't actually spawn llama-server in tests
vi.mock('child_process', () => ({
  spawn: vi.fn(() => ({
    pid: 12345,
    on: vi.fn(),
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    kill: vi.fn(() => true),
  })),
}))

// Mock fetch for health check
vi.stubGlobal('fetch', vi.fn())

describe('LlamaServerManager', () => {
  let manager: LlamaServerManager

  beforeEach(() => {
    manager = new LlamaServerManager({
      modelPath: '/fake/model.gguf',
      port: 8080,
      contextSize: 8192,
    })
    vi.clearAllMocks()
  })

  it('initializes with correct config', () => {
    expect(manager.getStatus()).toBe('stopped')
    expect(manager.getPort()).toBe(8080)
  })

  it('builds correct command args', () => {
    const args = manager.buildArgs()
    expect(args).toContain('--model')
    expect(args).toContain('/fake/model.gguf')
    expect(args).toContain('--jinja')
    expect(args).toContain('--port')
    expect(args).toContain('8080')
    expect(args).toContain('--ctx-size')
    expect(args).toContain('8192')
  })
})
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run tests/main/llama-server.test.ts
```

Expected: FAIL.

**Step 3: Implement LlamaServerManager**

```typescript
// src/main/llama-server.ts
import { spawn, ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import path from 'path'
import type { LlamaStatus } from '../shared/types'

interface LlamaServerConfig {
  modelPath: string
  port: number
  contextSize: number
  gpuLayers?: number
  binaryPath?: string
}

export class LlamaServerManager extends EventEmitter {
  private process: ChildProcess | null = null
  private status: LlamaStatus = 'stopped'
  private config: LlamaServerConfig
  private restartCount = 0
  private maxRestarts = 3
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null

  constructor(config: LlamaServerConfig) {
    super()
    this.config = config
  }

  getStatus(): LlamaStatus {
    return this.status
  }

  getPort(): number {
    return this.config.port
  }

  buildArgs(): string[] {
    const args = [
      '--model', this.config.modelPath,
      '--jinja',
      '--port', String(this.config.port),
      '--ctx-size', String(this.config.contextSize),
    ]
    if (this.config.gpuLayers !== undefined) {
      args.push('--n-gpu-layers', String(this.config.gpuLayers))
    }
    return args
  }

  async start(): Promise<void> {
    if (this.status === 'ready' || this.status === 'starting') return

    this.setStatus('starting')
    const binaryPath = this.config.binaryPath || this.getDefaultBinaryPath()
    const args = this.buildArgs()

    this.process = spawn(binaryPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    this.process.stdout?.on('data', (data: Buffer) => {
      this.emit('log', data.toString())
    })

    this.process.stderr?.on('data', (data: Buffer) => {
      this.emit('log', data.toString())
    })

    this.process.on('exit', (code) => {
      this.emit('log', `llama-server exited with code ${code}`)
      this.stopHealthCheck()
      if (this.status !== 'stopped') {
        this.setStatus('error')
        this.tryRestart()
      }
    })

    this.process.on('error', (err) => {
      this.emit('log', `llama-server error: ${err.message}`)
      this.setStatus('error')
    })

    await this.waitForHealth()
  }

  async stop(): Promise<void> {
    this.setStatus('stopped')
    this.stopHealthCheck()
    if (this.process) {
      this.process.kill('SIGTERM')
      // Give 5s for graceful shutdown, then force kill
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          if (this.process) {
            this.process.kill('SIGKILL')
          }
          resolve()
        }, 5000)
        this.process?.on('exit', () => {
          clearTimeout(timeout)
          resolve()
        })
      })
      this.process = null
    }
  }

  private async waitForHealth(maxWaitMs = 60000): Promise<void> {
    const startTime = Date.now()
    const url = `http://127.0.0.1:${this.config.port}/health`

    while (Date.now() - startTime < maxWaitMs) {
      try {
        const res = await fetch(url)
        if (res.ok) {
          this.setStatus('ready')
          this.restartCount = 0
          this.startHealthCheck()
          return
        }
      } catch {
        // Server not ready yet
      }
      await new Promise(r => setTimeout(r, 500))
    }

    this.setStatus('error')
    throw new Error('llama-server failed to become healthy within timeout')
  }

  private startHealthCheck(): void {
    this.healthCheckInterval = setInterval(async () => {
      try {
        const res = await fetch(`http://127.0.0.1:${this.config.port}/health`)
        if (!res.ok && this.status === 'ready') {
          this.setStatus('error')
          this.tryRestart()
        }
      } catch {
        if (this.status === 'ready') {
          this.setStatus('error')
          this.tryRestart()
        }
      }
    }, 10000)
  }

  private stopHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
      this.healthCheckInterval = null
    }
  }

  private async tryRestart(): Promise<void> {
    if (this.restartCount >= this.maxRestarts) {
      this.emit('log', `llama-server exceeded max restarts (${this.maxRestarts})`)
      this.setStatus('error')
      return
    }
    this.restartCount++
    this.emit('log', `Restarting llama-server (attempt ${this.restartCount}/${this.maxRestarts})`)
    this.process = null
    await this.start()
  }

  private setStatus(status: LlamaStatus): void {
    this.status = status
    this.emit('status', status)
  }

  private getDefaultBinaryPath(): string {
    const platform = process.platform
    const arch = process.arch
    // In packaged app, binaries are in resources/
    const basePath = process.resourcesPath || path.join(__dirname, '../../resources')
    const binaryName = platform === 'win32' ? 'llama-server.exe' : 'llama-server'
    return path.join(basePath, 'bin', `${platform}-${arch}`, binaryName)
  }

  getBaseUrl(): string {
    return `http://127.0.0.1:${this.config.port}`
  }
}
```

**Step 4: Run tests**

```bash
npx vitest run tests/main/llama-server.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/main/llama-server.ts tests/main/llama-server.test.ts
git commit -m "feat: implement LlamaServerManager with lifecycle, health checks, and auto-restart"
```

---

### Task 9: Implement preload script and IPC bridge

**Files:**
- Create: `src/preload/index.ts`

**Step 1: Implement contextBridge API**

```typescript
// src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron'
import type { FolkAPI } from '../shared/types'

const folkAPI: FolkAPI = {
  // Agent
  sendMessage: (conversationId, content) => ipcRenderer.invoke('agent:send-message', conversationId, content),
  stopAgent: (conversationId) => ipcRenderer.invoke('agent:stop', conversationId),

  // Conversations
  createConversation: () => ipcRenderer.invoke('conversation:create'),
  listConversations: () => ipcRenderer.invoke('conversation:list'),
  deleteConversation: (id) => ipcRenderer.invoke('conversation:delete', id),
  renameConversation: (id, title) => ipcRenderer.invoke('conversation:rename', id, title),
  getMessages: (conversationId) => ipcRenderer.invoke('conversation:messages', conversationId),

  // Settings
  getSetting: (key) => ipcRenderer.invoke('settings:get', key),
  setSetting: (key, value) => ipcRenderer.invoke('settings:set', key, value),

  // MCP
  listMCPServers: () => ipcRenderer.invoke('mcp:list-servers'),
  addMCPServer: (config) => ipcRenderer.invoke('mcp:add-server', config),
  removeMCPServer: (id) => ipcRenderer.invoke('mcp:remove-server', id),
  testMCPConnection: (id) => ipcRenderer.invoke('mcp:test-connection', id),

  // Model
  getModelInfo: () => ipcRenderer.invoke('model:info'),
  changeModel: (path) => ipcRenderer.invoke('model:change', path),
  downloadModel: (url) => ipcRenderer.invoke('model:download', url),

  // Workspace
  selectWorkspace: () => ipcRenderer.invoke('workspace:select'),
  getCurrentWorkspace: () => ipcRenderer.invoke('workspace:current'),

  // System
  getLlamaStatus: () => ipcRenderer.invoke('llama:status'),
  getAppVersion: () => ipcRenderer.invoke('app:version'),
  openFileDialog: (options) => ipcRenderer.invoke('dialog:open-file', options),

  // Event listeners
  onToken: (callback) => {
    const handler = (_: unknown, data: any) => callback(data)
    ipcRenderer.on('agent:token', handler)
    return () => ipcRenderer.removeListener('agent:token', handler)
  },
  onToolStart: (callback) => {
    const handler = (_: unknown, data: any) => callback(data)
    ipcRenderer.on('agent:tool-start', handler)
    return () => ipcRenderer.removeListener('agent:tool-start', handler)
  },
  onToolResult: (callback) => {
    const handler = (_: unknown, data: any) => callback(data)
    ipcRenderer.on('agent:tool-result', handler)
    return () => ipcRenderer.removeListener('agent:tool-result', handler)
  },
  onArtifact: (callback) => {
    const handler = (_: unknown, data: any) => callback(data)
    ipcRenderer.on('agent:artifact', handler)
    return () => ipcRenderer.removeListener('agent:artifact', handler)
  },
  onAgentComplete: (callback) => {
    const handler = (_: unknown, data: any) => callback(data)
    ipcRenderer.on('agent:complete', handler)
    return () => ipcRenderer.removeListener('agent:complete', handler)
  },
  onAgentError: (callback) => {
    const handler = (_: unknown, data: any) => callback(data)
    ipcRenderer.on('agent:error', handler)
    return () => ipcRenderer.removeListener('agent:error', handler)
  },
  onDownloadProgress: (callback) => {
    const handler = (_: unknown, data: any) => callback(data)
    ipcRenderer.on('model:download-progress', handler)
    return () => ipcRenderer.removeListener('model:download-progress', handler)
  },
  onLlamaStatusChange: (callback) => {
    const handler = (_: unknown, status: any) => callback(status)
    ipcRenderer.on('llama:status-change', handler)
    return () => ipcRenderer.removeListener('llama:status-change', handler)
  },
}

contextBridge.exposeInMainWorld('folk', folkAPI)
```

**Step 2: Add global type declaration for renderer**

```typescript
// src/preload/types.ts
import type { FolkAPI } from '../shared/types'

declare global {
  interface Window {
    folk: FolkAPI
  }
}

export {}
```

**Step 3: Commit**

```bash
git add src/preload/
git commit -m "feat: implement preload script with typed contextBridge IPC API"
```

---

### Task 10: Implement IPC handlers in main process

**Files:**
- Create: `src/main/ipc-handlers.ts`

**Step 1: Implement IPC handler registration**

```typescript
// src/main/ipc-handlers.ts
import { ipcMain, dialog, app, BrowserWindow } from 'electron'
import type { DatabaseManager } from './database'
import type { LlamaServerManager } from './llama-server'

interface IPCDependencies {
  db: DatabaseManager
  llama: LlamaServerManager
  getMainWindow: () => BrowserWindow | null
  getWorkspacePath: () => string
  setWorkspacePath: (path: string) => void
}

export function registerIPCHandlers(deps: IPCDependencies): void {
  const { db, llama, getMainWindow, getWorkspacePath, setWorkspacePath } = deps

  // Conversations
  ipcMain.handle('conversation:create', () => {
    return db.createConversation('New Chat', getWorkspacePath())
  })

  ipcMain.handle('conversation:list', () => {
    return db.listConversations()
  })

  ipcMain.handle('conversation:delete', (_, id: string) => {
    db.deleteConversation(id)
  })

  ipcMain.handle('conversation:rename', (_, id: string, title: string) => {
    db.renameConversation(id, title)
  })

  ipcMain.handle('conversation:messages', (_, conversationId: string) => {
    return db.getMessages(conversationId)
  })

  // Settings
  ipcMain.handle('settings:get', (_, key: string) => {
    return db.getSetting(key)
  })

  ipcMain.handle('settings:set', (_, key: string, value: unknown) => {
    db.setSetting(key, value)
  })

  // MCP
  ipcMain.handle('mcp:list-servers', () => {
    return db.listMCPServers()
  })

  ipcMain.handle('mcp:add-server', (_, config) => {
    return db.addMCPServer(config)
  })

  ipcMain.handle('mcp:remove-server', (_, id: string) => {
    db.removeMCPServer(id)
  })

  ipcMain.handle('mcp:test-connection', async (_, _id: string) => {
    // TODO: Implement MCP connection testing
    return { ok: false, error: 'Not implemented yet' }
  })

  // Model
  ipcMain.handle('model:info', () => {
    // TODO: Read from settings/llama config
    return null
  })

  ipcMain.handle('model:change', async (_, modelPath: string) => {
    db.setSetting('modelPath', modelPath)
    // TODO: Restart llama-server with new model
  })

  ipcMain.handle('model:download', async (_, url: string) => {
    // TODO: Implement model download with progress
    const win = getMainWindow()
    if (!win) return
    // Download implementation will go in ModelManager
  })

  // Workspace
  ipcMain.handle('workspace:select', async () => {
    const win = getMainWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Workspace Folder',
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const selectedPath = result.filePaths[0]
    setWorkspacePath(selectedPath)
    db.setSetting('workspacePath', selectedPath)
    return selectedPath
  })

  ipcMain.handle('workspace:current', () => {
    return getWorkspacePath()
  })

  // System
  ipcMain.handle('llama:status', () => {
    return llama.getStatus()
  })

  ipcMain.handle('app:version', () => {
    return app.getVersion()
  })

  ipcMain.handle('dialog:open-file', async (_, options?: any) => {
    const win = getMainWindow()
    if (!win) return []
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: options?.filters,
    })
    return result.canceled ? [] : result.filePaths
  })
}
```

**Step 2: Commit**

```bash
git add src/main/ipc-handlers.ts
git commit -m "feat: register all IPC handlers for conversations, settings, model, workspace"
```

---

### Task 11: Implement main process entry point

**Files:**
- Modify: `src/main/index.ts`

**Step 1: Write main process entry**

```typescript
// src/main/index.ts
import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { DatabaseManager } from './database'
import { LlamaServerManager } from './llama-server'
import { registerIPCHandlers } from './ipc-handlers'

let mainWindow: BrowserWindow | null = null
let db: DatabaseManager
let llama: LlamaServerManager
let workspacePath: string = app.getPath('home')

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#0f0f0f',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.folk.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Initialize database
  const userDataPath = app.getPath('userData')
  db = new DatabaseManager(join(userDataPath, 'folk.db'))

  // Restore workspace path from settings
  const savedWorkspace = db.getSetting('workspacePath') as string | null
  if (savedWorkspace) {
    workspacePath = savedWorkspace
  }

  // Initialize llama-server
  const modelPath = (db.getSetting('modelPath') as string) || join(userDataPath, 'models', 'gemma-4-e4b-q4.gguf')
  llama = new LlamaServerManager({
    modelPath,
    port: 8080,
    contextSize: (db.getSetting('contextSize') as number) || 8192,
  })

  llama.on('status', (status) => {
    mainWindow?.webContents.send('llama:status-change', status)
  })

  llama.on('log', (msg) => {
    console.log('[llama-server]', msg)
  })

  // Register IPC handlers
  registerIPCHandlers({
    db,
    llama,
    getMainWindow: () => mainWindow,
    getWorkspacePath: () => workspacePath,
    setWorkspacePath: (p) => { workspacePath = p },
  })

  createWindow()

  // Check if model exists before starting llama-server
  const fs = await import('fs')
  if (fs.existsSync(modelPath)) {
    try {
      await llama.start()
    } catch (err) {
      console.error('Failed to start llama-server:', err)
    }
  } else {
    console.log('No model found at', modelPath, '— waiting for user to download')
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', async () => {
  await llama?.stop()
  db?.close()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
```

**Step 2: Commit**

```bash
git add src/main/index.ts
git commit -m "feat: implement main process entry with database, llama-server, and window creation"
```

---

### Task 12: Implement ModelManager for downloads

**Files:**
- Create: `src/main/model-manager.ts`

**Step 1: Implement model download with progress**

```typescript
// src/main/model-manager.ts
import { createWriteStream, existsSync, mkdirSync, statSync, unlinkSync } from 'fs'
import { join, dirname } from 'path'
import { EventEmitter } from 'events'
import { createHash } from 'crypto'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'

interface DownloadOptions {
  url: string
  destPath: string
  expectedHash?: string
}

export class ModelManager extends EventEmitter {
  private modelsDir: string
  private isDownloading = false

  constructor(modelsDir: string) {
    super()
    this.modelsDir = modelsDir
    if (!existsSync(modelsDir)) {
      mkdirSync(modelsDir, { recursive: true })
    }
  }

  getModelsDir(): string {
    return this.modelsDir
  }

  getDefaultModelPath(): string {
    return join(this.modelsDir, 'gemma-4-e4b-q4.gguf')
  }

  hasDefaultModel(): boolean {
    return existsSync(this.getDefaultModelPath())
  }

  listModels(): { name: string; path: string; sizeBytes: number }[] {
    const fs = require('fs')
    if (!existsSync(this.modelsDir)) return []
    const files = fs.readdirSync(this.modelsDir) as string[]
    return files
      .filter((f: string) => f.endsWith('.gguf'))
      .map((f: string) => {
        const fullPath = join(this.modelsDir, f)
        const stats = statSync(fullPath)
        return { name: f, path: fullPath, sizeBytes: stats.size }
      })
  }

  async download(options: DownloadOptions): Promise<void> {
    if (this.isDownloading) throw new Error('Download already in progress')
    this.isDownloading = true

    const { url, destPath, expectedHash } = options
    const dir = dirname(destPath)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

    const tmpPath = destPath + '.tmp'

    try {
      // Check for partial download (resume support)
      let startByte = 0
      if (existsSync(tmpPath)) {
        startByte = statSync(tmpPath).size
      }

      const headers: Record<string, string> = {}
      if (startByte > 0) {
        headers['Range'] = `bytes=${startByte}-`
      }

      const response = await fetch(url, { headers })

      if (!response.ok && response.status !== 206) {
        throw new Error(`Download failed: HTTP ${response.status}`)
      }

      const totalSize = parseInt(response.headers.get('content-length') || '0', 10) + startByte
      let downloadedSize = startByte
      const startTime = Date.now()

      const fileStream = createWriteStream(tmpPath, { flags: startByte > 0 ? 'a' : 'w' })
      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        fileStream.write(value)
        downloadedSize += value.length

        const elapsed = (Date.now() - startTime) / 1000
        const speed = (downloadedSize - startByte) / elapsed
        const remaining = totalSize > 0 ? (totalSize - downloadedSize) / speed : 0

        this.emit('progress', {
          percent: totalSize > 0 ? Math.round((downloadedSize / totalSize) * 100) : 0,
          speed: this.formatBytes(speed) + '/s',
          eta: this.formatDuration(remaining),
        })
      }

      fileStream.end()
      await new Promise(resolve => fileStream.on('finish', resolve))

      // Verify hash if provided
      if (expectedHash) {
        const hash = await this.hashFile(tmpPath)
        if (hash !== expectedHash) {
          unlinkSync(tmpPath)
          throw new Error(`Hash mismatch: expected ${expectedHash}, got ${hash}`)
        }
      }

      // Move tmp to final location
      const fs = require('fs')
      fs.renameSync(tmpPath, destPath)

      this.emit('complete', { path: destPath })
    } catch (err) {
      this.emit('error', err)
      throw err
    } finally {
      this.isDownloading = false
    }
  }

  private async hashFile(filePath: string): Promise<string> {
    const fs = require('fs')
    const hash = createHash('sha256')
    const stream = fs.createReadStream(filePath)
    for await (const chunk of stream) {
      hash.update(chunk)
    }
    return hash.digest('hex')
  }

  private formatBytes(bytes: number): string {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
  }

  private formatDuration(seconds: number): string {
    if (seconds < 60) return `${Math.ceil(seconds)}s`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.ceil(seconds % 60)}s`
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
  }
}
```

**Step 2: Commit**

```bash
git add src/main/model-manager.ts
git commit -m "feat: implement ModelManager with resumable downloads and hash verification"
```

---

### Task 13: Implement file system tools for agent

**Files:**
- Create: `src/main/tools/file-system.ts`

**Step 1: Implement workspace-scoped file tools**

```typescript
// src/main/tools/file-system.ts
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, statSync } from 'fs'
import { join, resolve, relative, extname } from 'path'

export interface FileToolResult {
  success: boolean
  data?: unknown
  error?: string
}

export class FileSystemTools {
  private workspacePath: string

  constructor(workspacePath: string) {
    this.workspacePath = resolve(workspacePath)
  }

  setWorkspace(path: string): void {
    this.workspacePath = resolve(path)
  }

  private isWithinWorkspace(filePath: string): boolean {
    const resolved = resolve(filePath)
    return resolved.startsWith(this.workspacePath)
  }

  private ensureWithinWorkspace(filePath: string): string {
    const resolved = filePath.startsWith('/') ? resolve(filePath) : resolve(this.workspacePath, filePath)
    if (!this.isWithinWorkspace(resolved)) {
      throw new Error(`Access denied: ${filePath} is outside the workspace boundary`)
    }
    return resolved
  }

  readFile(filePath: string): FileToolResult {
    try {
      const resolved = this.ensureWithinWorkspace(filePath)
      if (!existsSync(resolved)) {
        return { success: false, error: `File not found: ${filePath}` }
      }
      const content = readFileSync(resolved, 'utf-8')
      return { success: true, data: { content, path: relative(this.workspacePath, resolved) } }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  }

  writeFile(filePath: string, content: string): FileToolResult {
    try {
      const resolved = this.ensureWithinWorkspace(filePath)
      const dir = resolve(resolved, '..')
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
      }
      writeFileSync(resolved, content, 'utf-8')
      return { success: true, data: { path: relative(this.workspacePath, resolved), bytesWritten: Buffer.byteLength(content) } }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  }

  listDirectory(dirPath?: string): FileToolResult {
    try {
      const resolved = dirPath ? this.ensureWithinWorkspace(dirPath) : this.workspacePath
      if (!existsSync(resolved)) {
        return { success: false, error: `Directory not found: ${dirPath}` }
      }
      const entries = readdirSync(resolved, { withFileTypes: true })
      const items = entries.map(entry => ({
        name: entry.name,
        type: entry.isDirectory() ? 'directory' : 'file',
        size: entry.isFile() ? statSync(join(resolved, entry.name)).size : undefined,
        extension: entry.isFile() ? extname(entry.name) : undefined,
      }))
      return { success: true, data: { path: relative(this.workspacePath, resolved) || '.', entries: items } }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  }

  createFile(filePath: string, content: string = ''): FileToolResult {
    try {
      const resolved = this.ensureWithinWorkspace(filePath)
      if (existsSync(resolved)) {
        return { success: false, error: `File already exists: ${filePath}` }
      }
      return this.writeFile(filePath, content)
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  }

  getToolDefinitions(): object[] {
    return [
      {
        name: 'read_file',
        description: 'Read the contents of a file within the workspace. Returns the file content as text.',
        input_schema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Path to the file, relative to workspace root' },
          },
          required: ['path'],
        },
      },
      {
        name: 'write_file',
        description: 'Write content to a file within the workspace. Creates the file if it does not exist, overwrites if it does.',
        input_schema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Path to the file, relative to workspace root' },
            content: { type: 'string', description: 'Content to write to the file' },
          },
          required: ['path', 'content'],
        },
      },
      {
        name: 'list_directory',
        description: 'List the contents of a directory within the workspace. Returns file names, types, and sizes.',
        input_schema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Path to the directory, relative to workspace root. Omit to list workspace root.' },
          },
        },
      },
      {
        name: 'create_file',
        description: 'Create a new file within the workspace. Fails if the file already exists.',
        input_schema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Path for the new file, relative to workspace root' },
            content: { type: 'string', description: 'Initial content for the file (default: empty)' },
          },
          required: ['path'],
        },
      },
    ]
  }

  executeTool(toolName: string, input: Record<string, unknown>): FileToolResult {
    switch (toolName) {
      case 'read_file':
        return this.readFile(input.path as string)
      case 'write_file':
        return this.writeFile(input.path as string, input.content as string)
      case 'list_directory':
        return this.listDirectory(input.path as string | undefined)
      case 'create_file':
        return this.createFile(input.path as string, input.content as string | undefined)
      default:
        return { success: false, error: `Unknown tool: ${toolName}` }
    }
  }
}
```

**Step 2: Commit**

```bash
git add src/main/tools/file-system.ts
git commit -m "feat: implement workspace-scoped file system tools for agent"
```

---

### Task 14: Implement AgentManager

**Files:**
- Create: `src/main/agent-manager.ts`

**Step 1: Implement Agent SDK wrapper**

```typescript
// src/main/agent-manager.ts
import Anthropic from '@anthropic-ai/sdk'
import { EventEmitter } from 'events'
import { BrowserWindow } from 'electron'
import { FileSystemTools } from './tools/file-system'
import type { DatabaseManager } from './database'
import type { ContentBlock, Message } from '../shared/types'

interface AgentManagerConfig {
  baseUrl: string
  db: DatabaseManager
  fileTools: FileSystemTools
  getMainWindow: () => BrowserWindow | null
}

export class AgentManager extends EventEmitter {
  private client: Anthropic
  private db: DatabaseManager
  private fileTools: FileSystemTools
  private getMainWindow: () => BrowserWindow | null
  private abortControllers: Map<string, AbortController> = new Map()

  constructor(config: AgentManagerConfig) {
    super()
    this.client = new Anthropic({
      baseURL: config.baseUrl,
      apiKey: 'local-no-key-needed',
    })
    this.db = config.db
    this.fileTools = config.fileTools
    this.getMainWindow = config.getMainWindow
  }

  updateBaseUrl(url: string): void {
    this.client = new Anthropic({
      baseURL: url,
      apiKey: 'local-no-key-needed',
    })
  }

  async handleMessage(conversationId: string, userContent: string): Promise<void> {
    const win = this.getMainWindow()

    // Save user message
    const userMsg = this.db.addMessage(conversationId, 'user', [{ type: 'text', text: userContent }])

    // Load conversation history
    const messages = this.db.getMessages(conversationId)
    const anthropicMessages = messages.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))

    const abortController = new AbortController()
    this.abortControllers.set(conversationId, abortController)

    try {
      await this.agentLoop(conversationId, anthropicMessages, abortController.signal)
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        win?.webContents.send('agent:error', { conversationId, error: err.message })
      }
    } finally {
      this.abortControllers.delete(conversationId)
    }
  }

  stop(conversationId: string): void {
    const controller = this.abortControllers.get(conversationId)
    if (controller) {
      controller.abort()
      this.abortControllers.delete(conversationId)
    }
  }

  private async agentLoop(
    conversationId: string,
    messages: { role: string; content: any }[],
    signal: AbortSignal
  ): Promise<void> {
    const win = this.getMainWindow()
    const tools = this.fileTools.getToolDefinitions()
    const maxIterations = 20

    for (let i = 0; i < maxIterations; i++) {
      if (signal.aborted) return

      const stream = this.client.messages.stream({
        model: 'gemma-4-e4b',
        max_tokens: 4096,
        system: this.getSystemPrompt(),
        messages: messages as any,
        tools: tools as any,
      })

      let assistantContent: ContentBlock[] = []
      let accumulatedText = ''

      stream.on('text', (text) => {
        accumulatedText += text
        win?.webContents.send('agent:token', { conversationId, token: text })
      })

      const response = await stream.finalMessage()

      // Build content blocks from response
      for (const block of response.content) {
        if (block.type === 'text') {
          assistantContent.push({ type: 'text', text: block.text })
        } else if (block.type === 'tool_use') {
          assistantContent.push({
            type: 'tool_use',
            id: block.id,
            name: block.name,
            input: block.input as Record<string, unknown>,
          })
        }
      }

      // Save assistant message
      const assistantMsg = this.db.addMessage(conversationId, 'assistant', assistantContent)

      // Check if we need to execute tools
      const toolUseBlocks = response.content.filter(b => b.type === 'tool_use')

      if (response.stop_reason === 'end_turn' || toolUseBlocks.length === 0) {
        // No tools to execute — we're done
        win?.webContents.send('agent:complete', {
          conversationId,
          message: assistantMsg,
        })
        return
      }

      // Execute tools and build tool_result message
      const toolResults: ContentBlock[] = []

      for (const toolBlock of toolUseBlocks) {
        if (toolBlock.type !== 'tool_use') continue

        win?.webContents.send('agent:tool-start', {
          conversationId,
          toolCall: { id: toolBlock.id, toolName: toolBlock.name, input: toolBlock.input },
        })

        const toolCallRecord = this.db.addToolCall(assistantMsg.id, toolBlock.name, toolBlock.input as Record<string, unknown>)

        const result = this.fileTools.executeTool(toolBlock.name, toolBlock.input as Record<string, unknown>)

        const status = result.success ? 'success' as const : 'error' as const
        this.db.completeToolCall(toolCallRecord.id, result.data as Record<string, unknown> | null, status)

        // Create artifact if file was written
        if (result.success && (toolBlock.name === 'write_file' || toolBlock.name === 'create_file')) {
          const input = toolBlock.input as Record<string, unknown>
          const artifact = this.db.addArtifact(
            conversationId,
            assistantMsg.id,
            'file',
            input.path as string,
            input.content as string || null,
            input.path as string,
            null
          )
          win?.webContents.send('agent:artifact', { conversationId, artifact })
        }

        win?.webContents.send('agent:tool-result', {
          conversationId,
          toolCall: {
            id: toolBlock.id,
            toolName: toolBlock.name,
            output: result,
            status,
            durationMs: 0,
          },
        })

        toolResults.push({
          type: 'tool_result',
          toolUseId: toolBlock.id,
          content: JSON.stringify(result.data || result.error),
          isError: !result.success,
        })
      }

      // Add messages for the next loop iteration
      messages.push({ role: 'assistant', content: assistantContent })
      messages.push({ role: 'user', content: toolResults })

      // Save tool results as user message (Anthropic format)
      this.db.addMessage(conversationId, 'user', toolResults)
    }
  }

  private getSystemPrompt(): string {
    return `You are Folk, a helpful AI assistant running locally on the user's machine. You have access to file system tools to read, write, and manage files within the user's workspace.

Key behaviors:
- Be helpful, concise, and direct
- When the user asks to create or modify files, use the provided tools
- Always confirm what you did after completing file operations
- If you encounter an error, explain what went wrong and suggest alternatives
- You are running locally — no data leaves this machine

Available tools let you read files, write files, list directories, and create new files within the user's workspace.`
  }
}
```

**Step 2: Commit**

```bash
git add src/main/agent-manager.ts
git commit -m "feat: implement AgentManager with agent loop, tool execution, and streaming"
```

**Checkpoint**: All foundational infrastructure complete. Database, llama-server manager, IPC bridge, preload API, agent manager, file tools, model manager all wired up.

---

## Phase 3: User Story 1 — Core Chat UI (P1, MVP)

**Goal**: User can send messages and receive streamed responses in a Cowork-style layout.

**Independent Test**: Launch app, send a message, see streaming response. Sidebar shows conversation list.

---

### Task 15: Create React entry point and App shell

**Files:**
- Modify: `src/renderer/main.tsx`
- Modify: `src/renderer/App.tsx`
- Create: `src/renderer/index.html`

**Step 1: Write renderer HTML**

```html
<!-- src/renderer/index.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Folk</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="./main.tsx"></script>
</body>
</html>
```

**Step 2: Write React entry**

```tsx
// src/renderer/main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/globals.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

**Step 3: Write App shell**

```tsx
// src/renderer/App.tsx
import { useEffect } from 'react'
import { TitleBar } from './components/TitleBar'
import { Sidebar } from './components/Sidebar/Sidebar'
import { ChatPanel } from './components/ChatPanel/ChatPanel'
import { ArtifactPanel } from './components/ArtifactPanel/ArtifactPanel'
import { SettingsDrawer } from './components/SettingsDrawer/SettingsDrawer'
import { useUIStore } from './stores/ui'
import { useConversationStore } from './stores/conversation'

export default function App() {
  const showArtifactPanel = useUIStore(s => s.showArtifactPanel)
  const showSettings = useUIStore(s => s.showSettings)
  const loadConversations = useConversationStore(s => s.loadConversations)

  useEffect(() => {
    loadConversations()
  }, [loadConversations])

  return (
    <div className="flex flex-col h-screen bg-void-black text-text-primary overflow-hidden">
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <ChatPanel />
        {showArtifactPanel && <ArtifactPanel />}
      </div>
      {showSettings && <SettingsDrawer />}
    </div>
  )
}
```

**Step 4: Commit**

```bash
git add src/renderer/
git commit -m "feat: create React entry point and App shell with panel layout"
```

---

### Task 16: Implement Zustand stores

**Files:**
- Create: `src/renderer/stores/conversation.ts`
- Create: `src/renderer/stores/ui.ts`
- Create: `src/renderer/stores/agent.ts`
- Create: `src/renderer/stores/settings.ts`

**Step 1: Conversation store**

```typescript
// src/renderer/stores/conversation.ts
import { create } from 'zustand'
import type { Conversation, Message, ContentBlock } from '../../shared/types'

interface ConversationState {
  conversations: Conversation[]
  activeConversationId: string | null
  messages: Message[]
  streamingText: string

  loadConversations: () => Promise<void>
  setActiveConversation: (id: string | null) => Promise<void>
  createConversation: () => Promise<Conversation>
  deleteConversation: (id: string) => Promise<void>
  renameConversation: (id: string, title: string) => Promise<void>
  sendMessage: (content: string) => Promise<void>
  appendToken: (token: string) => void
  addMessage: (message: Message) => void
  clearStreaming: () => void
}

export const useConversationStore = create<ConversationState>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  messages: [],
  streamingText: '',

  loadConversations: async () => {
    const conversations = await window.folk.listConversations()
    set({ conversations })
  },

  setActiveConversation: async (id) => {
    set({ activeConversationId: id, messages: [], streamingText: '' })
    if (id) {
      const messages = await window.folk.getMessages(id)
      set({ messages })
    }
  },

  createConversation: async () => {
    const conv = await window.folk.createConversation()
    set(s => ({ conversations: [conv, ...s.conversations], activeConversationId: conv.id, messages: [] }))
    return conv
  },

  deleteConversation: async (id) => {
    await window.folk.deleteConversation(id)
    set(s => {
      const conversations = s.conversations.filter(c => c.id !== id)
      const activeConversationId = s.activeConversationId === id ? null : s.activeConversationId
      return { conversations, activeConversationId, messages: activeConversationId ? s.messages : [] }
    })
  },

  renameConversation: async (id, title) => {
    await window.folk.renameConversation(id, title)
    set(s => ({
      conversations: s.conversations.map(c => c.id === id ? { ...c, title } : c),
    }))
  },

  sendMessage: async (content) => {
    let { activeConversationId } = get()
    if (!activeConversationId) {
      const conv = await get().createConversation()
      activeConversationId = conv.id
    }
    // Optimistic user message
    const userMsg: Message = {
      id: crypto.randomUUID(),
      conversationId: activeConversationId,
      role: 'user',
      content: [{ type: 'text', text: content }],
      createdAt: Date.now(),
      tokenCount: null,
    }
    set(s => ({ messages: [...s.messages, userMsg], streamingText: '' }))
    await window.folk.sendMessage(activeConversationId, content)
  },

  appendToken: (token) => {
    set(s => ({ streamingText: s.streamingText + token }))
  },

  addMessage: (message) => {
    set(s => ({ messages: [...s.messages, message], streamingText: '' }))
  },

  clearStreaming: () => {
    set({ streamingText: '' })
  },
}))
```

**Step 2: UI store**

```typescript
// src/renderer/stores/ui.ts
import { create } from 'zustand'

interface UIState {
  showArtifactPanel: boolean
  showSettings: boolean
  showActivityLog: boolean
  sidebarCollapsed: boolean

  toggleArtifactPanel: () => void
  toggleSettings: () => void
  toggleActivityLog: () => void
  toggleSidebar: () => void
  setShowSettings: (show: boolean) => void
}

export const useUIStore = create<UIState>((set) => ({
  showArtifactPanel: false,
  showSettings: false,
  showActivityLog: false,
  sidebarCollapsed: false,

  toggleArtifactPanel: () => set(s => ({ showArtifactPanel: !s.showArtifactPanel })),
  toggleSettings: () => set(s => ({ showSettings: !s.showSettings })),
  toggleActivityLog: () => set(s => ({ showActivityLog: !s.showActivityLog })),
  toggleSidebar: () => set(s => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setShowSettings: (show) => set({ showSettings: show }),
}))
```

**Step 3: Agent store**

```typescript
// src/renderer/stores/agent.ts
import { create } from 'zustand'
import type { LlamaStatus, ToolCallStart, ToolCallResult, Artifact } from '../../shared/types'

interface AgentState {
  llamaStatus: LlamaStatus
  isProcessing: boolean
  toolCalls: (ToolCallStart & { result?: ToolCallResult })[]
  artifacts: Artifact[]

  setLlamaStatus: (status: LlamaStatus) => void
  setProcessing: (processing: boolean) => void
  addToolCall: (call: ToolCallStart) => void
  completeToolCall: (result: ToolCallResult) => void
  addArtifact: (artifact: Artifact) => void
  clearToolCalls: () => void
}

export const useAgentStore = create<AgentState>((set) => ({
  llamaStatus: 'stopped',
  isProcessing: false,
  toolCalls: [],
  artifacts: [],

  setLlamaStatus: (status) => set({ llamaStatus: status }),
  setProcessing: (processing) => set({ isProcessing: processing }),
  addToolCall: (call) => set(s => ({ toolCalls: [...s.toolCalls, call] })),
  completeToolCall: (result) => set(s => ({
    toolCalls: s.toolCalls.map(tc =>
      tc.id === result.id ? { ...tc, result } : tc
    ),
  })),
  addArtifact: (artifact) => set(s => ({ artifacts: [...s.artifacts, artifact] })),
  clearToolCalls: () => set({ toolCalls: [] }),
}))
```

**Step 4: Settings store**

```typescript
// src/renderer/stores/settings.ts
import { create } from 'zustand'

interface SettingsState {
  fontSize: 'small' | 'medium' | 'large'
  compactMode: boolean
  workspacePath: string

  setFontSize: (size: 'small' | 'medium' | 'large') => void
  setCompactMode: (compact: boolean) => void
  setWorkspacePath: (path: string) => void
  loadSettings: () => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set) => ({
  fontSize: 'medium',
  compactMode: false,
  workspacePath: '',

  setFontSize: (fontSize) => {
    set({ fontSize })
    window.folk.setSetting('fontSize', fontSize)
  },
  setCompactMode: (compactMode) => {
    set({ compactMode })
    window.folk.setSetting('compactMode', compactMode)
  },
  setWorkspacePath: (workspacePath) => set({ workspacePath }),
  loadSettings: async () => {
    const fontSize = (await window.folk.getSetting('fontSize') as string) || 'medium'
    const compactMode = (await window.folk.getSetting('compactMode') as boolean) || false
    const workspacePath = await window.folk.getCurrentWorkspace()
    set({ fontSize: fontSize as any, compactMode, workspacePath })
  },
}))
```

**Step 5: Commit**

```bash
git add src/renderer/stores/
git commit -m "feat: implement Zustand stores for conversations, UI, agent, and settings"
```

---

### Task 17: Implement IPC event listeners hook

**Files:**
- Create: `src/renderer/hooks/useIPC.ts`

**Step 1: Create hook that wires IPC events to stores**

```typescript
// src/renderer/hooks/useIPC.ts
import { useEffect } from 'react'
import { useConversationStore } from '../stores/conversation'
import { useAgentStore } from '../stores/agent'

export function useIPC() {
  const appendToken = useConversationStore(s => s.appendToken)
  const addMessage = useConversationStore(s => s.addMessage)
  const activeConversationId = useConversationStore(s => s.activeConversationId)

  const setLlamaStatus = useAgentStore(s => s.setLlamaStatus)
  const setProcessing = useAgentStore(s => s.setProcessing)
  const addToolCall = useAgentStore(s => s.addToolCall)
  const completeToolCall = useAgentStore(s => s.completeToolCall)
  const addArtifact = useAgentStore(s => s.addArtifact)
  const clearToolCalls = useAgentStore(s => s.clearToolCalls)

  useEffect(() => {
    const unsubToken = window.folk.onToken((data) => {
      if (data.conversationId === activeConversationId) {
        appendToken(data.token)
      }
    })

    const unsubComplete = window.folk.onAgentComplete((data) => {
      if (data.conversationId === activeConversationId) {
        addMessage(data.message)
        setProcessing(false)
      }
    })

    const unsubError = window.folk.onAgentError((data) => {
      if (data.conversationId === activeConversationId) {
        setProcessing(false)
      }
    })

    const unsubToolStart = window.folk.onToolStart((data) => {
      if (data.conversationId === activeConversationId) {
        addToolCall(data.toolCall)
      }
    })

    const unsubToolResult = window.folk.onToolResult((data) => {
      if (data.conversationId === activeConversationId) {
        completeToolCall(data.toolCall)
      }
    })

    const unsubArtifact = window.folk.onArtifact((data) => {
      if (data.conversationId === activeConversationId) {
        addArtifact(data.artifact)
      }
    })

    const unsubLlama = window.folk.onLlamaStatusChange((status) => {
      setLlamaStatus(status)
    })

    return () => {
      unsubToken()
      unsubComplete()
      unsubError()
      unsubToolStart()
      unsubToolResult()
      unsubArtifact()
      unsubLlama()
    }
  }, [activeConversationId])
}
```

**Step 2: Wire hook into App.tsx**

Add `useIPC()` call inside the App component:

```tsx
// In App.tsx, add:
import { useIPC } from './hooks/useIPC'

// Inside the component:
useIPC()
```

**Step 3: Commit**

```bash
git add src/renderer/hooks/useIPC.ts src/renderer/App.tsx
git commit -m "feat: wire IPC events to Zustand stores via useIPC hook"
```

---

### Task 18: Implement TitleBar component

**Files:**
- Create: `src/renderer/components/TitleBar.tsx`

**Step 1: Create custom frameless titlebar**

```tsx
// src/renderer/components/TitleBar.tsx
import { Minus, Square, X } from 'lucide-react'

export function TitleBar() {
  return (
    <div className="flex items-center h-10 bg-pure-black border-b border-border-mist-06 select-none"
         style={{ WebkitAppRegion: 'drag' } as any}>
      {/* macOS traffic lights space */}
      <div className="w-20 flex-shrink-0" />

      {/* Center: app name */}
      <div className="flex-1 text-center">
        <span className="text-sm font-medium text-text-secondary tracking-wide">Folk</span>
      </div>

      {/* Windows controls (hidden on macOS) */}
      <div className="flex-shrink-0 hidden"
           style={{ WebkitAppRegion: 'no-drag' } as any}>
        <button className="h-10 w-12 flex items-center justify-center hover:bg-surface-hover text-text-secondary hover:text-text-primary transition-colors">
          <Minus size={14} />
        </button>
        <button className="h-10 w-12 flex items-center justify-center hover:bg-surface-hover text-text-secondary hover:text-text-primary transition-colors">
          <Square size={12} />
        </button>
        <button className="h-10 w-12 flex items-center justify-center hover:bg-error/80 text-text-secondary hover:text-white transition-colors">
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add src/renderer/components/TitleBar.tsx
git commit -m "feat: implement custom frameless TitleBar component"
```

---

### Task 19: Implement Sidebar components

**Files:**
- Create: `src/renderer/components/Sidebar/Sidebar.tsx`
- Create: `src/renderer/components/Sidebar/SearchInput.tsx`
- Create: `src/renderer/components/Sidebar/ConversationList.tsx`
- Create: `src/renderer/components/Sidebar/ConversationItem.tsx`

**Step 1: SearchInput**

```tsx
// src/renderer/components/Sidebar/SearchInput.tsx
import { Search } from 'lucide-react'

interface SearchInputProps {
  value: string
  onChange: (value: string) => void
}

export function SearchInput({ value, onChange }: SearchInputProps) {
  return (
    <div className="relative px-3 pt-3 pb-2">
      <Search size={14} className="absolute left-6 top-1/2 -translate-y-1/2 text-text-tertiary" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search conversations..."
        className="w-full bg-transparent border border-border-mist-10 rounded-default py-1.5 pl-8 pr-3 text-sm text-text-primary placeholder:text-text-tertiary focus:border-signal-blue focus:outline-none transition-colors"
      />
    </div>
  )
}
```

**Step 2: ConversationItem**

```tsx
// src/renderer/components/Sidebar/ConversationItem.tsx
import { Trash2 } from 'lucide-react'
import type { Conversation } from '../../../shared/types'

interface ConversationItemProps {
  conversation: Conversation
  isActive: boolean
  onClick: () => void
  onDelete: () => void
}

export function ConversationItem({ conversation, isActive, onClick, onDelete }: ConversationItemProps) {
  const timeAgo = formatTimeAgo(conversation.updatedAt)

  return (
    <div
      onClick={onClick}
      className={`group flex items-center px-3 py-2.5 cursor-pointer transition-colors border-l-2 ${
        isActive
          ? 'border-l-electric-cyan bg-surface-elevated'
          : 'border-l-transparent hover:bg-surface-hover'
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm text-text-primary truncate">{conversation.title}</div>
        <div className="text-xs text-text-muted mt-0.5">{timeAgo}</div>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete() }}
        className="opacity-0 group-hover:opacity-100 p-1 text-text-muted hover:text-error transition-all"
      >
        <Trash2 size={14} />
      </button>
    </div>
  )
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}
```

**Step 3: ConversationList**

```tsx
// src/renderer/components/Sidebar/ConversationList.tsx
import { ConversationItem } from './ConversationItem'
import { useConversationStore } from '../../stores/conversation'

interface ConversationListProps {
  searchQuery: string
}

export function ConversationList({ searchQuery }: ConversationListProps) {
  const conversations = useConversationStore(s => s.conversations)
  const activeId = useConversationStore(s => s.activeConversationId)
  const setActive = useConversationStore(s => s.setActiveConversation)
  const deleteConv = useConversationStore(s => s.deleteConversation)

  const filtered = searchQuery
    ? conversations.filter(c => c.title.toLowerCase().includes(searchQuery.toLowerCase()))
    : conversations

  return (
    <div className="flex-1 overflow-y-auto">
      {filtered.map(conv => (
        <ConversationItem
          key={conv.id}
          conversation={conv}
          isActive={conv.id === activeId}
          onClick={() => setActive(conv.id)}
          onDelete={() => deleteConv(conv.id)}
        />
      ))}
    </div>
  )
}
```

**Step 4: Sidebar**

```tsx
// src/renderer/components/Sidebar/Sidebar.tsx
import { useState } from 'react'
import { Plus, Settings } from 'lucide-react'
import { SearchInput } from './SearchInput'
import { ConversationList } from './ConversationList'
import { useConversationStore } from '../../stores/conversation'
import { useUIStore } from '../../stores/ui'

export function Sidebar() {
  const [searchQuery, setSearchQuery] = useState('')
  const createConversation = useConversationStore(s => s.createConversation)
  const toggleSettings = useUIStore(s => s.toggleSettings)

  return (
    <div className="w-[260px] flex-shrink-0 flex flex-col bg-pure-black border-r border-border-mist-08">
      <SearchInput value={searchQuery} onChange={setSearchQuery} />
      <ConversationList searchQuery={searchQuery} />
      <div className="p-3 border-t border-border-mist-06 flex gap-2">
        <button
          onClick={() => createConversation()}
          className="flex-1 flex items-center justify-center gap-2 py-2 text-sm text-text-secondary border border-border-mist-10 rounded-default hover:bg-surface-hover hover:text-text-primary transition-colors"
        >
          <Plus size={16} />
          New Chat
        </button>
        <button
          onClick={toggleSettings}
          className="p-2 text-text-secondary border border-border-mist-10 rounded-default hover:bg-surface-hover hover:text-text-primary transition-colors"
        >
          <Settings size={16} />
        </button>
      </div>
    </div>
  )
}
```

**Step 5: Commit**

```bash
git add src/renderer/components/Sidebar/
git commit -m "feat: implement Sidebar with search, conversation list, and new chat button"
```

---

### Task 20: Implement ChatPanel components

**Files:**
- Create: `src/renderer/components/ChatPanel/ChatPanel.tsx`
- Create: `src/renderer/components/ChatPanel/ChatInput.tsx`
- Create: `src/renderer/components/ChatPanel/MessageList.tsx`
- Create: `src/renderer/components/ChatPanel/UserMessage.tsx`
- Create: `src/renderer/components/ChatPanel/AssistantMessage.tsx`
- Create: `src/renderer/components/ChatPanel/MarkdownRenderer.tsx`
- Create: `src/renderer/components/ChatPanel/CodeBlock.tsx`
- Create: `src/renderer/components/EmptyState.tsx`

**Step 1: ChatInput**

```tsx
// src/renderer/components/ChatPanel/ChatInput.tsx
import { useState, useRef, useCallback } from 'react'
import { Send, Paperclip } from 'lucide-react'
import { useConversationStore } from '../../stores/conversation'
import { useAgentStore } from '../../stores/agent'

export function ChatInput() {
  const [text, setText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const sendMessage = useConversationStore(s => s.sendMessage)
  const isProcessing = useAgentStore(s => s.isProcessing)
  const setProcessing = useAgentStore(s => s.setProcessing)

  const handleSend = useCallback(() => {
    const trimmed = text.trim()
    if (!trimmed || isProcessing) return
    setProcessing(true)
    sendMessage(trimmed)
    setText('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [text, isProcessing, sendMessage, setProcessing])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value)
    // Auto-resize
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
  }

  return (
    <div className="border-t border-border-mist-10 p-4">
      <div className="flex items-end gap-3">
        <button className="p-2 text-text-tertiary hover:text-text-primary transition-colors flex-shrink-0">
          <Paperclip size={18} />
        </button>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Ask Folk anything..."
          rows={1}
          className="flex-1 bg-transparent resize-none text-[15px] text-text-primary placeholder:text-text-tertiary focus:outline-none leading-relaxed"
          style={{ maxHeight: 200 }}
        />
        <button
          onClick={handleSend}
          disabled={!text.trim() || isProcessing}
          className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full bg-cyan-glow-12 text-text-primary disabled:opacity-30 disabled:cursor-not-allowed hover:bg-electric-cyan/20 transition-colors"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  )
}
```

**Step 2: CodeBlock**

```tsx
// src/renderer/components/ChatPanel/CodeBlock.tsx
import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

interface CodeBlockProps {
  code: string
  language?: string
}

export function CodeBlock({ code, language }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="relative group my-3 rounded-default border border-border-mist-10 bg-pure-black overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border-mist-06">
        <span className="text-xs font-mono text-text-muted">{language || 'text'}</span>
        <button
          onClick={handleCopy}
          className="opacity-0 group-hover:opacity-100 p-1 text-text-tertiary hover:text-text-primary transition-all"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>
      <pre className="p-3 overflow-x-auto">
        <code className="text-sm font-mono leading-relaxed text-text-secondary">{code}</code>
      </pre>
    </div>
  )
}
```

**Step 3: MarkdownRenderer**

```tsx
// src/renderer/components/ChatPanel/MarkdownRenderer.tsx
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CodeBlock } from './CodeBlock'

interface MarkdownRendererProps {
  content: string
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '')
          const isInline = !match
          if (isInline) {
            return (
              <code className="px-1.5 py-0.5 bg-surface-elevated rounded-sharp font-mono text-sm text-electric-cyan" {...props}>
                {children}
              </code>
            )
          }
          return <CodeBlock code={String(children).replace(/\n$/, '')} language={match[1]} />
        },
        p({ children }) {
          return <p className="mb-3 leading-relaxed">{children}</p>
        },
        ul({ children }) {
          return <ul className="mb-3 ml-4 list-disc space-y-1">{children}</ul>
        },
        ol({ children }) {
          return <ol className="mb-3 ml-4 list-decimal space-y-1">{children}</ol>
        },
        h1({ children }) {
          return <h1 className="text-xl font-medium mb-3 mt-4">{children}</h1>
        },
        h2({ children }) {
          return <h2 className="text-lg font-medium mb-2 mt-3">{children}</h2>
        },
        h3({ children }) {
          return <h3 className="text-base font-medium mb-2 mt-3">{children}</h3>
        },
        a({ href, children }) {
          return <a href={href} className="text-signal-blue hover:underline">{children}</a>
        },
        blockquote({ children }) {
          return <blockquote className="border-l-2 border-border-mist-12 pl-3 my-3 text-text-secondary">{children}</blockquote>
        },
        table({ children }) {
          return <div className="overflow-x-auto my-3"><table className="w-full text-sm border border-border-mist-08">{children}</table></div>
        },
        th({ children }) {
          return <th className="px-3 py-2 text-left border-b border-border-mist-08 text-text-secondary font-medium">{children}</th>
        },
        td({ children }) {
          return <td className="px-3 py-2 border-b border-border-mist-06">{children}</td>
        },
      }}
    >
      {content}
    </ReactMarkdown>
  )
}
```

**Step 4: UserMessage and AssistantMessage**

```tsx
// src/renderer/components/ChatPanel/UserMessage.tsx
import type { Message } from '../../../shared/types'

interface UserMessageProps {
  message: Message
}

export function UserMessage({ message }: UserMessageProps) {
  const text = message.content
    .filter(b => b.type === 'text')
    .map(b => (b as { type: 'text'; text: string }).text)
    .join('')

  return (
    <div className="flex justify-end mb-4">
      <div className="max-w-[70%] bg-surface-bubble rounded-default px-4 py-3">
        <p className="text-[15px] text-text-primary whitespace-pre-wrap">{text}</p>
      </div>
    </div>
  )
}
```

```tsx
// src/renderer/components/ChatPanel/AssistantMessage.tsx
import { MarkdownRenderer } from './MarkdownRenderer'
import type { Message } from '../../../shared/types'

interface AssistantMessageProps {
  message: Message
}

export function AssistantMessage({ message }: AssistantMessageProps) {
  const text = message.content
    .filter(b => b.type === 'text')
    .map(b => (b as { type: 'text'; text: string }).text)
    .join('')

  return (
    <div className="mb-4 max-w-[85%]">
      <div className="text-[15px] text-text-secondary">
        <MarkdownRenderer content={text} />
      </div>
    </div>
  )
}
```

**Step 5: MessageList**

```tsx
// src/renderer/components/ChatPanel/MessageList.tsx
import { useEffect, useRef } from 'react'
import { UserMessage } from './UserMessage'
import { AssistantMessage } from './AssistantMessage'
import { MarkdownRenderer } from './MarkdownRenderer'
import { useConversationStore } from '../../stores/conversation'

export function MessageList() {
  const messages = useConversationStore(s => s.messages)
  const streamingText = useConversationStore(s => s.streamingText)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

  return (
    <div className="flex-1 overflow-y-auto px-6 py-4">
      {messages
        .filter(m => m.role !== 'system' && m.content.some(b => b.type === 'text'))
        .map(msg => (
          msg.role === 'user'
            ? <UserMessage key={msg.id} message={msg} />
            : <AssistantMessage key={msg.id} message={msg} />
        ))}

      {streamingText && (
        <div className="mb-4 max-w-[85%]">
          <div className="text-[15px] text-text-secondary">
            <MarkdownRenderer content={streamingText} />
            <span className="inline-block w-0.5 h-5 bg-electric-cyan animate-pulse ml-0.5" />
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  )
}
```

**Step 6: EmptyState**

```tsx
// src/renderer/components/EmptyState.tsx
import { FileText, Mail, Search, Code } from 'lucide-react'
import { useConversationStore } from '../stores/conversation'

const suggestions = [
  { icon: FileText, label: 'Organize my files' },
  { icon: Mail, label: 'Draft an email' },
  { icon: Search, label: 'Analyze this document' },
  { icon: Code, label: 'Help me write code' },
]

export function EmptyState() {
  const sendMessage = useConversationStore(s => s.sendMessage)

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-8">
      <h1 className="text-3xl font-semibold text-text-primary mb-2 tracking-tight" style={{ lineHeight: 0.87 }}>
        Folk
      </h1>
      <p className="text-lg text-text-secondary mb-8">What can I help you with?</p>
      <div className="grid grid-cols-2 gap-3 max-w-md w-full">
        {suggestions.map(({ icon: Icon, label }) => (
          <button
            key={label}
            onClick={() => sendMessage(label)}
            className="flex items-center gap-3 p-4 bg-pure-black border border-border-mist-10 rounded-default text-left text-sm text-text-secondary hover:border-border-mist-12 hover:bg-surface-hover transition-colors group"
          >
            <Icon size={18} className="text-text-muted group-hover:text-electric-cyan transition-colors flex-shrink-0" />
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
```

**Step 7: ChatPanel**

```tsx
// src/renderer/components/ChatPanel/ChatPanel.tsx
import { MessageList } from './MessageList'
import { ChatInput } from './ChatInput'
import { EmptyState } from '../EmptyState'
import { useConversationStore } from '../../stores/conversation'

export function ChatPanel() {
  const activeId = useConversationStore(s => s.activeConversationId)
  const messages = useConversationStore(s => s.messages)

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-void-black relative">
      {/* Geometric background overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            radial-gradient(ellipse at 30% 20%, rgba(0, 255, 255, 0.03) 0%, transparent 50%),
            radial-gradient(ellipse at 70% 80%, rgba(0, 7, 205, 0.05) 0%, transparent 50%)
          `,
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)
          `,
          backgroundSize: '80px 80px',
          maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 70%)',
          WebkitMaskImage: 'radial-gradient(ellipse at center, black 30%, transparent 70%)',
        }}
      />

      {/* Content */}
      <div className="relative z-10 flex flex-col flex-1 min-h-0">
        {!activeId || messages.length === 0 ? (
          <EmptyState />
        ) : (
          <MessageList />
        )}
        <ChatInput />
      </div>
    </div>
  )
}
```

**Step 8: Commit**

```bash
git add src/renderer/components/ChatPanel/ src/renderer/components/EmptyState.tsx
git commit -m "feat: implement ChatPanel with messages, markdown rendering, code blocks, and empty state"
```

**Checkpoint**: User Story 1 (MVP Chat) complete. App should show sidebar + chat panel + geometric background. Messages stream in real-time.

---

## Phase 4: User Story 2 — Artifact Panel & Activity Log (P2)

**Goal**: Tool calls show in collapsible activity log. Files created by agent appear in artifact panel.

---

### Task 21: Implement ArtifactPanel

**Files:**
- Create: `src/renderer/components/ArtifactPanel/ArtifactPanel.tsx`
- Create: `src/renderer/components/ArtifactPanel/ArtifactTabs.tsx`
- Create: `src/renderer/components/ArtifactPanel/CodeViewer.tsx`
- Create: `src/renderer/components/ArtifactPanel/MarkdownViewer.tsx`
- Create: `src/renderer/components/ArtifactPanel/ImageViewer.tsx`

**Step 1: ArtifactTabs**

```tsx
// src/renderer/components/ArtifactPanel/ArtifactTabs.tsx
import type { Artifact } from '../../../shared/types'

interface ArtifactTabsProps {
  artifacts: Artifact[]
  activeIndex: number
  onSelect: (index: number) => void
}

export function ArtifactTabs({ artifacts, activeIndex, onSelect }: ArtifactTabsProps) {
  return (
    <div className="flex border-b border-border-mist-06 overflow-x-auto">
      {artifacts.map((artifact, i) => (
        <button
          key={artifact.id}
          onClick={() => onSelect(i)}
          className={`px-3 py-2 text-xs whitespace-nowrap transition-colors border-b-2 ${
            i === activeIndex
              ? 'text-text-primary border-electric-cyan'
              : 'text-text-tertiary border-transparent hover:text-text-secondary'
          }`}
        >
          {artifact.title}
        </button>
      ))}
    </div>
  )
}
```

**Step 2: CodeViewer**

```tsx
// src/renderer/components/ArtifactPanel/CodeViewer.tsx
import { Copy, Check } from 'lucide-react'
import { useState } from 'react'

interface CodeViewerProps {
  code: string
  language?: string
}

export function CodeViewer({ code, language }: CodeViewerProps) {
  const [copied, setCopied] = useState(false)
  const lines = code.split('\n')

  const handleCopy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="flex justify-between items-center px-4 py-2 border-b border-border-mist-06">
        <span className="text-xs font-mono text-text-muted">{language || 'plaintext'}</span>
        <button onClick={handleCopy} className="p-1 text-text-tertiary hover:text-text-primary">
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>
      <pre className="p-4 text-sm font-mono leading-relaxed">
        {lines.map((line, i) => (
          <div key={i} className="flex">
            <span className="w-10 text-right pr-4 text-text-muted select-none flex-shrink-0">{i + 1}</span>
            <span className="text-text-secondary">{line}</span>
          </div>
        ))}
      </pre>
    </div>
  )
}
```

**Step 3: MarkdownViewer and ImageViewer**

```tsx
// src/renderer/components/ArtifactPanel/MarkdownViewer.tsx
import { MarkdownRenderer } from '../ChatPanel/MarkdownRenderer'

interface MarkdownViewerProps {
  content: string
}

export function MarkdownViewer({ content }: MarkdownViewerProps) {
  return (
    <div className="flex-1 overflow-auto p-6 text-[15px] text-text-secondary">
      <MarkdownRenderer content={content} />
    </div>
  )
}
```

```tsx
// src/renderer/components/ArtifactPanel/ImageViewer.tsx
interface ImageViewerProps {
  src: string
  alt?: string
}

export function ImageViewer({ src, alt }: ImageViewerProps) {
  return (
    <div className="flex-1 flex items-center justify-center p-6 overflow-auto">
      <img src={src} alt={alt || 'artifact'} className="max-w-full max-h-full object-contain rounded-default" />
    </div>
  )
}
```

**Step 4: ArtifactPanel**

```tsx
// src/renderer/components/ArtifactPanel/ArtifactPanel.tsx
import { useState } from 'react'
import { X, Download, ExternalLink } from 'lucide-react'
import { ArtifactTabs } from './ArtifactTabs'
import { CodeViewer } from './CodeViewer'
import { MarkdownViewer } from './MarkdownViewer'
import { ImageViewer } from './ImageViewer'
import { useAgentStore } from '../../stores/agent'
import { useUIStore } from '../../stores/ui'

export function ArtifactPanel() {
  const [activeIndex, setActiveIndex] = useState(0)
  const artifacts = useAgentStore(s => s.artifacts)
  const togglePanel = useUIStore(s => s.toggleArtifactPanel)

  const activeArtifact = artifacts[activeIndex]

  return (
    <div className="w-[400px] flex-shrink-0 flex flex-col bg-pure-black border-l border-border-mist-08">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-mist-06">
        <span className="text-sm font-medium text-text-secondary">Artifacts</span>
        <button onClick={togglePanel} className="p-1 text-text-tertiary hover:text-text-primary">
          <X size={16} />
        </button>
      </div>

      {artifacts.length === 0 ? (
        <div className="flex-1 flex items-center justify-center px-8">
          <p className="text-sm text-text-muted text-center">
            Artifacts will appear here when Folk creates or modifies files
          </p>
        </div>
      ) : (
        <>
          <ArtifactTabs artifacts={artifacts} activeIndex={activeIndex} onSelect={setActiveIndex} />
          {activeArtifact && (
            <>
              {activeArtifact.type === 'code' || activeArtifact.type === 'file'
                ? <CodeViewer code={activeArtifact.content || ''} language={activeArtifact.language || undefined} />
                : activeArtifact.type === 'markdown'
                ? <MarkdownViewer content={activeArtifact.content || ''} />
                : activeArtifact.type === 'image'
                ? <ImageViewer src={activeArtifact.filePath || ''} />
                : null
              }
              {/* Actions */}
              <div className="flex gap-2 p-3 border-t border-border-mist-06">
                <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-text-tertiary border border-border-mist-10 rounded-default hover:text-text-primary hover:bg-surface-hover transition-colors">
                  <Download size={12} /> Save
                </button>
                <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-text-tertiary border border-border-mist-10 rounded-default hover:text-text-primary hover:bg-surface-hover transition-colors">
                  <ExternalLink size={12} /> Open
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
```

**Step 5: Commit**

```bash
git add src/renderer/components/ArtifactPanel/
git commit -m "feat: implement ArtifactPanel with code viewer, markdown viewer, and tabs"
```

---

### Task 22: Implement ActivityLog

**Files:**
- Create: `src/renderer/components/ActivityLog/ActivityLog.tsx`
- Create: `src/renderer/components/ActivityLog/ToolCallEntry.tsx`

**Step 1: ToolCallEntry**

```tsx
// src/renderer/components/ActivityLog/ToolCallEntry.tsx
import { useState } from 'react'
import { ChevronDown, ChevronRight, Wrench, Check, AlertCircle, Loader2 } from 'lucide-react'
import type { ToolCallStart, ToolCallResult } from '../../../shared/types'

interface ToolCallEntryProps {
  toolCall: ToolCallStart & { result?: ToolCallResult }
}

export function ToolCallEntry({ toolCall }: ToolCallEntryProps) {
  const [expanded, setExpanded] = useState(false)
  const status = toolCall.result?.status
  const isRunning = !toolCall.result

  return (
    <div className="border-b border-border-mist-04 last:border-b-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-mono hover:bg-surface-hover transition-colors"
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {isRunning ? (
          <Loader2 size={12} className="text-electric-cyan animate-spin" />
        ) : status === 'success' ? (
          <Check size={12} className="text-text-primary" />
        ) : (
          <AlertCircle size={12} className="text-error" />
        )}
        <Wrench size={12} className="text-text-muted" />
        <span className="text-text-secondary">{toolCall.toolName}</span>
        {toolCall.result?.durationMs !== undefined && (
          <span className="ml-auto text-text-muted">{toolCall.result.durationMs}ms</span>
        )}
      </button>
      {expanded && (
        <div className="px-3 pb-2 text-xs font-mono">
          <div className="mb-1 text-text-muted">Input:</div>
          <pre className="bg-pure-black p-2 rounded-sharp text-text-tertiary overflow-x-auto mb-2">
            {JSON.stringify(toolCall.input, null, 2)}
          </pre>
          {toolCall.result && (
            <>
              <div className="mb-1 text-text-muted">Output:</div>
              <pre className="bg-pure-black p-2 rounded-sharp text-text-tertiary overflow-x-auto">
                {JSON.stringify(toolCall.result.output, null, 2)}
              </pre>
            </>
          )}
        </div>
      )}
    </div>
  )
}
```

**Step 2: ActivityLog**

```tsx
// src/renderer/components/ActivityLog/ActivityLog.tsx
import { useState } from 'react'
import { ChevronDown, ChevronRight, Wrench } from 'lucide-react'
import { ToolCallEntry } from './ToolCallEntry'
import { useAgentStore } from '../../stores/agent'

export function ActivityLog() {
  const [expanded, setExpanded] = useState(false)
  const toolCalls = useAgentStore(s => s.toolCalls)

  if (toolCalls.length === 0) return null

  const runningCount = toolCalls.filter(tc => !tc.result).length

  return (
    <div className="border-t border-border-mist-06 bg-pure-black/50">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-4 py-2 text-xs font-mono text-text-secondary hover:text-text-primary transition-colors"
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <Wrench size={12} />
        <span>{toolCalls.length} tool call{toolCalls.length !== 1 ? 's' : ''}</span>
        {runningCount > 0 && (
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-electric-cyan animate-pulse" />
            {runningCount} running
          </span>
        )}
      </button>
      {expanded && (
        <div className="max-h-60 overflow-y-auto border-t border-border-mist-04">
          {toolCalls.map(tc => (
            <ToolCallEntry key={tc.id} toolCall={tc} />
          ))}
        </div>
      )}
    </div>
  )
}
```

**Step 3: Add ActivityLog to ChatPanel**

In `src/renderer/components/ChatPanel/ChatPanel.tsx`, add `<ActivityLog />` between `<MessageList />` and `<ChatInput />`:

```tsx
import { ActivityLog } from '../ActivityLog/ActivityLog'

// In the JSX, between MessageList and ChatInput:
<ActivityLog />
```

**Step 4: Commit**

```bash
git add src/renderer/components/ActivityLog/ src/renderer/components/ChatPanel/ChatPanel.tsx
git commit -m "feat: implement ActivityLog with collapsible tool call entries"
```

**Checkpoint**: User Story 2 complete. Tool calls show in activity log, artifacts display in side panel.

---

## Phase 5: User Story 3 — Settings & Onboarding (P3)

**Goal**: First-launch onboarding wizard (welcome → model download → workspace). Full settings drawer.

---

### Task 23: Implement OnboardingWizard

**Files:**
- Create: `src/renderer/components/Onboarding/OnboardingWizard.tsx`
- Create: `src/renderer/components/Onboarding/WelcomeStep.tsx`
- Create: `src/renderer/components/Onboarding/ModelDownloadStep.tsx`
- Create: `src/renderer/components/Onboarding/WorkspaceStep.tsx`

**Step 1: WelcomeStep**

```tsx
// src/renderer/components/Onboarding/WelcomeStep.tsx
interface WelcomeStepProps {
  onNext: () => void
}

export function WelcomeStep({ onNext }: WelcomeStepProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center">
      <h1 className="text-5xl font-semibold text-text-primary mb-3" style={{ lineHeight: 0.87 }}>
        Folk
      </h1>
      <p className="text-lg text-text-secondary mb-10">Your AI assistant. Entirely local.</p>
      <button
        onClick={onNext}
        className="px-8 py-3 bg-white text-black text-sm font-medium rounded-default hover:bg-white/90 transition-colors"
      >
        Get Started
      </button>
    </div>
  )
}
```

**Step 2: ModelDownloadStep**

```tsx
// src/renderer/components/Onboarding/ModelDownloadStep.tsx
import { useEffect, useState } from 'react'
import type { DownloadProgress } from '../../../shared/types'

interface ModelDownloadStepProps {
  onNext: () => void
  onSkip: () => void
}

export function ModelDownloadStep({ onNext, onSkip }: ModelDownloadStepProps) {
  const [progress, setProgress] = useState<DownloadProgress | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const unsub = window.folk.onDownloadProgress(setProgress)
    return unsub
  }, [])

  const startDownload = async () => {
    setDownloading(true)
    setError(null)
    try {
      await window.folk.downloadModel('https://huggingface.co/google/gemma-4-e4b-it-gguf/resolve/main/gemma-4-e4b-it-Q4_K_M.gguf')
      onNext()
    } catch (err: any) {
      setError(err.message)
      setDownloading(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center text-center max-w-md">
      <h2 className="text-2xl font-medium text-text-primary mb-2" style={{ lineHeight: 1 }}>
        Download your AI model
      </h2>
      <p className="text-sm text-text-secondary mb-8">
        Gemma 4 E4B — ~1.5 GB. This only happens once.
      </p>

      {!downloading ? (
        <button
          onClick={startDownload}
          className="px-8 py-3 bg-white text-black text-sm font-medium rounded-default hover:bg-white/90 transition-colors mb-4"
        >
          Download Model
        </button>
      ) : (
        <div className="w-full mb-4">
          {/* Progress bar */}
          <div className="h-2 bg-border-mist-08 rounded-full overflow-hidden mb-3">
            <div
              className="h-full bg-electric-cyan transition-all duration-300"
              style={{ width: `${progress?.percent || 0}%` }}
            />
          </div>
          <div className="flex justify-between text-xs font-mono text-text-muted">
            <span>{progress?.percent || 0}%</span>
            <span>{progress?.speed || '...'}</span>
            <span>ETA: {progress?.eta || '...'}</span>
          </div>
        </div>
      )}

      {error && (
        <p className="text-sm text-error mb-4">{error}</p>
      )}

      <button
        onClick={onSkip}
        className="text-sm text-text-tertiary hover:text-text-secondary transition-colors"
      >
        Skip — I'll configure my own model later
      </button>
    </div>
  )
}
```

**Step 3: WorkspaceStep**

```tsx
// src/renderer/components/Onboarding/WorkspaceStep.tsx
import { useState } from 'react'
import { Folder } from 'lucide-react'

interface WorkspaceStepProps {
  onComplete: () => void
}

export function WorkspaceStep({ onComplete }: WorkspaceStepProps) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null)

  const selectFolder = async () => {
    const path = await window.folk.selectWorkspace()
    if (path) setSelectedPath(path)
  }

  return (
    <div className="flex flex-col items-center justify-center text-center max-w-md">
      <h2 className="text-2xl font-medium text-text-primary mb-2" style={{ lineHeight: 1 }}>
        Choose a workspace folder
      </h2>
      <p className="text-sm text-text-secondary mb-8">
        Folk can read and write files in this folder. You can change it anytime.
      </p>

      <button
        onClick={selectFolder}
        className="flex items-center gap-3 px-6 py-3 border border-border-mist-10 rounded-default text-sm text-text-secondary hover:bg-surface-hover transition-colors mb-4"
      >
        <Folder size={18} />
        {selectedPath ? 'Change folder' : 'Select folder'}
      </button>

      {selectedPath && (
        <p className="font-mono text-xs text-text-muted mb-6 break-all">{selectedPath}</p>
      )}

      <button
        onClick={onComplete}
        disabled={!selectedPath}
        className="px-8 py-3 bg-white text-black text-sm font-medium rounded-default hover:bg-white/90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      >
        Start using Folk
      </button>
    </div>
  )
}
```

**Step 4: OnboardingWizard**

```tsx
// src/renderer/components/Onboarding/OnboardingWizard.tsx
import { useState } from 'react'
import { WelcomeStep } from './WelcomeStep'
import { ModelDownloadStep } from './ModelDownloadStep'
import { WorkspaceStep } from './WorkspaceStep'

interface OnboardingWizardProps {
  onComplete: () => void
}

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const [step, setStep] = useState(0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-void-black">
      {/* Geometric background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            radial-gradient(ellipse at 30% 20%, rgba(0, 255, 255, 0.03) 0%, transparent 50%),
            radial-gradient(ellipse at 70% 80%, rgba(0, 7, 205, 0.05) 0%, transparent 50%)
          `,
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)
          `,
          backgroundSize: '80px 80px',
          maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 70%)',
          WebkitMaskImage: 'radial-gradient(ellipse at center, black 30%, transparent 70%)',
        }}
      />

      {/* Step indicator */}
      <div className="absolute top-8 flex gap-2">
        {[0, 1, 2].map(i => (
          <div
            key={i}
            className={`w-8 h-1 rounded-full transition-colors ${
              i <= step ? 'bg-electric-cyan' : 'bg-border-mist-10'
            }`}
          />
        ))}
      </div>

      {/* Content */}
      <div className="relative z-10">
        {step === 0 && <WelcomeStep onNext={() => setStep(1)} />}
        {step === 1 && <ModelDownloadStep onNext={() => setStep(2)} onSkip={() => setStep(2)} />}
        {step === 2 && <WorkspaceStep onComplete={onComplete} />}
      </div>
    </div>
  )
}
```

**Step 5: Wire into App.tsx**

Add onboarding state management to App.tsx — show wizard if no workspace is configured.

**Step 6: Commit**

```bash
git add src/renderer/components/Onboarding/
git commit -m "feat: implement 3-step OnboardingWizard (welcome, model download, workspace)"
```

---

### Task 24: Implement SettingsDrawer

**Files:**
- Create: `src/renderer/components/SettingsDrawer/SettingsDrawer.tsx`
- Create: `src/renderer/components/SettingsDrawer/ModelSettings.tsx`
- Create: `src/renderer/components/SettingsDrawer/MCPSettings.tsx`
- Create: `src/renderer/components/SettingsDrawer/WorkspaceSettings.tsx`
- Create: `src/renderer/components/SettingsDrawer/AppearanceSettings.tsx`
- Create: `src/renderer/components/SettingsDrawer/AboutSection.tsx`

**Step 1: ModelSettings**

```tsx
// src/renderer/components/SettingsDrawer/ModelSettings.tsx
import { useState, useEffect } from 'react'
import { Upload, Download } from 'lucide-react'
import type { ModelInfo } from '../../../shared/types'

export function ModelSettings() {
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null)

  useEffect(() => {
    window.folk.getModelInfo().then(setModelInfo)
  }, [])

  const changeModel = async () => {
    const paths = await window.folk.openFileDialog({
      filters: [{ name: 'GGUF Models', extensions: ['gguf'] }],
    })
    if (paths.length > 0) {
      await window.folk.changeModel(paths[0])
      const info = await window.folk.getModelInfo()
      setModelInfo(info)
    }
  }

  return (
    <div className="space-y-6">
      <h3 className="text-base font-medium text-text-primary">Model</h3>

      {modelInfo ? (
        <div className="bg-pure-black border border-border-mist-08 rounded-default p-4">
          <div className="font-mono text-sm text-text-secondary">{modelInfo.name}</div>
          <div className="font-mono text-xs text-text-muted mt-1">
            {(modelInfo.sizeBytes / (1024 * 1024 * 1024)).toFixed(1)} GB | {modelInfo.quantization} | ctx: {modelInfo.contextSize}
          </div>
        </div>
      ) : (
        <p className="text-sm text-text-muted">No model loaded</p>
      )}

      <div className="flex gap-3">
        <button onClick={changeModel} className="flex items-center gap-2 px-4 py-2 text-sm border border-border-mist-10 rounded-default text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors">
          <Upload size={14} /> Change Model
        </button>
        <button className="flex items-center gap-2 px-4 py-2 text-sm border border-border-mist-10 rounded-default text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors">
          <Download size={14} /> Download Models
        </button>
      </div>
    </div>
  )
}
```

**Step 2: MCPSettings**

```tsx
// src/renderer/components/SettingsDrawer/MCPSettings.tsx
import { useState, useEffect } from 'react'
import { Plus, Trash2, Zap, ZapOff } from 'lucide-react'
import type { MCPServer } from '../../../shared/types'

export function MCPSettings() {
  const [servers, setServers] = useState<MCPServer[]>([])

  useEffect(() => {
    window.folk.listMCPServers().then(setServers)
  }, [])

  const removeServer = async (id: string) => {
    await window.folk.removeMCPServer(id)
    setServers(s => s.filter(srv => srv.id !== id))
  }

  return (
    <div className="space-y-6">
      <h3 className="text-base font-medium text-text-primary">MCP Servers</h3>

      {servers.length === 0 ? (
        <p className="text-sm text-text-muted">No MCP servers configured</p>
      ) : (
        <div className="space-y-2">
          {servers.map(server => (
            <div key={server.id} className="flex items-center gap-3 bg-pure-black border border-border-mist-08 rounded-default p-3">
              <span className={`w-2 h-2 rounded-full ${server.enabled ? 'bg-success' : 'bg-text-muted'}`} />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-text-primary truncate">{server.name}</div>
                <div className="text-xs font-mono text-text-muted">{server.transport}</div>
              </div>
              <button onClick={() => removeServer(server.id)} className="p-1 text-text-muted hover:text-error transition-colors">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <button className="flex items-center gap-2 px-4 py-2 text-sm border border-border-mist-10 rounded-default text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors">
        <Plus size={14} /> Add Server
      </button>
    </div>
  )
}
```

**Step 3: WorkspaceSettings, AppearanceSettings, AboutSection**

```tsx
// src/renderer/components/SettingsDrawer/WorkspaceSettings.tsx
import { Folder } from 'lucide-react'
import { useSettingsStore } from '../../stores/settings'

export function WorkspaceSettings() {
  const workspacePath = useSettingsStore(s => s.workspacePath)
  const setWorkspacePath = useSettingsStore(s => s.setWorkspacePath)

  const changeWorkspace = async () => {
    const path = await window.folk.selectWorkspace()
    if (path) setWorkspacePath(path)
  }

  return (
    <div className="space-y-6">
      <h3 className="text-base font-medium text-text-primary">Workspace</h3>
      <div className="bg-pure-black border border-border-mist-08 rounded-default p-4">
        <div className="font-mono text-sm text-text-secondary break-all">{workspacePath || 'Not set'}</div>
      </div>
      <button onClick={changeWorkspace} className="flex items-center gap-2 px-4 py-2 text-sm border border-border-mist-10 rounded-default text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors">
        <Folder size={14} /> Change Workspace
      </button>
    </div>
  )
}
```

```tsx
// src/renderer/components/SettingsDrawer/AppearanceSettings.tsx
import { useSettingsStore } from '../../stores/settings'

export function AppearanceSettings() {
  const fontSize = useSettingsStore(s => s.fontSize)
  const compactMode = useSettingsStore(s => s.compactMode)
  const setFontSize = useSettingsStore(s => s.setFontSize)
  const setCompactMode = useSettingsStore(s => s.setCompactMode)

  return (
    <div className="space-y-6">
      <h3 className="text-base font-medium text-text-primary">Appearance</h3>

      <div>
        <label className="text-sm text-text-secondary mb-2 block">Font Size</label>
        <div className="flex gap-2">
          {(['small', 'medium', 'large'] as const).map(size => (
            <button
              key={size}
              onClick={() => setFontSize(size)}
              className={`px-4 py-2 text-sm rounded-default border transition-colors capitalize ${
                fontSize === size
                  ? 'border-electric-cyan text-text-primary bg-cyan-glow-12'
                  : 'border-border-mist-10 text-text-tertiary hover:text-text-secondary'
              }`}
            >
              {size}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm text-text-secondary">Compact Mode</span>
        <button
          onClick={() => setCompactMode(!compactMode)}
          className={`w-10 h-5 rounded-full transition-colors ${compactMode ? 'bg-electric-cyan' : 'bg-border-mist-10'}`}
        >
          <div className={`w-4 h-4 rounded-full bg-white transition-transform ${compactMode ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </button>
      </div>
    </div>
  )
}
```

```tsx
// src/renderer/components/SettingsDrawer/AboutSection.tsx
import { useState, useEffect } from 'react'
import { ExternalLink } from 'lucide-react'

export function AboutSection() {
  const [version, setVersion] = useState('')

  useEffect(() => {
    window.folk.getAppVersion().then(setVersion)
  }, [])

  return (
    <div className="space-y-6">
      <h3 className="text-base font-medium text-text-primary">About</h3>
      <div className="space-y-2 text-sm text-text-secondary">
        <div>Folk v{version || '0.1.0'}</div>
        <div className="text-text-muted">Powered by llama.cpp + Gemma 4 E4B</div>
      </div>
      <div className="flex flex-col gap-2">
        <a href="#" className="flex items-center gap-2 text-sm text-signal-blue hover:underline">
          <ExternalLink size={12} /> GitHub Repository
        </a>
        <a href="#" className="flex items-center gap-2 text-sm text-signal-blue hover:underline">
          <ExternalLink size={12} /> Report an Issue
        </a>
      </div>
    </div>
  )
}
```

**Step 4: SettingsDrawer**

```tsx
// src/renderer/components/SettingsDrawer/SettingsDrawer.tsx
import { useState } from 'react'
import { X, Cpu, Plug, Folder, Palette, Info } from 'lucide-react'
import { ModelSettings } from './ModelSettings'
import { MCPSettings } from './MCPSettings'
import { WorkspaceSettings } from './WorkspaceSettings'
import { AppearanceSettings } from './AppearanceSettings'
import { AboutSection } from './AboutSection'
import { useUIStore } from '../../stores/ui'

const tabs = [
  { id: 'model', label: 'Model', icon: Cpu },
  { id: 'mcp', label: 'MCP Servers', icon: Plug },
  { id: 'workspace', label: 'Workspace', icon: Folder },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'about', label: 'About', icon: Info },
] as const

type TabId = typeof tabs[number]['id']

export function SettingsDrawer() {
  const [activeTab, setActiveTab] = useState<TabId>('model')
  const setShowSettings = useUIStore(s => s.setShowSettings)

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setShowSettings(false)} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-[480px] bg-pure-black border-l border-border-mist-08 flex">
        {/* Tab nav */}
        <div className="w-14 flex flex-col items-center pt-14 pb-4 border-r border-border-mist-06 gap-1">
          {tabs.map(({ id, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`w-10 h-10 flex items-center justify-center rounded-default transition-colors ${
                activeTab === id
                  ? 'bg-surface-elevated text-electric-cyan'
                  : 'text-text-muted hover:text-text-secondary hover:bg-surface-hover'
              }`}
              title={tabs.find(t => t.id === id)?.label}
            >
              <Icon size={18} />
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border-mist-06">
            <h2 className="text-lg font-medium text-text-primary">
              {tabs.find(t => t.id === activeTab)?.label}
            </h2>
            <button onClick={() => setShowSettings(false)} className="p-1 text-text-tertiary hover:text-text-primary">
              <X size={18} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === 'model' && <ModelSettings />}
            {activeTab === 'mcp' && <MCPSettings />}
            {activeTab === 'workspace' && <WorkspaceSettings />}
            {activeTab === 'appearance' && <AppearanceSettings />}
            {activeTab === 'about' && <AboutSection />}
          </div>
        </div>
      </div>
    </>
  )
}
```

**Step 5: Commit**

```bash
git add src/renderer/components/SettingsDrawer/
git commit -m "feat: implement SettingsDrawer with model, MCP, workspace, appearance, and about sections"
```

**Checkpoint**: User Story 3 complete. Full onboarding flow and settings drawer implemented.

---

## Phase 6: Polish & Cross-Cutting Concerns

---

### Task 25: Wire agent:send-message IPC handler

**Files:**
- Modify: `src/main/ipc-handlers.ts`
- Modify: `src/main/index.ts`

**Step 1: Add AgentManager to IPC handlers**

Add the `agent:send-message` and `agent:stop` handlers to `ipc-handlers.ts`:

```typescript
// Add to IPCDependencies interface:
agentManager: AgentManager

// Add handlers:
ipcMain.handle('agent:send-message', async (_, conversationId: string, content: string) => {
  await deps.agentManager.handleMessage(conversationId, content)
})

ipcMain.handle('agent:stop', (_, conversationId: string) => {
  deps.agentManager.stop(conversationId)
})
```

**Step 2: Initialize AgentManager in index.ts and pass to IPC**

```typescript
// In src/main/index.ts, after llama initialization:
import { AgentManager } from './agent-manager'
import { FileSystemTools } from './tools/file-system'

const fileTools = new FileSystemTools(workspacePath)
const agentManager = new AgentManager({
  baseUrl: llama.getBaseUrl(),
  db,
  fileTools,
  getMainWindow: () => mainWindow,
})
```

**Step 3: Commit**

```bash
git add src/main/ipc-handlers.ts src/main/index.ts
git commit -m "feat: wire AgentManager to IPC for agent:send-message and agent:stop"
```

---

### Task 26: Add model download IPC handler

**Files:**
- Modify: `src/main/ipc-handlers.ts`
- Modify: `src/main/index.ts`

**Step 1: Wire ModelManager into IPC**

```typescript
// In ipc-handlers.ts, update model:download handler:
ipcMain.handle('model:download', async (_, url: string) => {
  const win = getMainWindow()
  deps.modelManager.on('progress', (progress) => {
    win?.webContents.send('model:download-progress', progress)
  })
  await deps.modelManager.download({
    url,
    destPath: deps.modelManager.getDefaultModelPath(),
  })
  // After download, restart llama-server with new model
  await deps.llama.stop()
  deps.llama = new LlamaServerManager({
    modelPath: deps.modelManager.getDefaultModelPath(),
    port: 8080,
    contextSize: 8192,
  })
  await deps.llama.start()
})
```

**Step 2: Commit**

```bash
git add src/main/ipc-handlers.ts src/main/index.ts
git commit -m "feat: wire ModelManager download with progress to IPC"
```

---

### Task 27: Auto-title conversations

**Files:**
- Modify: `src/main/agent-manager.ts`

**Step 1: After first assistant response, generate a title**

Add title generation after the first complete response in the agent loop. Use the first user message to derive a 3-5 word title via a quick model call, or simply truncate the first user message.

```typescript
// Simple approach: truncate first user message as title
private async autoTitle(conversationId: string, firstMessage: string): Promise<void> {
  const title = firstMessage.length > 50 ? firstMessage.slice(0, 47) + '...' : firstMessage
  this.db.renameConversation(conversationId, title)
}
```

Call this in `handleMessage` after the first exchange.

**Step 2: Commit**

```bash
git add src/main/agent-manager.ts
git commit -m "feat: auto-title conversations from first user message"
```

---

### Task 28: Add electron-vite config adjustments

**Files:**
- Modify: `electron.vite.config.ts`

**Step 1: Ensure config handles Tailwind, fonts, and native modules**

```typescript
// electron.vite.config.ts
import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        '@main': resolve('src/main'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
      },
    },
  },
  renderer: {
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        '@renderer': resolve('src/renderer'),
      },
    },
    plugins: [react()],
  },
})
```

**Step 2: Commit**

```bash
git add electron.vite.config.ts
git commit -m "feat: configure electron-vite with path aliases and React plugin"
```

---

### Task 29: Run full application verification

**Step 1: Install dependencies**

```bash
npm install
```

**Step 2: Build**

```bash
npm run build
```

**Step 3: Run dev mode**

```bash
npm run dev
```

Expected: Electron window opens with dark UI, sidebar visible, chat panel with geometric background, empty state showing.

**Step 4: Fix any TypeScript or build errors**

Iterate until clean build and functional app.

**Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve build errors and verify full application startup"
```

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1
- **Phase 3 (Chat UI)**: Depends on Phase 2 — needs IPC, stores, preload API
- **Phase 4 (Artifacts/Activity)**: Depends on Phase 3 — extends chat UI
- **Phase 5 (Settings/Onboarding)**: Can run in parallel with Phase 4
- **Phase 6 (Polish)**: Depends on all prior phases

### Parallel Opportunities

- Tasks 2 + 3 + 4 (dependencies, Tailwind, fonts) can run in parallel
- Tasks 8 + 12 + 13 (llama-server, model manager, file tools) can run in parallel
- Tasks 15-20 (all renderer components) are sequential within the UI layer
- Tasks 21 + 23 (artifact panel, onboarding) can run in parallel after Phase 3
- Settings drawer sections (Task 24) are independent files, can be parallelized

### Total Tasks: 29

---

## Implementation Strategy

### MVP First (Phase 1-3)
1. Scaffold project, install deps, configure tools
2. Build all backend infrastructure (DB, llama, agent, IPC)
3. Build chat UI — app is functional with text chat

### Incremental Feature Addition (Phase 4-5)
4. Add artifact panel + activity log
5. Add onboarding + settings

### Polish (Phase 6)
6. Wire remaining IPC, auto-title, verification
