// OAuth 2.1 + PKCE for MCP HTTP servers, per the MCP authorization spec
// (March 2025 draft). Built minimally — enough for popular OAuth-protected
// MCP servers (Linear, Notion, Asana via Composio, etc.) to work.
//
// Flow:
//   1. probeForOAuth(serverUrl)              — hit the URL, parse 401 → metadata URL
//   2. discoverMetadata(metadataUrl)         — fetch resource + auth server metadata
//   3. dynamicallyRegister(meta) [if needed] — POST to registration_endpoint
//   4. runAuthorizationFlow(...)             — open browser, run loopback, return code
//   5. exchangeCode(...)                     — POST /token, get access + refresh
//   6. refreshAccessToken(...)               — refresh grant when expired
//
// Tokens are stored in the macOS Keychain (see ./keychain.ts).

import { createHash, randomBytes } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { shell } from 'electron'
import type { OAuthServerMetadata } from '@shared/types'
import { storeTokens, type StoredTokens } from './keychain'

const CALLBACK_PORT_PRIMARY = 33418
const CALLBACK_PATH = '/folk-oauth-callback'

// ── PKCE helpers ─────────────────────────────────────────────────────────────

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function generatePKCE(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(32))
  const challenge = base64url(createHash('sha256').update(verifier).digest())
  return { verifier, challenge }
}

// ── Metadata discovery ───────────────────────────────────────────────────────

interface ProtectedResourceMetadata {
  authorization_servers?: string[]
  resource?: string
  scopes_supported?: string[]
}

interface AuthServerMetadata {
  authorization_endpoint?: string
  token_endpoint?: string
  registration_endpoint?: string
  scopes_supported?: string[]
  // Some servers expose `code_challenge_methods_supported`; we only support S256.
}

// Probe the server with a request that should return 401 + WWW-Authenticate
// describing where to find OAuth metadata. Returns the metadata URL or null
// if the server doesn't speak OAuth.
export async function probeForOAuth(serverUrl: string): Promise<string | null> {
  let res: Response
  try {
    res = await fetch(serverUrl, { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } })
  } catch {
    return null
  }
  if (res.status !== 401) return null
  const wwwAuth = res.headers.get('www-authenticate')
  if (!wwwAuth) return null
  // Parse `Bearer resource_metadata="<url>"` (also handles `resource=`)
  const match = wwwAuth.match(/resource(?:_metadata)?="([^"]+)"/i)
  if (!match) return null
  return match[1]
}

// Best-effort discovery: fetch the resource metadata, find the authorization
// server, fetch its metadata, normalise into our shared shape.
export async function discoverMetadata(
  metadataUrl: string
): Promise<OAuthServerMetadata | null> {
  let resourceMeta: ProtectedResourceMetadata
  try {
    const r = await fetch(metadataUrl)
    if (!r.ok) return null
    resourceMeta = (await r.json()) as ProtectedResourceMetadata
  } catch {
    return null
  }
  const authServerUrl = resourceMeta.authorization_servers?.[0]
  if (!authServerUrl) return null

  // Conventional .well-known path if the URL doesn't already include one.
  const asMetaUrl = authServerUrl.includes('/.well-known/')
    ? authServerUrl
    : authServerUrl.replace(/\/$/, '') + '/.well-known/oauth-authorization-server'

  let asMeta: AuthServerMetadata
  try {
    const r = await fetch(asMetaUrl)
    if (!r.ok) return null
    asMeta = (await r.json()) as AuthServerMetadata
  } catch {
    return null
  }

  if (!asMeta.authorization_endpoint || !asMeta.token_endpoint) return null

  return {
    authorizationEndpoint: asMeta.authorization_endpoint,
    tokenEndpoint: asMeta.token_endpoint,
    registrationEndpoint: asMeta.registration_endpoint ?? null,
    scopesSupported: asMeta.scopes_supported,
    resource: resourceMeta.resource
  }
}

// ── Dynamic Client Registration (RFC 7591) ───────────────────────────────────

export async function dynamicallyRegister(
  metadata: OAuthServerMetadata,
  redirectUri: string
): Promise<{ clientId: string; clientSecret?: string }> {
  if (!metadata.registrationEndpoint) {
    throw new Error('Server does not support Dynamic Client Registration. Provide an OAuth Client ID manually in Advanced settings.')
  }
  const body = {
    client_name: 'folk',
    redirect_uris: [redirectUri],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none' // public client (PKCE)
  }
  const res = await fetch(metadata.registrationEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    throw new Error(`Dynamic registration failed: ${res.status} ${await res.text()}`)
  }
  const json = (await res.json()) as { client_id?: string; client_secret?: string }
  if (!json.client_id) throw new Error('Registration response missing client_id')
  return { clientId: json.client_id, clientSecret: json.client_secret }
}

// ── Authorization Code flow (with loopback callback) ─────────────────────────

