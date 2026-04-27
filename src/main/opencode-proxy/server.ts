// Local HTTP proxy that bridges Anthropic Messages requests from the Claude
// Code SDK to OpenCode's OpenAI-format chat/completions endpoint. Listens on
// 127.0.0.1 only — never exposed to the network. Translation logic in
// translator.ts is ported from 9router (MIT). See NOTICE.md.

import { createServer, Server, IncomingMessage, ServerResponse } from 'node:http'
import { AddressInfo } from 'node:net'
import {
  AnthropicRequest,
  ClaudeStreamState,
  OpenAIChunk,
  claudeToOpenAIRequest,
  newStreamState,
  openaiChunkToClaudeEvents
} from './translator'

const OPENCODE_BASE = 'https://opencode.ai/zen'
const FREE_TOKEN = 'public'
const HEADER_AUTH = 'authorization'
const HEADER_OPENCODE_CLIENT = 'x-opencode-client'

export interface ProxyHandle {
  port: number
  close: () => Promise<void>
}

// Read full request body (Anthropic JSON request).
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

// SSE writer — emits `event: <type>\ndata: <json>\n\n` per Anthropic's spec.
function writeSseEvent(res: ServerResponse, payload: { type: string; [k: string]: unknown }): void {
  res.write(`event: ${payload.type}\n`)
  res.write(`data: ${JSON.stringify(payload)}\n\n`)
}

// Parse OpenAI SSE stream chunk-by-chunk. Yields parsed JSON objects.
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
      // Each event may have multiple "data: <line>" lines; concat them.
      const dataLines = event
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trim())
      const joined = dataLines.join('\n')
      if (!joined) continue
      if (joined === '[DONE]') return
      try {
        yield JSON.parse(joined) as OpenAIChunk
      } catch {
        // Skip malformed line — opencode shouldn't emit but be defensive.
      }
    }
  }
}

async function handleMessages(
  req: IncomingMessage,
  res: ServerResponse,
  log: (msg: string) => void
): Promise<void> {
  let bodyText: string
  try {
    bodyText = await readBody(req)
  } catch (err) {
    res.statusCode = 400
    res.end(`bad body: ${(err as Error).message}`)
    return
  }

  let claudeBody: AnthropicRequest
  try {
    claudeBody = JSON.parse(bodyText) as AnthropicRequest
  } catch (err) {
    res.statusCode = 400
    res.end(`bad JSON: ${(err as Error).message}`)
    return
  }

  // Token forwarding: prefer caller's Authorization (OpenCode Paid), fall
  // back to Bearer public for the free tier. The SDK sets one of x-api-key
  // or Authorization depending on which env var folk populated; we accept
  // either.
  const incomingAuth =
    (req.headers[HEADER_AUTH] as string | undefined) ||
    ((req.headers['x-api-key'] as string | undefined)
      ? `Bearer ${req.headers['x-api-key']}`
      : undefined)
  const upstreamAuth = incomingAuth ?? `Bearer ${FREE_TOKEN}`

  const stream = claudeBody.stream ?? true
  const openaiBody = claudeToOpenAIRequest(claudeBody, stream)

  let upstreamRes: Response
  try {
    upstreamRes = await fetch(`${OPENCODE_BASE}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: upstreamAuth,
        [HEADER_OPENCODE_CLIENT]: 'desktop',
        Accept: stream ? 'text/event-stream' : 'application/json'
      },
      body: JSON.stringify(openaiBody)
    })
  } catch (err) {
    res.statusCode = 502
    res.end(`upstream fetch failed: ${(err as Error).message}`)
    return
  }

  if (!upstreamRes.ok || !upstreamRes.body) {
    const errBody = await upstreamRes.text().catch(() => '')
    log(`upstream HTTP ${upstreamRes.status}: ${errBody.slice(0, 300)}`)
    res.statusCode = upstreamRes.status
    res.setHeader('Content-Type', 'application/json')
    res.end(
      JSON.stringify({
        type: 'error',
        error: { type: 'upstream_error', message: errBody || `HTTP ${upstreamRes.status}` }
      })
    )
    return
  }

  if (!stream) {
    // Non-streaming path: rare for the SDK but still translate full payload.
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
    return
  }

  res.statusCode = 200
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders?.()

  const state: ClaudeStreamState = newStreamState()
  try {
    for await (const chunk of parseOpenAISSE(upstreamRes.body)) {
      const events = openaiChunkToClaudeEvents(chunk, state)
      if (!events) continue
      for (const ev of events) {
        writeSseEvent(res, ev as { type: string })
      }
    }
  } catch (err) {
    log(`stream error: ${(err as Error).message}`)
    writeSseEvent(res, {
      type: 'error',
      error: { type: 'stream_error', message: (err as Error).message }
    })
  }

  res.end()
}

export async function startProxy(): Promise<ProxyHandle> {
  const log = (msg: string): void => {
    console.log(`[opencode-proxy] ${msg}`)
  }

  const server: Server = createServer(async (req, res) => {
    if (req.method === 'POST' && req.url && req.url.startsWith('/v1/messages')) {
      await handleMessages(req, res, log).catch((err) => {
        log(`handler crashed: ${(err as Error).message}`)
        if (!res.headersSent) {
          res.statusCode = 500
          res.end((err as Error).message)
        } else {
          res.end()
        }
      })
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

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })

  const addr = server.address() as AddressInfo
  log(`listening on 127.0.0.1:${addr.port}`)

  return {
    port: addr.port,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve())
      })
  }
}
