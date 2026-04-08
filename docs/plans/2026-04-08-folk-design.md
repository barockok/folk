# Folk — Complete Application Design

**Date:** 2026-04-08
**Status:** Approved
**Software:** Folk — Local AI Agent Desktop App

---

## 1. Product Overview

Folk is a free, fully local, open-source desktop app that gives non-technical users a multi-step AI agent capable of reading/writing files, connecting to external services via MCP, and handling complex tasks — all running locally on their machine with zero cloud dependency.

**Target user:** Non-technical users who want AI-powered productivity without sending data to remote servers.

**Core value proposition:** "Your own AI assistant. Entirely local."

---

## 2. Core Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Model | Gemma 4 E4B (4.5B params, GGUF Q4, ~1.5 GB) | Largest model that runs on 8 GB+ laptops. Multimodal. 128K context. |
| Inference engine | llama.cpp (llama-server) | Native GPU acceleration (Metal/CUDA/Vulkan). Anthropic-compatible API. |
| Agent framework | Claude Agent SDK | Multi-step planning, tool use, MCP client built-in. |
| App shell | Electron 33+ | Cross-platform desktop. Packaged as .dmg / .exe / .AppImage. |
| Build tooling | electron-vite (Vite + React + TypeScript) | Fast dev builds, good Electron integration. |
| UI framework | React 19 + TypeScript 5.5 | Industry standard, large ecosystem. |
| Styling | Tailwind CSS 4 | Utility-first, easy design system token implementation. |
| State management | Zustand 5 | Lightweight, no boilerplate, perfect for Electron renderer. |
| Database | SQLite via better-sqlite3 | Industry standard for Electron apps. Single file, fast search. |
| Fonts | Inter (variable) + JetBrains Mono | Inter replaces proprietary abcDiatype. Same geometric authority. |
| First launch | Download model on first launch | Lean installer (~50 MB), guided download UX. |
| Layout | Split-panel Cowork style | Matches Cowork mental model. Chat + artifact panel. |
| Window chrome | Custom frameless titlebar | Matches dark design system, cross-platform consistency. |
| Icons | Lucide React | Clean, consistent, MIT licensed. |
| Distribution | Open source + downloadable binaries | OSS repo, packaged releases via electron-builder. |

---

## 3. Architecture

```
Folk (Electron App)
├── Main Process (Node.js)
│   ├── AppLifecycleManager
│   │   ├── LlamaServerManager (spawn/monitor/restart llama-server)
│   │   ├── DatabaseManager (SQLite via better-sqlite3)
│   │   └── ModelManager (download, verify, swap GGUF models)
│   ├── AgentManager
│   │   ├── Claude Agent SDK instance
│   │   │   └── base_url: http://localhost:8080
│   │   ├── ToolRegistry
│   │   │   ├── FileSystemTools (read, write, list, create — workspace-scoped)
│   │   │   ├── BroadFileAccessTool (dialog-gated for outside workspace)
│   │   │   └── SystemInfoTool (OS, platform, memory)
│   │   └── MCPClientManager (connect to user-configured MCP servers)
│   ├── ConversationStore (CRUD on SQLite)
│   └── IPCHandlers (contextBridge channels)
├── Preload Script
│   └── Typed API exposed via contextBridge
├── Renderer Process (Chromium)
│   ├── React + TypeScript + Vite
│   ├── Zustand stores
│   │   ├── conversationStore
│   │   ├── uiStore (panels, modals, theme)
│   │   ├── agentStore (status, streaming tokens, tool activity)
│   │   └── settingsStore
│   ├── UI Components (Tailwind CSS, design system tokens)
│   │   ├── TitleBar (custom frameless)
│   │   ├── Sidebar (conversation list)
│   │   ├── ChatPanel (messages, input)
│   │   ├── ArtifactPanel (file preview, tool results)
│   │   ├── ActivityLog (collapsible, shows tool calls)
│   │   ├── SettingsDrawer
│   │   └── OnboardingWizard
│   └── Fonts: Inter + JetBrains Mono
└── Bundled Assets
    ├── llama-server binaries (per platform: macOS arm64, macOS x64, Windows x64, Linux x64)
    └── (Model downloaded on first launch)
```

---

## 4. UI Design

### 4.1 Design System (Adapted from Composio)

