# Vercel AI SDK Integration with WebGPU Provider

## Problem

The current agent system uses a custom-built agent loop, prompt builder, and tool parser (~400 lines across 4 files). Tool call parsing from raw text is fragile, the agent loop lacks features like automatic retries and proper multi-step handling, and streaming token output while detecting tool call boundaries is hand-rolled. The Vercel AI SDK provides all of this out of the box via `streamText` with `maxSteps`, but needs a custom provider to bridge to the local WebGPU inference engine.

## Architecture

Replace the entire `src/main/agent/` directory with a Vercel AI SDK integration. Three new modules in `src/main/ai/`:

1. **WebGPU Provider** — Custom `LanguageModelV1` implementation that wraps `InferenceManager` IPC
2. **Stream Parser** — Converts Gemma's native tag format from a token stream into the SDK's stream protocol
3. **Tools** — Folk tools rewritten as Vercel AI SDK `tool()` definitions with Zod schemas

### Data Flow

```
User message
  → AgentManager calls streamText({ model: webgpuModel, tools, maxSteps: 10 })
    → SDK calls provider.doStream(messages, tools)
      → Provider builds Gemma prompt from messages + tool definitions
      → Provider calls InferenceManager.generate() with onToken streaming
      → Stream parser converts Gemma tags into SDK stream protocol:
        - Regular text → text-delta parts
        - <|tool_call>...<tool_call|> → tool-call-delta + tool-call parts
        - End of output → finish part (stop or tool-calls)
    → SDK auto-executes tools when tool calls detected (maxSteps loop)
    → AgentManager receives streamed chunks, forwards tokens to renderer
  → Renderer displays streaming text
```

## New Files

### `src/main/ai/webgpu-provider.ts`

Custom `LanguageModelV1` provider. Key responsibilities:

- `specificationVersion: 'v1'`
- `provider: 'webgpu'`, `modelId` from active model settings
- `doStream(options)`: Main method called by the SDK
  - Converts `options.prompt` (array of SDK messages) to Gemma prompt format
  - Converts `options.mode.tools` to Gemma tool declaration tags
  - Calls `InferenceManager.generate()` with `onToken` streaming
  - Returns a `ReadableStream` of SDK-compatible stream parts
  - Tracks token usage (prompt tokens estimated from prompt length, completion tokens counted)
- `doGenerate(options)`: Non-streaming variant, implemented by collecting `doStream` output

### `src/main/ai/stream-parser.ts`

Stateful parser that converts a stream of Gemma tokens into Vercel AI SDK stream parts. Handles:

- **Regular text**: Emits `text-delta` parts immediately
- **Tool call start** (`<|tool_call>call:`): Begins buffering
- **Tool call end** (`<tool_call|>`): Parses buffered tool call, emits `tool-call-delta` with full args and `tool-call` with parsed name + arguments
- **End of response**: Detects `<eos>`, `<end_of_turn>`, or stream end. Emits `finish` with reason `stop` (no tool calls) or `tool-calls` (tool calls detected)
- **Special tags to strip**: `<|turn>model`, `<turn|>`, `<bos>`, `<|channel>thought...<channel|>`

