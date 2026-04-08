# Local Cowork — Architecture Design

**Date:** 2026-04-08
**Status:** Draft — architecture only, UI design TBD

## Overview

A free, fully local, open-source desktop app that replicates the Cowork experience (from Claude Desktop) without any remote model dependency. Powered by Gemma 4 E4B running locally via llama.cpp, with the Claude Agent SDK providing the agent framework.

**Target user:** Non-technical users who want a multi-step AI agent that can read/write files, connect to external services via MCP, and handle complex tasks — all running locally on their machine.

## Core Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Model | Gemma 4 E4B (4.5B effective params, GGUF Q4, ~1.5 GB) | Largest model that runs comfortably on 8 GB+ laptops alongside other apps. Multimodal (text, image, video, audio input). 128K context window. |
| Inference engine | llama.cpp (llama-server) | Gold standard for local inference. Native GPU acceleration (Metal/CUDA/Vulkan). Built-in Anthropic-compatible API (`/v1/messages`). Battle-tested. |
| Agent framework | Claude Agent SDK | Multi-step planning, tool use, MCP client built-in. Works with any Anthropic-compatible backend via `base_url` override. Proven agent loop — no need to build from scratch. |
| App shell | Electron | Cross-platform desktop app. Packaged as .dmg / .exe / .AppImage. |
| Distribution | Open source + downloadable binaries | OSS repo, packaged releases via electron-builder with per-platform llama-server binaries. |

## Architecture

```
Electron App
├── Main Process (Node.js)
│   ├── Lifecycle manager
│   │   └── Spawns llama-server as child process
│   │       └── --model gemma-4-e4b-q4.gguf --jinja --port 8080
│   ├── Claude Agent SDK
│   │   ├── base_url: http://localhost:8080
│   │   ├── MCP client (connects to external MCP servers)
│   │   └── Tool registry
│   │       ├── File system tools (read, write, create, list)
│   │       ├── Workspace scoping (default boundary)
│   │       └── Dialog-gated broader file access
│   └── IPC bridge to renderer
├── Renderer Process (Chromium)
│   └── React UI (design TBD — Cowork-style layout)
└── Bundled Assets
    ├── llama-server binary (per platform: macOS arm64, macOS x64, Windows x64, Linux x64)
    └── gemma-4-e4b-q4.gguf (~1.5 GB)
```

## Request Flow

```
1. User sends message in UI
2. Renderer → IPC → Main process
3. Main process → Agent SDK processes message
4. Agent SDK → HTTP POST localhost:8080/v1/messages (Anthropic format)
5. llama-server runs inference on Gemma 4 E4B, streams tokens via SSE
6. Agent SDK receives streamed response
   ├── If text response → stream to renderer via IPC → UI
   └── If tool_use → execute tool → append result → loop back to step 4
7. Final response displayed in UI
```

## Key Technical Details

### llama-server as child process

- Main process spawns `llama-server` on app startup
- Waits for health check (`GET /health`) before accepting user input
- Monitors child process — restarts on crash
- Graceful shutdown on app quit (SIGTERM → wait → SIGKILL)
- Flags: `--model <path> --jinja --port 8080 --ctx-size 8192`
  - `--jinja` required for tool use support
  - Context size tunable based on available RAM (8K default balances memory usage vs capability; increase to 32K+ on 16 GB+ machines)

### Anthropic API compatibility

llama.cpp's `/v1/messages` endpoint natively supports:
- Anthropic message format (system, user, assistant roles)
- Content blocks (text, tool_use, tool_result)
- Streaming via SSE
- Tool use with structured JSON output

No translation layer or API shim needed. The Agent SDK talks directly to llama-server using standard Anthropic protocol.

### File system access

- **Scoped workspace (default):** User opens/creates a project folder. Agent can freely read/write within it.
- **Broader access (dialog-gated):** Agent requests access to files outside workspace via Electron's native file dialog. User must approve each time.
- Implemented as Agent SDK tools: `read_file`, `write_file`, `list_directory`, `create_file`

### MCP integration

- Handled entirely by the Agent SDK's built-in MCP client
- User configures MCP servers in app settings (similar to Claude Desktop's config)
- Supports stdio and SSE transport
- Example servers: filesystem, Slack, Gmail, databases, custom tools

### Model management

- Ships with Gemma 4 E4B Q4 as default
- User can swap models by placing different GGUF files and selecting in settings
- Advanced users can point `base_url` to external Ollama/remote API for bigger models
- Model download on first launch (to avoid 1.5 GB app bundle) is an option — TBD

## Alternatives Considered

### WebGPU in Electron (rejected)

Running transformers.js in a hidden BrowserWindow with WebGPU inference. Rejected because:
- Required complex 3-way IPC (Main ↔ Hidden Window ↔ Web Worker)
- Needed a custom Anthropic API shim
- Browser VRAM cap (~4 GB) limits model options
- transformers.js less mature than llama.cpp for production LLM inference
- Only benefit (no native binaries) doesn't justify the complexity for a desktop app

### Custom agent loop (rejected)

Building the agent loop from scratch instead of using the Agent SDK. Rejected because:
- Multi-step planning with small models needs careful guardrails and retry logic
- MCP client would need separate implementation
- Tool use parsing is non-trivial to get right
- Agent SDK already solves all of this

### Vercel AI SDK (rejected)

Model-agnostic framework with React hooks. Rejected because:
- Still needs a custom agent loop on top for multi-step planning
- MCP integration not native — requires bridging
- Agent SDK is purpose-built for exactly this use case

## Constraints & Risks

| Risk | Mitigation |
|------|------------|
| Gemma 4 E4B may struggle with complex multi-step agent tasks (4.5B is small) | Careful system prompts, structured tool definitions, agent loop guardrails. Allow model swapping for power users. |
| llama.cpp binary packaging per platform | electron-builder supports native binary bundling. Prebuilt llama-server binaries available for all major platforms. |
| 1.5 GB model download size | Consider first-launch download instead of bundling. Show progress bar. |
| Agent SDK may have Claude-specific assumptions | Test thoroughly with Gemma 4 E4B. Patch or fork SDK if needed for small-model compatibility. |
| Memory pressure on 8 GB machines (Electron ~300 MB + llama-server ~2 GB + user's other apps) | Default to Q4 quantization. Allow user to select smaller quant or E2B model in settings. Monitor memory and warn user. |

## Open Questions

- **UI design:** Cowork-style layout confirmed, detailed design deferred to separate session
- **App name:** TBD
- **First-launch experience:** Bundle model vs download on first run?
- **Background tasks (nice-to-have):** How to surface async agent work in UI?
- **Conversation persistence:** Local SQLite? JSON files? (memory/history deprioritized but needs minimal storage)