**Color Palette:**
- Void Black (`#0f0f0f`) — primary page background
- Pure Black (`#000000`) — card interiors, sidebar, panels
- Electric Cyan (`#00ffff`) — accent, glows, active states (used at low opacity)
- Composio Cobalt (`#0007cd`) — brand accent, gradient washes
- Signal Blue (`#0089ff`) — interactive focus states
- Pure White (`#ffffff`) — primary headings, high-emphasis text
- Ghost White (`rgba(255,255,255,0.6)`) — secondary body text
- Whisper White (`rgba(255,255,255,0.5)`) — tertiary text
- Border Mist 04-12 (`rgba(255,255,255,0.04-0.12)`) — opacity-based borders

**Typography:**
- Inter (variable) — all UI text, headings, body
- JetBrains Mono — code, technical content, metrics
- Heading line-heights: 0.87-1.0 (ultra-tight, compressed)
- Body line-height: 1.5
- Weight: 400 (regular) default, 500 (medium) for labels, 600 for brand wordmark

**Components:**
- Buttons: White fill (primary), Cyan glow (accent), Ghost outline (secondary)
- Cards: Pure Black bg, Border Mist 10 border, 4px radius
- Brutalist shadow: `4px 4px 0px rgba(0,0,0,0.15)` on select elements
- Background: Void Black + geometric square grid overlay (80px, Border Mist 04)

### 4.2 Onboarding Wizard (First Launch)

Three full-screen steps on Void Black with geometric overlay:

**Step 1 — Welcome:**
- Folk wordmark (Inter 600)
- Tagline: "Your AI assistant. Entirely local."
- CTA: "Get Started" (white fill)

**Step 2 — Model Download:**
- "Downloading your AI model"
- "Gemma 4 E4B — 1.5 GB. This only happens once."
- Progress bar (Electric Cyan fill on dark track)
- Speed + ETA in JetBrains Mono
- Skip link for advanced users

**Step 3 — Workspace:**
- "Choose a workspace folder"
- Folder picker (native Electron dialog)
- Selected path in JetBrains Mono
- "Start using Folk" CTA

### 4.3 Main Window Layout

```
┌──────────────────────────────────────────────────────────┐
│ [Custom TitleBar — drag region, window controls]         │
├────────────┬─────────────────────┬───────────────────────┤
│            │                     │                       │
│  Sidebar   │    Chat Panel       │   Artifact Panel      │
│  (260px)   │    (flex-1)         │   (400px, toggle)     │
│            │                     │                       │
│ ┌────────┐ │  ┌───────────────┐  │  ┌─────────────────┐  │
│ │Search  │ │  │ Messages      │  │  │ File preview    │  │
│ └────────┘ │  │               │  │  │ or tool result  │  │
│            │  │               │  │  │                 │  │
│ Conv 1     │  │               │  │  │ Tabs for multi  │  │
│ Conv 2  ●  │  │               │  │  │ artifacts       │  │
│ Conv 3     │  │               │  │  │                 │  │
│            │  │               │  │  └─────────────────┘  │
│            │  ├───────────────┤  │                       │
│            │  │ [Activity Log]│  │                       │
│ ┌────────┐ │  ├───────────────┤  │                       │
│ │+ New   │ │  │ Input area    │  │                       │
│ │⚙ Set   │ │  │ [Send button] │  │                       │
│ └────────┘ │  └───────────────┘  │                       │
└────────────┴─────────────────────┴───────────────────────┘
```

### 4.4 Sidebar (260px)

- Background: Pure Black
- Border-right: Border Mist 08
- Search input: transparent bg, Border Mist 10 border, Ghost White placeholder
- Conversation items: title (Inter 14px, white) + preview (Ghost White 12px) + timestamp
- Active: left border accent in Electric Cyan, bg `rgba(255,255,255,0.04)`
- Hover: `rgba(255,255,255,0.02)` bg shift
- Bottom: "New Chat" ghost button + Settings gear icon
- Scrollbar: thin, Ghost White, auto-hide

### 4.5 Chat Panel

- Background: Void Black with geometric overlay
- User messages: right-aligned, `rgba(255,255,255,0.06)` bubble, Inter 15px, white
- Assistant messages: left-aligned, no bubble, Inter 15px, Ghost White
- Code blocks: JetBrains Mono 14px, Pure Black bg, Border Mist 10 border, syntax highlighted
- Tool use indicators: inline collapsible, JetBrains Mono 12px, Electric Cyan icon
- Streaming cursor: Electric Cyan `|` blink
- Input: multi-line textarea, Border Mist 10 top border, full width
  - Placeholder: "Ask Folk anything..."
  - Send: circular button, Electric Cyan at 12% opacity
  - Focus: border shifts to Signal Blue
  - Shift+Enter for newline, Enter to send
  - File attachment button

