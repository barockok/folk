// Local HTTP proxy that bridges Anthropic Messages requests from the Claude
// Code SDK to OpenCode's OpenAI-format chat/completions endpoint. Listens on
// 127.0.0.1 only — never exposed to the network. Translation logic in
// translator.ts is ported from 9router (MIT). See NOTICE.md.

import { createServer, Server, IncomingMessage, ServerResponse } from 'node:http'
import { AddressInfo } from 'node:net'
import { randomUUID } from 'node:crypto'
import {
  AnthropicRequest,
  ClaudeStreamState,
  OpenAIChunk,
  claudeToOpenAIRequest,
  newStreamState,
  openaiChunkToClaudeEvents
} from './translator'
import { getLogger } from './logger'

const OPENCODE_BASE = 'https://opencode.ai/zen'
const FREE_TOKEN = 'public'
const HEADER_AUTH = 'authorization'
const HEADER_OPENCODE_CLIENT = 'x-opencode-client'
const DRAIN_TIMEOUT_MS = 5000

// Retry config for transient upstream errors. opencode.ai sometimes drops the
// initial connection (TLS reset / rate-limit shed) and a quick retry typically
// goes through. Don't retry on parsed HTTP error responses — those are real.
const FETCH_RETRY_DELAYS_MS = [250, 750]
const RETRYABLE_FETCH_PATTERNS = [
  'fetch failed',
  'ECONNRESET',
  'ETIMEDOUT',
  'EPIPE',
  'ENOTFOUND',
  'EAI_AGAIN',
  'socket hang up'
]

function isRetryableFetchError(err: Error): boolean {
  const msg = `${err.message} ${(err as Error & { cause?: { code?: string } }).cause?.code ?? ''}`
  return RETRYABLE_FETCH_PATTERNS.some((p) => msg.includes(p))
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  reqId: string
): Promise<Response> {
  let lastErr: Error | null = null
  for (let attempt = 0; attempt <= FETCH_RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await fetch(url, init)
    } catch (err) {
      lastErr = err as Error
      // Don't retry once the caller aborted — that's a cancel, not a flake.
      if (lastErr.name === 'AbortError') throw lastErr
      const retryable = isRetryableFetchError(lastErr)
      if (!retryable || attempt === FETCH_RETRY_DELAYS_MS.length) throw lastErr
      const delay = FETCH_RETRY_DELAYS_MS[attempt]
      getLogger().warn('upstream_retry', {
        reqId,
        attempt: attempt + 1,
        delay_ms: delay,
        error: lastErr.message
      })
      await new Promise((r) => setTimeout(r, delay))
    }
  }
  throw lastErr ?? new Error('unreachable')
}

export interface ProxyHandle {
  port: number
  close: () => Promise<void>
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function writeSseEvent(res: ServerResponse, payload: { type: string; [k: string]: unknown }): void {
  res.write(`event: ${payload.type}\n`)
  res.write(`data: ${JSON.stringify(payload)}\n\n`)
}

async function* parseOpenAISSE(stream: ReadableStream<Uint8Array>): AsyncGenerator<OpenAIChunk> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let idx: number
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const event = buffer.slice(0, idx)
      buffer = buffer.slice(idx + 2)
      const dataLines = event
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trim())
      const joined = dataLines.join('\n')
      if (!joined) continue
      if (joined === '[DONE]') return
      try {
        yield JSON.parse(joined) as OpenAIChunk
      } catch (err) {
        getLogger().warn('sse_parse_failed', {
          line_excerpt: joined.slice(0, 200),
          error: (err as Error).message
        })
      }
    }
  }
}

