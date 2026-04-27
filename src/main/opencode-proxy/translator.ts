// Anthropic Messages <-> OpenAI Chat Completions translation.
//
// Ported from 9router (MIT, https://github.com/decolua/9router):
//   open-sse/translator/request/claude-to-openai.js
//   open-sse/translator/response/openai-to-claude.js
//   open-sse/translator/helpers/maxTokensHelper.js
// See NOTICE.md.

const DEFAULT_MAX_TOKENS = 8192
const DEFAULT_MIN_TOKENS = 4096

// ---------------------------------------------------------------------------
// Anthropic types (subset we touch)
// ---------------------------------------------------------------------------

export interface AnthropicTextBlock {
  type: 'text'
  text: string
}
export interface AnthropicImageBlock {
  type: 'image'
  source?: { type: 'base64'; media_type: string; data: string }
}
export interface AnthropicToolUseBlock {
  type: 'tool_use'
  id: string
  name: string
  input?: Record<string, unknown>
}
export interface AnthropicToolResultBlock {
  type: 'tool_result'
  tool_use_id: string
  content: string | Array<{ type: string; text?: string }> | unknown
}
export type AnthropicContentBlock =
  | AnthropicTextBlock
  | AnthropicImageBlock
  | AnthropicToolUseBlock
  | AnthropicToolResultBlock

export interface AnthropicMessage {
  role: 'user' | 'assistant' | 'tool'
  content: string | AnthropicContentBlock[]
}

export interface AnthropicTool {
  name: string
  description?: string
  input_schema?: Record<string, unknown>
}

export interface AnthropicRequest {
  model: string
  messages?: AnthropicMessage[]
  system?: string | Array<{ text?: string }>
  max_tokens?: number
  temperature?: number
  tools?: AnthropicTool[]
  tool_choice?:
    | 'auto'
    | 'any'
    | string
    | { type: string; name?: string }
  thinking?: { budget_tokens?: number }
  stream?: boolean
}

// ---------------------------------------------------------------------------
// OpenAI types (subset we emit / consume)
// ---------------------------------------------------------------------------

interface OpenAIToolCall {
  id?: string
  index?: number
  type?: 'function'
  function?: { name?: string; arguments?: string }
}

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string | Array<{ type: string; [k: string]: unknown }>
  tool_calls?: OpenAIToolCall[]
  tool_call_id?: string
}

export interface OpenAIRequest {
  model: string
  messages: OpenAIMessage[]
  stream: boolean
  max_tokens?: number
  temperature?: number
  tools?: Array<{
    type: 'function'
    function: { name: string; description: string; parameters: Record<string, unknown> }
  }>
  tool_choice?: 'auto' | 'required' | { type: 'function'; function: { name: string } } | string
}

interface OpenAIDelta {
  content?: string
  reasoning_content?: string
  reasoning?: string
  tool_calls?: OpenAIToolCall[]
}

export interface OpenAIChunk {
  id?: string
  model?: string
  choices?: Array<{ delta?: OpenAIDelta; finish_reason?: string | null }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    prompt_tokens_details?: { cached_tokens?: number; cache_creation_tokens?: number }
  }
}

// ---------------------------------------------------------------------------
// max_tokens adjustment (helpers/maxTokensHelper.js)
// ---------------------------------------------------------------------------

function adjustMaxTokens(body: AnthropicRequest): number {
  let maxTokens = body.max_tokens || DEFAULT_MAX_TOKENS
  if (body.tools && body.tools.length > 0 && maxTokens < DEFAULT_MIN_TOKENS) {
    maxTokens = DEFAULT_MIN_TOKENS
  }
  if (body.thinking?.budget_tokens && maxTokens <= body.thinking.budget_tokens) {
    maxTokens = body.thinking.budget_tokens + 1024
  }
  return maxTokens
}

// ---------------------------------------------------------------------------
// Request: Claude → OpenAI
// ---------------------------------------------------------------------------

