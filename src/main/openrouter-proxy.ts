// Minimal HTTP proxy for OpenRouter sessions.
//
// The Claude Code SDK hardcodes "?beta=true" on the /v1/messages path.
// OpenRouter's Anthropic-compat API doesn't support this query parameter and
// returns an HTML error page (200 status) instead of a proper API response —
// causing the SDK to report "empty or malformed response".
//
// This proxy listens on 127.0.0.1, strips "?beta=true" from the URL before
// forwarding to OpenRouter, and pipes the streaming response back unchanged.

import { createServer, IncomingMessage, ServerResponse, Server } from 'node:http'
import { AddressInfo } from 'node:net'

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1'

let server: Server | null = null
let port: number | null = null

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const rawPath = req.url ?? '/v1/messages'
  // Strip ?beta=true — the only query param the SDK appends that breaks OpenRouter.
  const cleanPath = rawPath.replace(/[?&]beta=true/g, '').replace(/[?&]$/, '')
  const url = OPENROUTER_BASE + cleanPath

  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined

  const headers: Record<string, string> = {}
  for (const [k, v] of Object.entries(req.headers)) {
    const lk = k.toLowerCase()
    // host: wrong for upstream
    // accept-encoding: Node fetch auto-decompresses; forwarding it causes
    //   upstream to compress, Node decompresses on read, then content-encoding
    //   header causes the SDK to double-decompress → ZlibError.
    // anthropic-beta: OpenRouter's compat API doesn't support beta headers
    //   and may return a 200 error body when it sees unknown beta flags.
    if (lk === 'host' || lk === 'accept-encoding' || lk === 'anthropic-beta') continue
    if (typeof v === 'string') headers[k] = v
    else if (Array.isArray(v)) headers[k] = v[0] ?? ''
  }

  try {
    const upstream = await fetch(url, {
      method: req.method ?? 'POST',
      headers,
      body,
      // @ts-expect-error — Node 18 fetch requires duplex for streaming bodies
      duplex: 'half'
    } as RequestInit)

    const upstreamHeaders: Record<string, string> = {}
    upstream.headers.forEach((v, k) => {
      const lk = k.toLowerCase()
      // Node fetch auto-decompresses gzip bodies. Forwarding content-encoding
      // would cause the SDK to attempt a second decompression → ZlibError.
      if (lk === 'transfer-encoding' || lk === 'content-encoding') return
      upstreamHeaders[k] = v
    })
    console.log(`[openrouter-proxy] upstream ${upstream.status} content-type=${upstream.headers.get('content-type')} url=${url}`)
    res.writeHead(upstream.status, upstreamHeaders)

    if (upstream.body) {
      const reader = upstream.body.getReader()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        res.write(value)
      }
    }
    res.end()
  } catch (err) {
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'text/plain' })
    }
    res.end(`OpenRouter proxy error: ${(err as Error).message}`)
  }
}

export function startOpenRouterProxy(): Promise<number> {
  if (port !== null) return Promise.resolve(port)

  return new Promise((resolve, reject) => {
    server = createServer((req, res) => {
      handleRequest(req, res).catch((err) => {
        console.error('[openrouter-proxy] unhandled error:', err)
        if (!res.headersSent) res.writeHead(500).end()
      })
    })

    server.listen(0, '127.0.0.1', () => {
      port = (server!.address() as AddressInfo).port
      console.log(`[openrouter-proxy] listening on 127.0.0.1:${port}`)
      resolve(port)
    })

    server.on('error', (err) => {
      console.error('[openrouter-proxy] server error:', err)
      reject(err)
    })
  })
}

export function stopOpenRouterProxy(): Promise<void> {
  return new Promise((resolve) => {
    if (!server) { resolve(); return }
    server.close(() => {
      server = null
      port = null
      resolve()
    })
  })
}