async function handleMessages(
  req: IncomingMessage,
  res: ServerResponse,
  reqId: string
): Promise<void> {
  const log = getLogger()
  const startedAt = Date.now()

  // Tie upstream lifetime to the client connection. When the SDK aborts
  // (user clicked Stop), Node fires `close` on the incoming request before
  // we've finished streaming — abort the upstream fetch so we stop pulling
  // tokens we'll never deliver.
  const abort = new AbortController()
  let clientClosed = false
  req.on('close', () => {
    clientClosed = true
    if (!abort.signal.aborted) {
      abort.abort()
      log.info('client_closed', { reqId, ms: Date.now() - startedAt })
    }
  })

  let bodyText: string
  try {
    bodyText = await readBody(req)
  } catch (err) {
    log.error('read_body_failed', { reqId, error: (err as Error).message })
    res.statusCode = 400
    res.end(`bad body: ${(err as Error).message}`)
    return
  }

  let claudeBody: AnthropicRequest
  try {
    claudeBody = JSON.parse(bodyText) as AnthropicRequest
  } catch (err) {
    log.error('parse_body_failed', { reqId, error: (err as Error).message })
    res.statusCode = 400
    res.end(`bad JSON: ${(err as Error).message}`)
    return
  }

  const incomingAuth =
    (req.headers[HEADER_AUTH] as string | undefined) ||
    ((req.headers['x-api-key'] as string | undefined)
      ? `Bearer ${req.headers['x-api-key']}`
      : undefined)
  const upstreamAuth = incomingAuth ?? `Bearer ${FREE_TOKEN}`
  const tokenForLog =
    upstreamAuth === `Bearer ${FREE_TOKEN}` ? 'public' : 'redacted'

  const stream = claudeBody.stream ?? true
  const openaiBody = claudeToOpenAIRequest(claudeBody, stream)

  log.info('request_in', {
    reqId,
    model: claudeBody.model,
    stream,
    auth: tokenForLog,
    tools: claudeBody.tools?.length ?? 0,
    messages: claudeBody.messages?.length ?? 0,
    has_system: !!claudeBody.system
  })

  let upstreamRes: Response
  const upstreamUrl = `${OPENCODE_BASE}/v1/chat/completions`
  try {
    upstreamRes = await fetchWithRetry(
      upstreamUrl,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: upstreamAuth,
          [HEADER_OPENCODE_CLIENT]: 'desktop',
          Accept: stream ? 'text/event-stream' : 'application/json'
        },
        body: JSON.stringify(openaiBody),
        signal: abort.signal
      },
      reqId
    )
  } catch (err) {
    if (clientClosed || (err as Error).name === 'AbortError') {
      // Nothing to send back — caller is gone.
      log.info('upstream_aborted', { reqId, ms: Date.now() - startedAt })
      try {
        res.end()
      } catch {
        // socket already closed
      }
      return
    }
    log.error('upstream_fetch_failed', {
      reqId,
      url: upstreamUrl,
      error: (err as Error).message
    })
    res.statusCode = 502
    res.setHeader('Content-Type', 'application/json')
    res.end(
      JSON.stringify({
        type: 'error',
        error: { type: 'upstream_unreachable', message: (err as Error).message }
      })
    )
    return
  }

  if (!upstreamRes.ok || !upstreamRes.body) {
    const errBody = await upstreamRes.text().catch(() => '')
    log.error('upstream_http_error', {
      reqId,
      url: upstreamUrl,
      status: upstreamRes.status,
      body_excerpt: errBody.slice(0, 500)
    })
    res.statusCode = upstreamRes.status
    res.setHeader('Content-Type', 'application/json')
    res.end(
      JSON.stringify({
        type: 'error',
        error: {
          type: 'upstream_error',
          status: upstreamRes.status,
          message: errBody || `HTTP ${upstreamRes.status}`
        }
      })
    )
    return
  }

  if (!stream) {
    const json = (await upstreamRes.json()) as {
      id?: string
      model?: string
      choices?: Array<{ message?: { content?: string }; finish_reason?: string }>
    }
    const text = json.choices?.[0]?.message?.content ?? ''
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(
      JSON.stringify({
        id: json.id || `msg_${Date.now()}`,
        type: 'message',
        role: 'assistant',
        model: json.model ?? claudeBody.model,
        content: [{ type: 'text', text }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 0, output_tokens: 0 }
      })
    )
    log.info('request_done', {
      reqId,
      stream: false,
      ms: Date.now() - startedAt
    })
    return
  }

  res.statusCode = 200
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders?.()

  const state: ClaudeStreamState = newStreamState()
  let chunksOut = 0
  let toolCallsSeen = 0
  try {
    for await (const chunk of parseOpenAISSE(upstreamRes.body)) {
      if (clientClosed) break
      const events = openaiChunkToClaudeEvents(chunk, state)
      if (!events) continue
      for (const ev of events) {
        if (clientClosed) break
        const e = ev as { type: string }
        if (e.type === 'content_block_start') {
          const block = (ev as { content_block?: { type?: string } }).content_block
          if (block?.type === 'tool_use') toolCallsSeen += 1
        }
        writeSseEvent(res, e)
        chunksOut += 1
      }
    }
  } catch (err) {
    if (clientClosed || (err as Error).name === 'AbortError') {
      log.info('stream_aborted', { reqId, ms: Date.now() - startedAt, events_out: chunksOut })
    } else {
      log.error('stream_error', {
        reqId,
        error: (err as Error).message
      })
      try {
        writeSseEvent(res, {
          type: 'error',
          error: { type: 'stream_error', message: (err as Error).message }
        })
      } catch {
        // socket already closed
      }
    }
  }

  try {
    res.end()
  } catch {
    // socket already closed
  }
  if (!clientClosed) {
    log.info('request_done', {
      reqId,
      stream: true,
      ms: Date.now() - startedAt,
      events_out: chunksOut,
      tool_calls: toolCallsSeen,
      finish_reason: state.finishReason
    })
  }
}