export function claudeToOpenAIRequest(body: AnthropicRequest, stream: boolean): OpenAIRequest {
  const result: OpenAIRequest = {
    model: body.model,
    messages: [],
    stream
  }

  if (body.max_tokens) result.max_tokens = adjustMaxTokens(body)
  if (body.temperature !== undefined) result.temperature = body.temperature

  // System message
  if (body.system) {
    const systemContent = Array.isArray(body.system)
      ? body.system.map((s) => s.text || '').join('\n')
      : body.system
    if (systemContent) {
      result.messages.push({ role: 'system', content: systemContent })
    }
  }

  // Convert messages
  if (body.messages && Array.isArray(body.messages)) {
    for (const msg of body.messages) {
      const converted = convertClaudeMessage(msg)
      if (!converted) continue
      if (Array.isArray(converted)) {
        result.messages.push(...converted)
      } else {
        result.messages.push(converted)
      }
    }
  }

  fixMissingToolResponses(result.messages)

  // Tools: Anthropic { name, description, input_schema } → OpenAI { type, function }
  if (body.tools && Array.isArray(body.tools)) {
    result.tools = body.tools.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: String(tool.description || ''),
        parameters: tool.input_schema || { type: 'object', properties: {} }
      }
    }))
  }

  if (body.tool_choice) {
    result.tool_choice = convertToolChoice(body.tool_choice)
  }

  return result
}

function fixMissingToolResponses(messages: OpenAIMessage[]): void {
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    if (msg.role !== 'assistant' || !msg.tool_calls || msg.tool_calls.length === 0) continue
    const toolCallIds = msg.tool_calls
      .map((tc) => tc.id)
      .filter((id): id is string => typeof id === 'string')

    const respondedIds = new Set<string>()
    let insertPosition = i + 1
    for (let j = i + 1; j < messages.length; j++) {
      const next = messages[j]
      if (next.role === 'tool' && next.tool_call_id) {
        respondedIds.add(next.tool_call_id)
        insertPosition = j + 1
      } else {
        break
      }
    }

    const missingIds = toolCallIds.filter((id) => !respondedIds.has(id))
    if (missingIds.length > 0) {
      const missing: OpenAIMessage[] = missingIds.map((id) => ({
        role: 'tool',
        tool_call_id: id,
        content: '[No response received]'
      }))
      messages.splice(insertPosition, 0, ...missing)
      i = insertPosition + missing.length - 1
    }
  }
}

function convertClaudeMessage(msg: AnthropicMessage): OpenAIMessage | OpenAIMessage[] | null {
  const role: 'user' | 'assistant' =
    msg.role === 'user' || msg.role === 'tool' ? 'user' : 'assistant'

  if (typeof msg.content === 'string') {
    return { role, content: msg.content }
  }

  if (Array.isArray(msg.content)) {
    const parts: Array<{ type: string; [k: string]: unknown }> = []
    const toolCalls: OpenAIToolCall[] = []
    const toolResults: OpenAIMessage[] = []

    for (const block of msg.content) {
      switch (block.type) {
        case 'text':
          parts.push({ type: 'text', text: block.text })
          break
        case 'image':
          if (block.source?.type === 'base64') {
            parts.push({
              type: 'image_url',
              image_url: {
                url: `data:${block.source.media_type};base64,${block.source.data}`
              }
            })
          }
          break
        case 'tool_use':
          toolCalls.push({
            id: block.id,
            type: 'function',
            function: {
              name: block.name,
              arguments: JSON.stringify(block.input || {})
            }
          })
          break
        case 'tool_result': {
          let resultContent = ''
          if (typeof block.content === 'string') {
            resultContent = block.content
          } else if (Array.isArray(block.content)) {
            const texts = block.content
              .filter((c) => c.type === 'text' && typeof c.text === 'string')
              .map((c) => c.text as string)
              .join('\n')
            resultContent = texts || JSON.stringify(block.content)
          } else if (block.content) {
            resultContent = JSON.stringify(block.content)
          }
          toolResults.push({
            role: 'tool',
            tool_call_id: block.tool_use_id,
            content: resultContent
          })
          break
        }
      }
    }

    if (toolResults.length > 0) {
      if (parts.length > 0) {
        const textContent =
          parts.length === 1 && parts[0].type === 'text' ? (parts[0].text as string) : parts
        return [...toolResults, { role: 'user', content: textContent }]
      }
      return toolResults
    }

    if (toolCalls.length > 0) {
      const out: OpenAIMessage = { role: 'assistant', tool_calls: toolCalls }
      if (parts.length > 0) {
        out.content =
          parts.length === 1 && parts[0].type === 'text' ? (parts[0].text as string) : parts
      }
      return out
    }

    if (parts.length > 0) {
      return {
        role,
        content:
          parts.length === 1 && parts[0].type === 'text' ? (parts[0].text as string) : parts
      }
    }

    if (msg.content.length === 0) {
      return { role, content: '' }
    }
  }

  return null
}