Key design: the parser buffers tokens when it detects the start of a tag (`<|`), and either emits them as text (if the tag doesn't match a known pattern) or processes them as structured output. This avoids false positives from partial tag matches.

### `src/main/ai/prompt-formatter.ts`

Extracted and adapted from the current `prompt-builder.ts`. Converts Vercel AI SDK message format to Gemma's native prompt format:

- SDK `system` message → `<|turn>system\n{content}{tool_declarations}<turn|>`
- SDK `user` message → `<|turn>user\n{content}<turn|>`
- SDK `assistant` message → `<|turn>model\n{content}<turn|>`
- SDK `assistant` message with tool calls → `<|turn>model\n<|tool_call>call:{name}{args}<tool_call|>`
- SDK `tool` message (tool result) → `<|tool_response>response:{name}{result}<tool_response|>`
- Tool declarations → `<|tool>declaration:{name}{schema}<tool|>` appended to system message

### `src/main/ai/tools.ts`

The 6 folk tools rewritten using Vercel AI SDK's `tool()` function with Zod parameter schemas:

```ts
import { tool } from 'ai'
import { z } from 'zod'

export function createFolkTools(workspacePath: string) {
  return {
    read_file: tool({
      description: 'Read the contents of a file',
      parameters: z.object({ path: z.string().describe('File path relative to workspace') }),
      execute: async ({ path }) => { /* same logic as current */ }
    }),
    write_file: tool({ ... }),
    list_directory: tool({ ... }),
    run_command: tool({ ... }),
    search_files: tool({ ... }),
    search_content: tool({ ... })
  }
}
```

Tool execution logic stays the same as current `folk-tools.ts`. The workspace path sandboxing (preventing paths outside workspace) is preserved.

## Modified Files

### `src/main/agent-manager.ts`

The `handleMessage` method simplifies from ~100 lines to ~40 lines:

```ts
import { streamText } from 'ai'
import { createWebGPUModel } from './ai/webgpu-provider'
import { createFolkTools } from './ai/tools'

// In handleMessage:
const model = createWebGPUModel(this.inference)
const tools = createFolkTools(workspacePath)

const result = streamText({
  model,
  tools,
  maxSteps: 10,
  system: SYSTEM_PROMPT,
  messages: this.getConversationMessages(conversationId),
  onChunk: ({ chunk }) => {
    if (chunk.type === 'text-delta') {
      win?.webContents.send('agent:token', { conversationId, token: chunk.textDelta })
    }
  },
  onStepFinish: ({ toolCalls, toolResults }) => {
    // Forward tool events to renderer
    for (const tc of toolCalls ?? []) {
      win?.webContents.send('agent:tool-start', { conversationId, toolCall: { id: tc.toolCallId, toolName: tc.toolName, input: tc.args } })
    }
    for (const tr of toolResults ?? []) {
      win?.webContents.send('agent:tool-result', { conversationId, toolCall: { id: tr.toolCallId, toolName: tr.toolName, output: tr.result, status: 'success', durationMs: 0 } })
    }
  }
})

await result.text // Wait for completion
```

Conversation history management changes from custom `ConversationMessage[]` to Vercel AI SDK's `CoreMessage[]` format. The `AgentLoop` class is removed — `streamText` with `maxSteps` replaces it entirely.

## Deleted Files

- `src/main/agent/agent-loop.ts` — replaced by `streamText` + `maxSteps`
- `src/main/agent/prompt-builder.ts` — logic moved to `src/main/ai/prompt-formatter.ts`
- `src/main/agent/tool-parser.ts` — logic moved to `src/main/ai/stream-parser.ts`
- `src/main/agent/types.ts` — replaced by Vercel AI SDK types
- `src/main/agent/folk-tools.ts` — replaced by `src/main/ai/tools.ts`

The `src/main/agent/` directory is removed entirely.

## Dependencies

Add to `package.json`:
- `ai` — Vercel AI SDK core (`streamText`, `generateText`, `tool`, `LanguageModelV1`)
- `zod` — Schema validation (required by `tool()`)

## Error Handling

- **Model not loaded**: `doStream` throws, SDK propagates error, AgentManager catches and sends `agent:error` to renderer (same as current behavior)
- **Tool execution failure**: Tool returns error object, SDK includes it in conversation, model sees the error and can retry or report it
- **Stream parse failure** (malformed tool call tags): Stream parser emits buffered content as regular text and continues. The SDK treats it as a text response with no tool calls.
- **Abort**: `InferenceManager.abort()` is called, stream ends, SDK's `AbortSignal` handling kicks in

## Testing

- Verify prompt formatter produces correct Gemma format from SDK messages
- Verify stream parser correctly splits text vs tool call tokens
- Verify stream parser handles partial tags and malformed output gracefully
- Verify tools execute with workspace sandboxing
- Verify `streamText` with `maxSteps` loops correctly through tool calls
- Verify token streaming reaches the renderer UI
- Verify abort cancels the stream mid-generation