export async function startProxy(): Promise<ProxyHandle> {
  const log = getLogger()
  const inFlight = new Set<ServerResponse>()

  const server: Server = createServer(async (req, res) => {
    const reqId = randomUUID().slice(0, 8)

    if (req.method === 'POST' && req.url && req.url.startsWith('/v1/messages')) {
      inFlight.add(res)
      res.on('close', () => inFlight.delete(res))
      try {
        await handleMessages(req, res, reqId)
      } catch (err) {
        log.error('handler_crashed', { reqId, error: (err as Error).message })
        if (!res.headersSent) {
          res.statusCode = 500
          res.end((err as Error).message)
        } else {
          try {
            res.end()
          } catch {
            // socket already closed
          }
        }
      } finally {
        inFlight.delete(res)
      }
      return
    }

    if (req.method === 'GET' && req.url === '/health') {
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: true, inFlight: inFlight.size }))
      return
    }

    if (req.method === 'GET' && req.url === '/v1/models') {
      // SDK occasionally probes /v1/models; return empty list so it doesn't 404.
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ data: [] }))
      return
    }

    res.statusCode = 404
    res.end('not found')
  })

  server.on('error', (err) => {
    log.error('server_error', { error: (err as Error).message })
  })
  server.on('clientError', (err, socket) => {
    log.warn('client_error', { error: (err as Error).message })
    try {
      socket.destroy()
    } catch {
      // socket already gone
    }
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })

  const addr = server.address() as AddressInfo
  log.info('listening', { host: '127.0.0.1', port: addr.port })

  const close = async (): Promise<void> => {
    log.info('shutdown_start', { in_flight: inFlight.size })
    // Stop accepting new connections.
    await new Promise<void>((resolve) => {
      server.close(() => resolve())
    })
    // Drain in-flight responses, then force-close after timeout.
    const drainStart = Date.now()
    while (inFlight.size > 0 && Date.now() - drainStart < DRAIN_TIMEOUT_MS) {
      await new Promise((r) => setTimeout(r, 100))
    }
    if (inFlight.size > 0) {
      log.warn('shutdown_force_close', { abandoned: inFlight.size })
      for (const res of inFlight) {
        try {
          res.end()
        } catch {
          // ignore
        }
      }
    }
    log.info('shutdown_done', { ms: Date.now() - drainStart })
  }

  return { port: addr.port, close }
}