function convertToolChoice(
  choice: AnthropicRequest['tool_choice']
): OpenAIRequest['tool_choice'] {
  if (!choice) return 'auto'
  if (typeof choice === 'string') return choice
  switch (choice.type) {
    case 'auto':
      return 'auto'
    case 'any':
      return 'required'
    case 'tool':
      return { type: 'function', function: { name: choice.name ?? '' } }
    default:
      return 'auto'
  }
}

// ---------------------------------------------------------------------------
// Response: OpenAI streaming chunk → Claude SSE events
// ---------------------------------------------------------------------------

export interface ClaudeStreamState {
  messageStartSent: boolean
  messageId: string
  model: string
  nextBlockIndex: number
  textBlockStarted: boolean
  textBlockClosed: boolean
  textBlockIndex: number
  thinkingBlockStarted: boolean
  thinkingBlockIndex: number
  toolCalls: Map<number, { id: string; name: string; blockIndex: number }>
  usage: { input_tokens: number; output_tokens: number; [k: string]: number } | null
  finishReason: string | null
}

export function newStreamState(): ClaudeStreamState {
  return {
    messageStartSent: false,
    messageId: '',
    model: '',
    nextBlockIndex: 0,
    textBlockStarted: false,
    textBlockClosed: false,
    textBlockIndex: -1,
    thinkingBlockStarted: false,
    thinkingBlockIndex: -1,
    toolCalls: new Map(),
    usage: null,
    finishReason: null
  }
}

function stopThinkingBlock(state: ClaudeStreamState, results: unknown[]): void {
  if (!state.thinkingBlockStarted) return
  results.push({ type: 'content_block_stop', index: state.thinkingBlockIndex })
  state.thinkingBlockStarted = false
}

function stopTextBlock(state: ClaudeStreamState, results: unknown[]): void {
  if (!state.textBlockStarted || state.textBlockClosed) return
  state.textBlockClosed = true
  results.push({ type: 'content_block_stop', index: state.textBlockIndex })
  state.textBlockStarted = false
}

