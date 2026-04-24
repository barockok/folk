# folk — Electron + Vite Architecture Design

> Convert the standalone HTML/JSX prototype into a production Electron app with `@anthropic-ai/claude-agent-sdk` integration.

**Date:** 2026-04-24
**Approach:** SDK-in-Main (Approach A)
**Backend:** Fresh architecture aligned with `claude.md` spec

---

## 1. Architecture Overview

The Electron main process imports `@anthropic-ai/claude-agent-sdk` directly. Each active session gets an SDK agent instance that spawns `claude-code` under the hood. IPC bridges agent events (text chunks, tool calls, thinking states) to the renderer. Sessions are persisted in SQLite (metadata only — message history lives in Claude Code's native JSONL files).

```
┌─────────────┐     IPC      ┌─────────────────┐     SDK API    ┌──────────────┐
│  Renderer   │◄────────────►│  Main Process   │◄─────────────►│ claude-code  │
│  (React 19) │              │  (AgentManager) │               │   binary     │
└─────────────┘              └─────────────────┘               └──────────────┘
                                    │
                                    ▼
                              ┌─────────────┐
                              │   SQLite    │
                              │ (metadata,  │
                              │  config)    │
                              └─────────────┘
```

**Key principle:** Folk is a native shell around Claude Code — same sessions, same tool calls, same underlying binary. Folk stores only its own metadata (title overrides, model choice, goals). Conversation content is read from Claude Code's JSONL files.

---

## 2. File Structure

```
folk/
├── electron.vite.config.ts       # Vite config for main + preload + renderer
├── electron-builder.yml          # Packaging config
├── package.json                  # Dependencies
├── src/
│   ├── main/
│   │   ├── index.ts              # Electron app lifecycle, window creation
│   │   ├── agent-manager.ts      # Session lifecycle, SDK agent instances
│   │   ├── ipc-handlers.ts       # IPC handlers
│   │   ├── mcp-manager.ts        # MCP server lifecycle
│   │   ├── database.ts           # better-sqlite3 wrapper
│   │   └── types.ts              # Main-process types
│   ├── preload/
│   │   └── index.ts              # ContextBridge API
│   ├── renderer/
│   │   ├── index.html            # Vite entry HTML
│   │   ├── src/
│   │   │   ├── main.tsx          # React root
│   │   │   ├── App.tsx           # Top-level shell
│   │   │   ├── components/
│   │   │   │   ├── Shell.tsx     # Sidebar + topbar
│   │   │   │   ├── Sidebar.tsx
│   │   │   │   ├── Topbar.tsx
│   │   │   │   ├── CommandPalette.tsx
│   │   │   │   └── ToastContainer.tsx
│   │   │   ├── pages/
│   │   │   │   ├── SessionsPage.tsx
│   │   │   │   ├── MCPPage.tsx
│   │   │   │   ├── SkillsPage.tsx
│   │   │   │   ├── PluginsPage.tsx
│   │   │   │   ├── MarketplacePage.tsx
│   │   │   │   ├── KeybindingsPage.tsx
│   │   │   │   ├── ModelPage.tsx
│   │   │   │   └── ProfilePage.tsx
│   │   │   ├── onboarding/
│   │   │   │   ├── FirstRunOnboarding.tsx
│   │   │   │   └── SessionSetup.tsx
│   │   │   ├── hooks/
│   │   │   │   ├── useAgent.ts
│   │   │   │   ├── useSessions.ts
│   │   │   │   └── useProviders.ts
│   │   │   ├── stores/
│   │   │   │   └── ...           # Zustand stores
│   │   │   └── styles/
│   │   │       ├── tokens.css    # Design tokens
│   │   │       ├── components.css
│   │   │       └── onboarding.css
│   │   └── ... assets
│   └── shared/
│       └── types.ts              # Shared types
└── resources/                    # Icons, fonts
```

---

## 3. IPC Protocol

### Request/Response (Renderer → Main)

| Channel | Args | Returns |
|---------|------|---------|
| `sessions:list` | — | `Session[]` |
| `sessions:create` | `SessionConfig` | `Session` |
| `sessions:get` | `id: string` | `Session` |
| `sessions:delete` | `id: string` | `void` |
| `agent:sendMessage` | `sessionId, text, attachments?` | `void` (streams back) |
| `agent:cancel` | `sessionId: string` | `void` |
| `providers:list` | — | `ProviderConfig[]` |
| `providers:save` | `ProviderConfig` | `void` |
| `providers:delete` | `id: string` | `void` |
| `providers:test` | `id: string` | `{ ok: boolean, error?: string }` |
| `mcpServers:list` | — | `MCPServer[]` |
| `mcpServers:save` | `MCPServer` | `void` |
| `mcpServers:delete` | `id: string` | `void` |
| `mcpServers:test` | `id: string` | `{ ok: boolean, tools: ToolInfo[], error?: string }` |
| `profile:get` | — | `Profile` |
| `profile:save` | `Profile` | `void` |

### One-way Events (Main → Renderer)

| Event | Payload |
|-------|---------|
| `agent:chunk` | `{ sessionId, text }` |
| `agent:thinking` | `{ sessionId, text }` |
| `agent:toolCall` | `{ sessionId, tool, input }` |
| `agent:toolResult` | `{ sessionId, tool, output }` |
| `agent:done` | `{ sessionId }` |
| `agent:error` | `{ sessionId, error }` |

---

## 4. State & Persistence

### What Lives Where

| Data | Location | Reason |
|------|----------|--------|
| Session metadata | SQLite | Folk-specific overrides |
| Message history | **Claude Code JSONL** | Source of truth |
| Provider configs | SQLite | Encrypted at rest |
| MCP server configs | SQLite | Survive restarts |
| Profile | SQLite | Survive restarts |
| Active session state | Zustand | Ephemeral UI state |
| UI state | Zustand + localStorage | Ephemeral |
| Onboarding flag | localStorage | Simple, non-sensitive |

### SQLite Schema

```sql
-- Sessions (metadata only)
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  title TEXT,
  model_id TEXT,
  working_dir TEXT,
  goal TEXT,
  flags TEXT,
  status TEXT DEFAULT 'idle',
  created_at INTEGER,
  updated_at INTEGER
);

-- Providers
CREATE TABLE providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  api_key TEXT NOT NULL,
  base_url TEXT,
  models TEXT NOT NULL,
  is_enabled INTEGER DEFAULT 1,
  created_at INTEGER
);

-- MCP Servers
CREATE TABLE mcp_servers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  template TEXT,
  transport TEXT NOT NULL,
  command TEXT,
  args TEXT,
  env TEXT,
  url TEXT,
  is_enabled INTEGER DEFAULT 1,
  status TEXT DEFAULT 'stopped',
  last_error TEXT,
  tool_count INTEGER,
  created_at INTEGER
);

-- Profile
CREATE TABLE profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  nickname TEXT,
  pronouns TEXT,
  role TEXT,
  tone TEXT,
  avatar_color TEXT,
  about TEXT
);
```

### API Key Encryption

API keys encrypted with `safeStorage.encryptString()` / `decryptString()`. Transparent in `database.ts` wrapper.

---

## 5. Session Lifecycle

### Creation

1. User clicks "New session" (or ⌘N)
2. Show `SessionSetup` sheet (working dir, model, goal, flags)
3. `AgentManager.createSession(config)` → write to SQLite
4. SDK spawns `claude-code` with working directory, model override, API key, flags
5. Session appears in sidebar history rail

### Agent Loop

```
User sends message
  → AgentManager.sendMessage(sessionId, text, attachments?)
  → SDK agent loop starts (spawned claude-code process)
  → Emits: text_chunk → tool_call → tool_result → done | error
  → Main forwards each event to renderer via IPC
  → Renderer appends to Zustand state
```

### Tool Calls

Folk **observes** tool calls (renders them as collapsible cards) but does **not intercept** them. The SDK handles tool execution internally.

### Cancellation

`agent.cancel(sessionId)` sends SIGINT to the `claude-code` process. Renderer shows partial response with "Cancelled" indicator.

---

## 6. MCP Integration

The SDK bundles `@modelcontextprotocol/sdk`. Folk manages config and lifecycle; the SDK handles the protocol.

### Templates

| Template | Pre-filled Command |
|----------|-------------------|
| `filesystem` | `npx -y @modelcontextprotocol/server-filesystem` |
| `github` | `npx -y @modelcontextprotocol/server-github` |
| `postgres` | `npx -y @modelcontextprotocol/server-postgres` |
| `slack` | `npx -y @modelcontextprotocol/server-slack` |
| `notion` | `npx -y @modelcontextprotocol/server-notion` |
| `custom` | User-provided |

**No default MCP servers pre-configured.** Users add their own.

### Test Connect

`MCPManager.testConnection(id)` spawns a temporary client, calls `listTools()`, returns tool count or error.

### Session Startup

AgentManager passes all enabled MCP servers to the SDK when starting a session.

---

## 7. Model/Provider Configuration

### Provider Presets

| Provider | Base URL | Default Models |
|----------|----------|----------------|
| Anthropic | (SDK default) | claude-sonnet-4-5, claude-opus-4, claude-haiku-4-5 |
| OpenAI | https://api.openai.com/v1 | gpt-4o, gpt-4o-mini, o3-mini |
| Google | https://generativelanguage.googleapis.com | gemini-2.5-pro, gemini-2.5-flash |
| GLM (Zhipu) | https://open.bigmodel.cn/api/paas/v4 | glm-4.6, glm-4-air |
| Moonshot | https://api.moonshot.cn/v1 | kimi-k2, moonshot-v1-128k |
| Qwen | https://dashscope.aliyuncs.com/compatible-mode/v1 | qwen-max, qwen-coder-plus |
| Custom | user-provided | user-provided |

All providers use Anthropic-compatible request format. The SDK passes `base_url`, `api_key`, `model` to `claude-code`.

### Model Picker

Composer's model chip opens a popover grouped by provider. Only enabled models shown. Session-level model override stored in SQLite.

---

## 8. Error Handling

| Scenario | Behavior |
|----------|----------|
| SDK process crash | Emit error, set session status to `'error'`, show retry button |
| Invalid API key (401) | Inline error in composer, link to Model & API page |
| Quota / rate limit | Inline error with retry-after info if available |
| No providers configured | Block send, show "Add a provider first" banner |
| MCP server failure | Tool card shows error state, user can retry or restart |
| Offline | Fail fast with "No connection" toast |

### Session Recovery

On app restart: load session list from SQLite. No auto-resume. Clicking a session reads JSONL history.

### Data Loss Prevention

- SQLite WAL mode for durability
- Claude Code JSONL is source of truth for messages

---

## 9. Dependencies

```json
{
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
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "electron": "^35.0.0",
    "electron-builder": "^26.0.0",
    "electron-vite": "^3.0.0",
    "typescript": "^5.7.0",
    "vite": "^6.0.0"
  }
}
```

---

## 10. Open Questions

1. **Build target:** macOS only initially, or cross-platform from day one?
2. **Auto-update:** Use `electron-updater` with GitHub releases?
3. **Code signing:** Developer ID for macOS gatekeeper?