### 4.6 Artifact Panel (400px, toggleable)

- Background: Pure Black
- Border-left: Border Mist 08
- Tab bar: horizontal tabs, Electric Cyan underline for active
- Content rendering by type: markdown, code (syntax highlighted), images, diffs
- Action bar: Copy, Save, Open (ghost buttons)
- Empty state: "Artifacts will appear here when Folk creates or modifies files"

### 4.7 Activity Log (Collapsible)

- Between messages and input
- Collapsed: "3 tool calls" in JetBrains Mono 12px, Electric Cyan dot
- Expanded: scrollable list of tool calls with status icons
- Color coding: Cyan = running, White = success, Red (#ff4444) = error
- Auto-collapses when agent finishes

### 4.8 Settings Drawer (480px, slide from right)

**Model section:**
- Current model info (JetBrains Mono)
- Change model (file picker for GGUF)
- Download recommended models
- Custom base_url input (Ollama/remote)
- Context size slider (4K → 128K)
- GPU layers slider

**MCP Servers section:**
- Server list with status indicators (green/red/gray dots)
- Add server: name, command/URL, transport (stdio/SSE)
- Test connection button per server

**Workspace section:**
- Current path, change button
- Broader file access toggle

**Appearance section:**
- Font size (small/medium/large)
- Compact mode toggle

**About section:**
- Version info, GitHub link, licenses

### 4.9 Empty State (No Conversations)

- Folk wordmark centered
- "What can I help you with?" in Inter 28px
- Suggestion cards: "Organize my files" / "Draft an email" / "Analyze this document" / "Help me write code"
- Cards: Pure Black bg, Border Mist 10, 4px radius, hover glow

---

## 5. Data Model (SQLite)

```sql
CREATE TABLE conversations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    workspace_path TEXT,
    is_archived INTEGER DEFAULT 0
);

CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    token_count INTEGER
);
CREATE INDEX idx_messages_conv ON messages(conversation_id, created_at);

CREATE TABLE tool_calls (
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
CREATE INDEX idx_tool_calls_msg ON tool_calls(message_id);

CREATE TABLE artifacts (
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
CREATE INDEX idx_artifacts_conv ON artifacts(conversation_id);

CREATE TABLE mcp_servers (
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

CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
```

---

## 6. Request Flow

```
1. User types message → Enter
2. Renderer: conversationStore.sendMessage(text)
   → Optimistic UI update
   → IPC invoke 'agent:send-message'
3. Main process: AgentManager.handleMessage()
   a. Save user message to SQLite
   b. Load conversation history
   c. Call Agent SDK with messages + tools
   d. Agent SDK → POST http://localhost:8080/v1/messages (SSE)
4. llama-server: inference on Gemma 4 E4B, streams tokens
5. Agent SDK receives stream:
   ├── Text tokens → IPC 'agent:token' → renderer live update
   ├── tool_use → IPC 'agent:tool-start'
   │   ├── Execute tool
   │   ├── IPC 'agent:tool-result'
   │   ├── If file op → IPC 'agent:artifact'
   │   └── Append result → loop to step 3d
   └── end_turn → IPC 'agent:complete'
6. Save assistant message + tool calls + artifacts to SQLite
7. Renderer: final UI update
```

---

## 7. Component Tree

```
<App>
  <OnboardingWizard />
  <TitleBar />
  <MainLayout>
    <Sidebar>
      <SearchInput />
      <ConversationList>
        <ConversationItem />
      </ConversationList>
      <SidebarFooter>
        <NewChatButton />
        <SettingsButton />
      </SidebarFooter>
    </Sidebar>
    <ChatPanel>
      <MessageList>
        <UserMessage />
        <AssistantMessage>
          <MarkdownRenderer />
          <CodeBlock />
          <ToolUseBlock />
        </AssistantMessage>
      </MessageList>
      <ActivityLog />
      <ChatInput>
        <TextArea />
        <AttachButton />
        <SendButton />
      </ChatInput>
    </ChatPanel>
    <ArtifactPanel>
      <ArtifactTabs />
      <ArtifactContent>
        <MarkdownViewer />
        <CodeViewer />
        <ImageViewer />
        <DiffViewer />
      </ArtifactContent>
      <ArtifactActions />
    </ArtifactPanel>
  </MainLayout>
  <SettingsDrawer>
    <ModelSettings />
    <MCPSettings />
    <WorkspaceSettings />
    <AppearanceSettings />
    <AboutSection />
  </SettingsDrawer>
</App>
```

---

## 8. IPC Channel Contract

```typescript
// Preload → Main (invoke, returns promise)
'agent:send-message'      → (conversationId: string, content: string) => void
'agent:stop'              → (conversationId: string) => void
'conversation:create'     → () => Conversation
'conversation:list'       → () => Conversation[]
'conversation:delete'     → (id: string) => void
'conversation:rename'     → (id: string, title: string) => void
'conversation:messages'   → (id: string) => Message[]
'settings:get'            → (key: string) => any
'settings:set'            → (key: string, value: any) => void
'mcp:list-servers'        → () => MCPServer[]
'mcp:add-server'          → (config: MCPServerConfig) => MCPServer
'mcp:remove-server'       → (id: string) => void
'mcp:test-connection'     → (id: string) => { ok: boolean; error?: string }
'model:info'              → () => ModelInfo
'model:change'            → (path: string) => void
'model:download'          → (url: string) => void
'workspace:select'        → () => string | null
'workspace:current'       → () => string
'llama:status'            → () => 'starting' | 'ready' | 'error' | 'stopped'
'dialog:open-file'        → (options: OpenDialogOptions) => string[]
'app:version'             → () => string

// Main → Renderer (send, event stream)
'agent:token'             → { conversationId: string; token: string }
'agent:tool-start'        → { conversationId: string; toolCall: ToolCallStart }
'agent:tool-result'       → { conversationId: string; toolCall: ToolCallResult }
'agent:artifact'          → { conversationId: string; artifact: Artifact }
'agent:complete'          → { conversationId: string; message: Message }
'agent:error'             → { conversationId: string; error: string }
'model:download-progress' → { percent: number; speed: string; eta: string }
'llama:status-change'     → 'starting' | 'ready' | 'error' | 'stopped'
```

---

## 9. Error Handling

| Scenario | Behavior |
|----------|----------|
| llama-server crashes | Auto-restart (max 3 attempts), "AI engine restarting..." banner. After 3 fails, error state + "Restart" button |
| llama-server won't start | Error screen with diagnostics (port conflict, missing model, insufficient RAM) |
| Model file missing/corrupt | Prompt re-download via onboarding step 2 |
| Agent tool fails | Error inline in activity log, agent continues with error context |
| MCP server connection fails | Red status dot, toast notification, agent degrades gracefully |
| Out of context window | Auto-summarize earlier messages, notify user |
| Disk full | Warning toast at <500MB free, block new conversations at <100MB |
| Network error during download | Resume via HTTP range requests, retry 3x, then show manual link |

---

## 10. Performance

- Token streaming: batch IPC sends per 16ms frame to avoid thrashing
- Message list: virtualized via react-window for 1000+ messages
- SQLite: WAL mode for concurrent read/write
- Model loading: "Warming up..." state during llama-server model load (~5-15s)
- Memory monitoring: poll every 30s, warn at 80% system RAM
- Syntax highlighting: lazy-load via Shiki with async language bundles

---

## 11. Security

- No remote calls except user-initiated model download (checksum verified)
- Workspace-scoped file access; broader access requires native OS dialog approval
- MCP servers: user must explicitly add, run as child processes
- No telemetry, no analytics, no phoning home
- contextBridge isolation: renderer has zero direct Node.js access
- Optional SQLite encryption via sqlcipher (v2)

---

## 12. Platform Support

| Platform | Binary | GPU Acceleration |
|----------|--------|-----------------|
| macOS arm64 (Apple Silicon) | .dmg | Metal (automatic) |
| macOS x64 (Intel) | .dmg | CPU only |
| Windows x64 | .exe (NSIS) | CUDA / Vulkan |
| Linux x64 | .AppImage | CUDA / Vulkan |

---

## 13. Tech Stack Summary

| Layer | Technology |
|-------|-----------|
| Shell | Electron 33+ |
| Build | electron-vite |
| Renderer | React 19 + TypeScript 5.5 |
| Styling | Tailwind CSS 4 |
| State | Zustand 5 |
| Fonts | Inter (variable) + JetBrains Mono |
| Database | better-sqlite3 |
| Markdown | react-markdown + remark-gfm + rehype-highlight |
| Code highlight | Shiki |
| Virtualization | react-window |
| Inference | llama.cpp (llama-server) |
| Agent | Claude Agent SDK |
| Model | Gemma 4 E4B Q4 GGUF |
| Packaging | electron-builder |
| Icons | Lucide React |