interface AuthorizationParams {
  metadata: OAuthServerMetadata
  clientId: string
  scopes?: string[]
}

interface AuthorizationResult {
  code: string
  codeVerifier: string
  redirectUri: string
}

// Open the browser and run a one-shot loopback HTTP server to catch the
// redirect. Resolves when the auth server hits us back with a code, rejects
// on error or 5-minute timeout.
export async function runAuthorizationFlow(
  params: AuthorizationParams
): Promise<AuthorizationResult> {
  const { verifier, challenge } = generatePKCE()
  const state = base64url(randomBytes(16))

  // Bring up the loopback server first so the redirect URL is reachable
  // before the browser opens it.
  const { server, port, waitForCode } = await startLoopbackServer(state)
  const redirectUri = `http://127.0.0.1:${port}${CALLBACK_PATH}`

  const authUrl = new URL(params.metadata.authorizationEndpoint)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('client_id', params.clientId)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('code_challenge', challenge)
  authUrl.searchParams.set('code_challenge_method', 'S256')
  authUrl.searchParams.set('state', state)
  if (params.scopes && params.scopes.length > 0) {
    authUrl.searchParams.set('scope', params.scopes.join(' '))
  }
  if (params.metadata.resource) {
    authUrl.searchParams.set('resource', params.metadata.resource)
  }

  await shell.openExternal(authUrl.toString())

  try {
    const code = await waitForCode()
    return { code, codeVerifier: verifier, redirectUri }
  } finally {
    server.close()
  }
}

interface LoopbackHandle {
  server: ReturnType<typeof createServer>
  port: number
  waitForCode: () => Promise<string>
}

async function startLoopbackServer(expectedState: string): Promise<LoopbackHandle> {
  // Try the conventional port first so users who pre-register a redirect URI
  // can use the standard one. Fall back to an OS-assigned port (only useful
  // if the auth server allows DCR or wildcard loopback redirects).
  const ports = [CALLBACK_PORT_PRIMARY, 0]
  let lastErr: Error | null = null
  for (const requestedPort of ports) {
    try {
      return await tryStartLoopback(requestedPort, expectedState)
    } catch (err) {
      lastErr = err as Error
    }
  }
  throw lastErr ?? new Error('Failed to start OAuth loopback server')
}

function tryStartLoopback(
  requestedPort: number,
  expectedState: string
): Promise<LoopbackHandle> {
  return new Promise((resolve, reject) => {
    let resolveCode: ((code: string) => void) | null = null
    let rejectCode: ((err: Error) => void) | null = null

    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      try {
        const url = new URL(req.url ?? '/', `http://127.0.0.1`)
        if (url.pathname !== CALLBACK_PATH) {
          res.writeHead(404).end('Not found')
          return
        }
        const code = url.searchParams.get('code')
        const state = url.searchParams.get('state')
        const error = url.searchParams.get('error')
        const errorDescription = url.searchParams.get('error_description')
        if (error) {
          res.writeHead(200, { 'content-type': 'text/html' }).end(htmlPage(false, error))
          rejectCode?.(new Error(`${error}${errorDescription ? `: ${errorDescription}` : ''}`))
          return
        }
        if (!code) {
          res.writeHead(400, { 'content-type': 'text/html' }).end(htmlPage(false, 'Missing code'))
          rejectCode?.(new Error('Authorization callback missing code'))
          return
        }
        if (state !== expectedState) {
          res.writeHead(400, { 'content-type': 'text/html' }).end(htmlPage(false, 'State mismatch'))
          rejectCode?.(new Error('OAuth state mismatch — possible CSRF, aborted'))
          return
        }
        res.writeHead(200, { 'content-type': 'text/html' }).end(htmlPage(true))
        resolveCode?.(code)
      } catch (err) {
        rejectCode?.(err as Error)
      }
    })

    server.on('error', (err) => reject(err))
    server.listen(requestedPort, '127.0.0.1', () => {
      const addr = server.address()
      const port = typeof addr === 'object' && addr ? addr.port : requestedPort

      const waitForCode = () =>
        new Promise<string>((res, rej) => {
          resolveCode = res
          rejectCode = rej
          // 5-minute window — generous for users who get pulled away mid-flow.
          setTimeout(() => rej(new Error('OAuth flow timed out')), 5 * 60 * 1000)
        })

      resolve({ server, port, waitForCode })
    })
  })
}

