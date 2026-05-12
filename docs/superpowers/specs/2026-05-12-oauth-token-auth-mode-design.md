# CLAUDE_OAUTH_TOKEN Auth Mode

## Goal

Add a third Anthropic authentication mode — `oauth-token` — so users can paste a `CLAUDE_OAUTH_TOKEN` value directly into folk's model settings and onboarding wizard instead of using an API key or the `claude auth login` keychain flow.

## Type Change

`src/shared/types.ts`:
```ts
export type ProviderAuthMode = 'api-key' | 'claude-code' | 'oauth-token'
```

## agent-manager.ts

New branch in `#buildEnvOverlay` after clearing `ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN`:

```ts
} else if (provider.authMode === 'oauth-token') {
  if (!provider.apiKey) throw new Error(`OAuth token for "${provider.name}" is missing.`)
  envOverlay.CLAUDE_OAUTH_TOKEN = provider.apiKey
}
```

No `baseUrl` override needed — uses `https://api.anthropic.com` default.

## ipc-handlers.ts — providers:test

`oauth-token` mode: cannot probe the Anthropic REST API with an OAuth token (it expects `x-api-key`). Return `{ ok: true }` if `apiKey` is non-empty, `{ ok: false, error: 'OAuth token is empty' }` otherwise. No network call.

## UI — ModelPage.tsx

**AddProviderModal** and **provider detail panel** both show a 3-col grid for Anthropic auth:

| API key | OAuth token | Claude Code login |
|---------|-------------|-------------------|

- "OAuth token" card: `name` = "OAuth token", `desc` = "Paste a CLAUDE_OAUTH_TOKEN"
- Selecting it shows the same password input as API key, label "OAuth token"
- `needsKey` logic: `authMode !== 'claude-code'` (api-key and oauth-token both require a value)

## UI — FirstRunOnboarding.tsx

Step 3 auth selector: same 3-col grid. Same `needsKey` / `canFinish` logic update.

## Validation / Guards

- `needsKey = authMode !== 'claude-code'` (covers both `api-key` and `oauth-token`)
- Save/add disabled until key non-empty when `needsKey`
- No changes to database schema — `auth_mode` column already stores arbitrary strings