export function openaiChunkToClaudeEvents(
  chunk: OpenAIChunk,
  state: ClaudeStreamState
): unknown[] | null {
  if (!chunk || !chunk.choices?.[0]) return null
  const results: unknown[] = []
  const choice = chunk.choices[0]
  const delta = choice.delta

  // Track usage if present
  if (chunk.usage && typeof chunk.usage === 'object') {
    const promptTokens = typeof chunk.usage.prompt_tokens === 'number' ? chunk.usage.prompt_tokens : 0
    const outputTokens =
      typeof chunk.usage.completion_tokens === 'number' ? chunk.usage.completion_tokens : 0
    const cachedTokens = chunk.usage.prompt_tokens_details?.cached_tokens
    const cacheCreationTokens = chunk.usage.prompt_tokens_details?.cache_creation_tokens
    const cacheReadTokens = typeof cachedTokens === 'number' ? cachedTokens : 0
    const cacheCreateTokens = typeof cacheCreationTokens === 'number' ? cacheCreationTokens : 0
    const inputTokens = promptTokens - cacheReadTokens - cacheCreateTokens
    state.usage = {
      input_tokens: inputTokens,
      output_tokens: outputTokens
    }
    if (cacheReadTokens > 0) state.usage.cache_read_input_tokens = cacheReadTokens
    if (cacheCreateTokens > 0) state.usage.cache_creation_input_tokens = cacheCreateTokens
  }

  // First chunk — emit message_start
  if (!state.messageStartSent) {
    state.messageStartSent = true
    let msgId = chunk.id?.replace('chatcmpl-', '') || `msg_${Date.now()}`
    if (!msgId || msgId === 'chat' || msgId.length < 8) msgId = `msg_${Date.now()}`
    state.messageId = msgId
    state.model = chunk.model || 'unknown'
    state.nextBlockIndex = 0
    results.push({
      type: 'message_start',
      message: {
        id: state.messageId,
        type: 'message',
        role: 'assistant',
        model: state.model,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 0, output_tokens: 0 }
      }
    })
  }

  const reasoningContent = delta?.reasoning_content || delta?.reasoning
  if (reasoningContent) {
    stopTextBlock(state, results)
    if (!state.thinkingBlockStarted) {
      state.thinkingBlockIndex = state.nextBlockIndex++
      state.thinkingBlockStarted = true
      results.push({
        type: 'content_block_start',
        index: state.thinkingBlockIndex,
        content_block: { type: 'thinking', thinking: '' }
      })
    }
    results.push({
      type: 'content_block_delta',
      index: state.thinkingBlockIndex,
      delta: { type: 'thinking_delta', thinking: reasoningContent }
    })
  }

  if (delta?.content) {
    stopThinkingBlock(state, results)
    if (!state.textBlockStarted) {
      state.textBlockIndex = state.nextBlockIndex++
      state.textBlockStarted = true
      state.textBlockClosed = false
      results.push({
        type: 'content_block_start',
        index: state.textBlockIndex,
        content_block: { type: 'text', text: '' }
      })
    }
    results.push({
      type: 'content_block_delta',
      index: state.textBlockIndex,
      delta: { type: 'text_delta', text: delta.content }
    })
  }

  if (delta?.tool_calls) {
    for (const tc of delta.tool_calls) {
      const idx = tc.index ?? 0
      if (tc.id) {
        stopThinkingBlock(state, results)
        stopTextBlock(state, results)
        const toolBlockIndex = state.nextBlockIndex++
        state.toolCalls.set(idx, {
          id: tc.id,
          name: tc.function?.name || '',
          blockIndex: toolBlockIndex
        })
        results.push({
          type: 'content_block_start',
          index: toolBlockIndex,
          content_block: {
            type: 'tool_use',
            id: tc.id,
            name: tc.function?.name || '',
            input: {}
          }
        })
      }
      if (tc.function?.arguments) {
        const toolInfo = state.toolCalls.get(idx)
        if (toolInfo) {
          results.push({
            type: 'content_block_delta',
            index: toolInfo.blockIndex,
            delta: { type: 'input_json_delta', partial_json: tc.function.arguments }
          })
        }
      }
    }
  }

  if (choice.finish_reason) {
    stopThinkingBlock(state, results)
    stopTextBlock(state, results)
    for (const [, toolInfo] of state.toolCalls) {
      results.push({ type: 'content_block_stop', index: toolInfo.blockIndex })
    }
    state.finishReason = choice.finish_reason
    const finalUsage = state.usage || { input_tokens: 0, output_tokens: 0 }
    results.push({
      type: 'message_delta',
      delta: { stop_reason: convertFinishReason(choice.finish_reason) },
      usage: finalUsage
    })
    results.push({ type: 'message_stop' })
  }

  return results.length > 0 ? results : null
}

function convertFinishReason(reason: string): string {
  switch (reason) {
    case 'stop':
      return 'end_turn'
    case 'length':
      return 'max_tokens'
    case 'tool_calls':
      return 'tool_use'
    default:
      return 'end_turn'
  }
}
