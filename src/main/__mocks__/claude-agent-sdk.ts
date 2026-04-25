// Test-only stub for @anthropic-ai/claude-agent-sdk. Aliased from vitest.config.ts.
// Do not import from production code — the electron-vite build uses the real SDK.

export class AbortError extends Error {
  constructor(message = 'aborted') {
    super(message)
    this.name = 'AbortError'
  }
}

// Minimal shape for tests — real SDKMessage is a huge union, but the router
// in AgentManager only peeks at `type` and (for assistant/user) `message.content`.
export type TestSDKMessage =
  | {
      type: 'assistant'
      message: {
        content: Array<
          | { type: 'text'; text: string }
          | { type: 'tool_use'; id: string; name: string; input: unknown }
          | { type: 'thinking'; thinking: string }
        >
      }
      uuid?: string
      session_id?: string
      parent_tool_use_id?: string | null
    }
  | {
      type: 'user'
      message: {
        content: Array<{
          type: 'tool_result'
          tool_use_id: string
          content: unknown
          is_error?: boolean
        }>
      }
      uuid?: string
      session_id?: string
      parent_tool_use_id?: string | null
    }
  | {
      type: 'result'
      subtype: 'success' | 'error'
      is_error?: boolean
      result?: string
      total_cost_usd?: number
      duration_ms?: number
      num_turns?: number
      usage?: {
        input_tokens?: number
        output_tokens?: number
        cache_read_input_tokens?: number
        cache_creation_input_tokens?: number
      }
      uuid?: string
      session_id?: string
    }
  | {
      type: 'compact_boundary'
      compact_metadata?: { trigger?: string }
      uuid?: string
      session_id?: string
    }
  | {
      type: 'tool_progress'
      tool_use_id: string
      tool_name: string
      elapsed_time_seconds: number
      parent_tool_use_id?: string | null
      uuid?: string
      session_id?: string
    }
  | {
      type: 'prompt_suggestion'
      suggestion: string
      uuid?: string
      session_id?: string
    }
  | {
      type: 'rate_limit_event'
      rate_limit_info: {
        status?: string
        resetsAt?: number
        rateLimitType?: string
      }
      uuid?: string
      session_id?: string
    }
  | {
      type: 'system'
      subtype: 'api_retry'
      attempt?: number
      max_retries?: number
      retry_delay_ms?: number
      error?: string
      uuid?: string
      session_id?: string
    }
  | {
      type: 'system'
      subtype: string
      [k: string]: unknown
    }
  | {
      type: 'tool_use_summary'
      summary: string
      preceding_tool_use_ids?: string[]
      uuid?: string
      session_id?: string
    }

export interface MockQuery extends AsyncGenerator<TestSDKMessage, void> {
  interrupt(): Promise<void>
}

type QueryImpl = (params: { prompt: string; options?: Record<string, unknown> }) => MockQuery

function defaultImpl(): MockQuery {
  const items: TestSDKMessage[] = [
    { type: 'assistant', message: { content: [{ type: 'text', text: 'hello' }] } },
    { type: 'result', subtype: 'success', is_error: false, result: 'ok' }
  ]
  return makeQuery(items)
}

export function makeQuery(
  items: TestSDKMessage[],
  opts: { throwBefore?: Error; throwAfter?: Error } = {}
): MockQuery {
  let i = 0
  let aborted = false
  const q = {
    async next(): Promise<IteratorResult<TestSDKMessage, void>> {
      if (aborted) throw new AbortError()
      if (opts.throwBefore && i === 0) throw opts.throwBefore
      if (i >= items.length) {
        if (opts.throwAfter) throw opts.throwAfter
        return { done: true, value: undefined }
      }
      return { done: false, value: items[i++]! }
    },
    async return(): Promise<IteratorResult<TestSDKMessage, void>> {
      aborted = true
      return { done: true, value: undefined }
    },
    async throw(err: unknown): Promise<IteratorResult<TestSDKMessage, void>> {
      aborted = true
      throw err
    },
    [Symbol.asyncIterator](): MockQuery {
      return q
    },
    async interrupt(): Promise<void> {
      aborted = true
    }
  }
  return q as MockQuery
}

let impl: QueryImpl = () => defaultImpl()
let lastOptions: Record<string, unknown> | undefined

export function __setQueryImpl(fn: QueryImpl): void {
  impl = fn
}

export function __resetQueryImpl(): void {
  impl = () => defaultImpl()
  lastOptions = undefined
}

// Test helper — returns the most recent options passed to query(). Used to
// invoke canUseTool from outside the iterable.
export function __getLastOptions(): Record<string, unknown> | undefined {
  return lastOptions
}

export function query(params: { prompt: string; options?: Record<string, unknown> }): MockQuery {
  lastOptions = params.options
  return impl(params)
}

// Re-export the AbortError name for tests; production import lands here too.
export async function getSessionMessages(): Promise<unknown[]> {
  return []
}
