import { createServer, type Server } from 'http'
import { shell } from 'electron'
import { URL, URLSearchParams } from 'url'
import crypto from 'crypto'

interface OAuthConfig {
  authorization_endpoint: string
  token_endpoint: string
  registration_endpoint?: string
}

interface OAuthTokens {
  access_token: string
  refresh_token?: string
  expires_in?: number
  token_type: string
  obtained_at: number
}

export class MCPOAuthManager {
  private callbackServer: Server | null = null

  /**
   * Discover OAuth configuration from an MCP server URL.
   * Tries /.well-known/oauth-authorization-server first,
   * then falls back to /.well-known/openid-configuration
   */
  async discoverOAuth(serverUrl: string): Promise<OAuthConfig | null> {
    const base = new URL(serverUrl)
    const origin = base.origin

    // Try MCP OAuth discovery
    for (const path of [
      '/.well-known/oauth-authorization-server',
      '/.well-known/openid-configuration',
    ]) {
      try {
        const res = await fetch(`${origin}${path}`)
        if (res.ok) {
          const config = await res.json()
          if (config.authorization_endpoint && config.token_endpoint) {
            return config as OAuthConfig
          }
        }
      } catch {
        // Try next
      }
    }
    return null
  }

  /**
   * Register a dynamic client if the server supports it.
   */
  async registerClient(
    registrationEndpoint: string,
    redirectUri: string
  ): Promise<{ client_id: string; client_secret?: string }> {
    const res = await fetch(registrationEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: 'Folk Desktop',
        redirect_uris: [redirectUri],
        grant_types: ['authorization_code', 'refresh_code'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
      }),
    })

    if (!res.ok) {
      throw new Error(`Client registration failed: ${res.status}`)
    }
    return res.json()
  }

  /**
   * Start the full OAuth authorization flow.
   * 1. Start local callback server
   * 2. Generate PKCE challenge
   * 3. Open browser for authorization
   * 4. Wait for callback with auth code
   * 5. Exchange code for tokens
   */
  async authorize(
    oauthConfig: OAuthConfig,
    clientId: string,
    clientSecret?: string,
    scopes?: string[]
  ): Promise<OAuthTokens> {
    // Generate PKCE
    const codeVerifier = crypto.randomBytes(32).toString('base64url')
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url')
    const state = crypto.randomBytes(16).toString('hex')

    // Start local callback server
    const { port, waitForCallback } = await this.startCallbackServer(state)
    const redirectUri = `http://127.0.0.1:${port}/callback`

    // If server supports dynamic registration and we don't have a client_id
    if (!clientId && oauthConfig.registration_endpoint) {
      const registration = await this.registerClient(
        oauthConfig.registration_endpoint,
        redirectUri
      )
      clientId = registration.client_id
      clientSecret = registration.client_secret
    }

    // Build authorization URL
    const authUrl = new URL(oauthConfig.authorization_endpoint)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('client_id', clientId)
    authUrl.searchParams.set('redirect_uri', redirectUri)
    authUrl.searchParams.set('state', state)
    authUrl.searchParams.set('code_challenge', codeChallenge)
    authUrl.searchParams.set('code_challenge_method', 'S256')
    if (scopes?.length) {
      authUrl.searchParams.set('scope', scopes.join(' '))
    }

    // Open browser
    console.log(`[OAuth] Opening browser for authorization: ${authUrl.toString()}`)
    await shell.openExternal(authUrl.toString())

    // Wait for callback
    const { code } = await waitForCallback

    // Exchange code for tokens
    const tokenBody = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: codeVerifier,
    })
    if (clientSecret) {
      tokenBody.set('client_secret', clientSecret)
    }

    const tokenRes = await fetch(oauthConfig.token_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenBody.toString(),
    })

    if (!tokenRes.ok) {
      const errorBody = await tokenRes.text()
      throw new Error(`Token exchange failed: ${tokenRes.status} ${errorBody}`)
    }

    const tokenData = await tokenRes.json()

    return {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_in: tokenData.expires_in,
      token_type: tokenData.token_type || 'Bearer',
      obtained_at: Date.now(),
    }
  }

  /**
   * Refresh an access token using a refresh token.
   */
  async refreshToken(
    tokenEndpoint: string,
    refreshToken: string,
    clientId: string,
    clientSecret?: string
  ): Promise<OAuthTokens> {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
    })
    if (clientSecret) {
      body.set('client_secret', clientSecret)
    }

    const res = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })

    if (!res.ok) {
      throw new Error(`Token refresh failed: ${res.status}`)
    }

    const data = await res.json()
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token || refreshToken,
      expires_in: data.expires_in,
      token_type: data.token_type || 'Bearer',
      obtained_at: Date.now(),
    }
  }

  /**
   * Start a temporary local HTTP server to receive the OAuth callback.
   */
  private startCallbackServer(
    expectedState: string
  ): Promise<{ port: number; waitForCallback: Promise<{ code: string }> }> {
    return new Promise((resolveSetup) => {
      let resolveCallback: (value: { code: string }) => void
      let rejectCallback: (err: Error) => void

      const waitForCallback = new Promise<{ code: string }>((resolve, reject) => {
        resolveCallback = resolve
        rejectCallback = reject
      })

      const server = createServer((req, res) => {
        const url = new URL(req.url || '/', `http://127.0.0.1`)

        if (url.pathname === '/callback') {
          const code = url.searchParams.get('code')
          const state = url.searchParams.get('state')
          const error = url.searchParams.get('error')

          if (error) {
            res.writeHead(200, { 'Content-Type': 'text/html' })
            res.end(
              '<html><body><h1>Authorization Failed</h1><p>You can close this tab.</p></body></html>'
            )
            this.stopCallbackServer()
            rejectCallback(new Error(`OAuth error: ${error}`))
            return
          }

          if (state !== expectedState) {
            res.writeHead(400, { 'Content-Type': 'text/html' })
            res.end('<html><body><h1>Invalid State</h1></body></html>')
            return
          }

          if (!code) {
            res.writeHead(400, { 'Content-Type': 'text/html' })
            res.end('<html><body><h1>No Authorization Code</h1></body></html>')
            return
          }

          res.writeHead(200, { 'Content-Type': 'text/html' })
          res.end(
            '<html><body style="background:#0f0f0f;color:#fff;font-family:Inter,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center"><h1 style="font-size:24px;font-weight:600">Connected to Folk</h1><p style="color:rgba(255,255,255,0.6)">You can close this tab and return to the app.</p></div></body></html>'
          )
          this.stopCallbackServer()
          resolveCallback({ code })
        }
      })

      // Timeout after 5 minutes
      const timeout = setTimeout(() => {
        this.stopCallbackServer()
        rejectCallback(new Error('OAuth callback timed out after 5 minutes'))
      }, 5 * 60 * 1000)

      // Clean up timeout when callback received
      waitForCallback.finally(() => clearTimeout(timeout))

      this.callbackServer = server

      server.listen(0, '127.0.0.1', () => {
        const addr = server.address()
        const port = typeof addr === 'object' && addr ? addr.port : 0
        console.log(`[OAuth] Callback server listening on port ${port}`)
        resolveSetup({ port, waitForCallback })
      })
    })
  }

  private stopCallbackServer(): void {
    if (this.callbackServer) {
      this.callbackServer.close()
      this.callbackServer = null
    }
  }
}