function htmlPage(success: boolean, error?: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>folk</title>
<style>
body { font: 15px -apple-system, BlinkMacSystemFont, sans-serif; padding: 60px 40px; color: #061b31; background: #f6f9fc; text-align: center; }
.card { max-width: 420px; margin: 0 auto; background: #fff; border: 1px solid #e5edf5; border-radius: 8px; padding: 32px; box-shadow: 0 3px 6px rgba(23,23,23,.06); }
h1 { font-weight: 300; letter-spacing: -.01em; margin: 0 0 8px; font-size: 22px; }
p { color: #64748d; margin: 0; line-height: 1.5; }
.dot { width: 38px; height: 38px; border-radius: 99px; margin: 0 auto 14px; background: ${success ? '#15be53' : '#ea2261'}; display: grid; place-items: center; color: #fff; font-size: 22px; font-weight: 300; }
</style></head><body><div class="card">
<div class="dot">${success ? '✓' : '!'}</div>
<h1>${success ? 'Signed in' : 'Sign-in failed'}</h1>
<p>${success ? 'You can close this window and return to folk.' : (error ?? 'Unknown error')}</p>
</div></body></html>`
}

// ── Token endpoints ──────────────────────────────────────────────────────────

interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
  scope?: string
}

function tokensFromResponse(res: TokenResponse): StoredTokens {
  return {
    accessToken: res.access_token,
    refreshToken: res.refresh_token,
    expiresAt: res.expires_in ? Date.now() + res.expires_in * 1000 : undefined,
    tokenType: res.token_type ?? 'Bearer',
    scope: res.scope
  }
}

export async function exchangeCode(opts: {
  metadata: OAuthServerMetadata
  code: string
  codeVerifier: string
  clientId: string
  clientSecret?: string | null
  redirectUri: string
}): Promise<StoredTokens> {
  const body = new URLSearchParams()
  body.set('grant_type', 'authorization_code')
  body.set('code', opts.code)
  body.set('redirect_uri', opts.redirectUri)
  body.set('client_id', opts.clientId)
  body.set('code_verifier', opts.codeVerifier)
  if (opts.clientSecret) body.set('client_secret', opts.clientSecret)

  const res = await fetch(opts.metadata.tokenEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: body.toString()
  })
  if (!res.ok) {
    throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`)
  }
  return tokensFromResponse((await res.json()) as TokenResponse)
}

export async function refreshAccessToken(opts: {
  metadata: OAuthServerMetadata
  refreshToken: string
  clientId: string
  clientSecret?: string | null
}): Promise<StoredTokens> {
  const body = new URLSearchParams()
  body.set('grant_type', 'refresh_token')
  body.set('refresh_token', opts.refreshToken)
  body.set('client_id', opts.clientId)
  if (opts.clientSecret) body.set('client_secret', opts.clientSecret)

  const res = await fetch(opts.metadata.tokenEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: body.toString()
  })
  if (!res.ok) {
    throw new Error(`Token refresh failed: ${res.status} ${await res.text()}`)
  }
  return tokensFromResponse((await res.json()) as TokenResponse)
}

// ── End-to-end orchestration ─────────────────────────────────────────────────

export interface SignInResult {
  metadata: OAuthServerMetadata
  clientId: string
  clientSecret: string | null
}

// Top-level "sign in" that the IPC handler invokes. Returns the artifacts the
// caller needs to persist on the MCPServer record (metadata, possibly newly
// minted clientId/secret). Tokens themselves are written directly into the
// keychain under `account = <serverId>`.
export async function signIn(opts: {
  serverId: string
  serverUrl: string
  providedClientId: string | null
  providedClientSecret: string | null
  cachedMetadata: OAuthServerMetadata | null
}): Promise<SignInResult> {
  let metadata = opts.cachedMetadata
  if (!metadata) {
    const metaUrl = await probeForOAuth(opts.serverUrl)
    if (!metaUrl) {
      throw new Error('This server does not advertise OAuth (no 401 with resource_metadata).')
    }
    metadata = await discoverMetadata(metaUrl)
    if (!metadata) {
      throw new Error('Could not fetch OAuth metadata from the server.')
    }
  }

  let clientId = opts.providedClientId ?? ''
  let clientSecret = opts.providedClientSecret ?? null
  // Defer redirectUri until we know the loopback port — fold registration
  // into the flow with the actual redirect URI the loopback server binds.
  // To keep this simple, we register with a wildcard-friendly redirect URI:
  // the conventional loopback port is tried first, so use that.
  const initialRedirectUri = `http://127.0.0.1:${CALLBACK_PORT_PRIMARY}${CALLBACK_PATH}`

  if (!clientId) {
    const reg = await dynamicallyRegister(metadata, initialRedirectUri)
    clientId = reg.clientId
    clientSecret = reg.clientSecret ?? null
  }

  const auth = await runAuthorizationFlow({
    metadata,
    clientId,
    scopes: metadata.scopesSupported
  })

  const tokens = await exchangeCode({
    metadata,
    code: auth.code,
    codeVerifier: auth.codeVerifier,
    clientId,
    clientSecret,
    redirectUri: auth.redirectUri
  })

  await storeTokens(opts.serverId, tokens)

  return { metadata, clientId, clientSecret }
}
