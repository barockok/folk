# OAuth Token Auth Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `oauth-token` as a third Anthropic auth mode so users can paste a `CLAUDE_OAUTH_TOKEN` value in model settings and onboarding instead of using an API key or keychain login.

**Architecture:** Add the literal string `'oauth-token'` to `ProviderAuthMode`, wire the env variable in `agent-manager.ts`, short-circuit the network probe in `ipc-handlers.ts`, then expand the 2-col auth grids in `ModelPage.tsx` and `FirstRunOnboarding.tsx` to a 3-col layout. No DB migration needed — `auth_mode` column already stores arbitrary strings.

**Tech Stack:** TypeScript, Electron main process, React 19, Vitest

---

## File Map

| File | Change |
|------|--------|
| `src/shared/types.ts` | Add `'oauth-token'` to `ProviderAuthMode` union |
| `src/main/agent-manager.ts` | Add `oauth-token` branch in `#buildEnvOverlay` |
| `src/main/agent-manager.test.ts` | Add test verifying `CLAUDE_OAUTH_TOKEN` injected |
| `src/main/ipc-handlers.ts` | Short-circuit `providers:test` for `oauth-token` |
| `src/renderer/src/pages/ModelPage.tsx` | 3-col auth grid in `AddProviderModal` + detail panel |
| `src/renderer/src/onboarding/FirstRunOnboarding.tsx` | 3-col auth grid + oauth-token handling in `handleTest` |

---

### Task 1: Extend `ProviderAuthMode` type

**Files:**
- Modify: `src/shared/types.ts:50`

- [ ] **Step 1: Update the type**

```typescript
// src/shared/types.ts line 50
export type ProviderAuthMode = 'api-key' | 'claude-code' | 'oauth-token'
```

- [ ] **Step 2: Verify no type errors**

```bash
npx tsc --noEmit
```

Expected: 0 errors (the new literal just widens the union; no downstream breakage until we use it).

- [ ] **Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat(auth): add oauth-token to ProviderAuthMode union"
```

---

### Task 2: Inject `CLAUDE_OAUTH_TOKEN` env var in agent-manager

**Files:**
- Modify: `src/main/agent-manager.ts` (~line 370)
- Test: `src/main/agent-manager.test.ts`

- [ ] **Step 1: Write the failing test**

Add this `it` block to the existing `describe('AgentManager.sendMessage', ...)` suite in `src/main/agent-manager.test.ts`, after the last `it(...)` in that suite:

```typescript
it('injects CLAUDE_OAUTH_TOKEN for oauth-token providers', async () => {
  // Replace the api-key provider with an oauth-token one
  db.saveProvider({
    id: 'anthropic',
    name: 'Anthropic',
    apiKey: 'oauth-tok-123',
    authMode: 'oauth-token',
    baseUrl: null,
    models: [{ id: 'm', label: 'M', enabled: true }],
    isEnabled: true,
    createdAt: Date.now()
  })
  __setQueryImpl(() =>
    makeQuery([{ type: 'result', subtype: 'success', is_error: false, result: 'ok' }])
  )
  const s = await mgr.createSession({ modelId: 'm', workingDir: dir })
  void mgr.sendMessage(s.id, 'hi').catch(() => undefined)
  await new Promise((r) => setTimeout(r, 5))
  const opts = __getLastOptions()
  const env = (opts as { env?: Record<string, string | undefined> }).env
  expect(env?.CLAUDE_OAUTH_TOKEN).toBe('oauth-tok-123')
  expect(env?.ANTHROPIC_API_KEY).toBeUndefined()
  expect(env?.ANTHROPIC_AUTH_TOKEN).toBeUndefined()
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/main/agent-manager.test.ts
```

Expected: FAIL — `env?.CLAUDE_OAUTH_TOKEN` is undefined (branch not yet added).

- [ ] **Step 3: Add the oauth-token branch in `#buildEnvOverlay`**

In `src/main/agent-manager.ts`, locate the `else {` block that sets `ANTHROPIC_API_KEY` (currently around line 370). The relevant section looks like:

```typescript
      } else {
        if (!provider.apiKey) throw new Error(`API key for "${provider.name}" is missing or could not be read. Re-enter it in Models settings.`)
        envOverlay.ANTHROPIC_API_KEY = provider.apiKey
      }
```

Replace it with:

```typescript
      } else if (provider.authMode === 'oauth-token') {
        if (!provider.apiKey) throw new Error(`OAuth token for "${provider.name}" is missing.`)
        envOverlay.CLAUDE_OAUTH_TOKEN = provider.apiKey
      } else {
        if (!provider.apiKey) throw new Error(`API key for "${provider.name}" is missing or could not be read. Re-enter it in Models settings.`)
        envOverlay.ANTHROPIC_API_KEY = provider.apiKey
      }
```

The full surrounding context to confirm insertion point:

```typescript
      } else if (usesBearer) {
        if (!provider.apiKey) throw new Error(`API key for "${provider.name}" is missing or could not be read. Re-enter it in Models settings.`)
        envOverlay.ANTHROPIC_AUTH_TOKEN = provider.apiKey
      } else if (provider.authMode === 'oauth-token') {   // <-- NEW
        if (!provider.apiKey) throw new Error(`OAuth token for "${provider.name}" is missing.`)
        envOverlay.CLAUDE_OAUTH_TOKEN = provider.apiKey
      } else {
        if (!provider.apiKey) throw new Error(`API key for "${provider.name}" is missing or could not be read. Re-enter it in Models settings.`)
        envOverlay.ANTHROPIC_API_KEY = provider.apiKey
      }
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run src/main/agent-manager.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Run the full typecheck**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/main/agent-manager.ts src/main/agent-manager.test.ts
git commit -m "feat(auth): inject CLAUDE_OAUTH_TOKEN env var for oauth-token providers"
```

---

### Task 3: Short-circuit `providers:test` for oauth-token

**Files:**
- Modify: `src/main/ipc-handlers.ts` (~line 267)

No unit test exists for IPC handlers — verified manually.

- [ ] **Step 1: Add the oauth-token early return**

In `src/main/ipc-handlers.ts`, find the `providers:test` handler. After the `if (p.authMode === 'claude-code') { ... }` block (currently ending around line 272), add:

```typescript
    if (p.authMode === 'oauth-token') {
      return p.apiKey
        ? { ok: true }
        : { ok: false, error: 'OAuth token is empty' }
    }
```

Full insertion context:

```typescript
  ipcMain.handle('providers:test', async (_e, id: string) => {
    const p = db.listProviders().find((x) => x.id === id)
    if (!p) return { ok: false, error: 'not found' }
    if (p.authMode === 'claude-code') {
      const status = await detectClaudeCodeAuth()
      return status.loggedIn
        ? { ok: true }
        : { ok: false, error: 'Claude Code login not found — run `claude login` in a terminal' }
    }
    if (p.authMode === 'oauth-token') {          // <-- NEW
      return p.apiKey                            // <-- NEW
        ? { ok: true }                           // <-- NEW
        : { ok: false, error: 'OAuth token is empty' }  // <-- NEW
    }                                            // <-- NEW
    // Probe shape depends on the provider's API style.
    // ...
```

- [ ] **Step 2: Verify typecheck is clean**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/main/ipc-handlers.ts
git commit -m "feat(auth): skip network probe for oauth-token in providers:test"
```

---

### Task 4: AddProviderModal — 3-col auth grid

**Files:**
- Modify: `src/renderer/src/pages/ModelPage.tsx` (~lines 204–347)

- [ ] **Step 1: Fix `needsKey` logic in AddProviderModal**

Find (around line 204):

```typescript
  const needsKey =
    !(selectedId === 'anthropic' && authMode === 'claude-code') && !preset?.noAuth
```

Replace with:

```typescript
  const needsKey = authMode !== 'claude-code' && !preset?.noAuth
```

- [ ] **Step 2: Expand the auth grid to 3 columns**

Find the auth selector block (around line 307–347):

```typescript
              {selectedId === 'anthropic' && (
                <div className="field">
                  <label className="label">How to authenticate</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <button
                      type="button"
                      className={'model-opt' + (authMode === 'api-key' ? ' on' : '')}
                      onClick={() => setAuthMode('api-key')}
                      style={{ padding: 12, textAlign: 'left' }}
                    >
                      <span className="name" style={{ fontSize: 13 }}>API key</span>
                      <span className="desc" style={{ fontSize: 11, marginTop: 2 }}>
                        Paste an Anthropic API key
                      </span>
                    </button>
                    <button
                      type="button"
                      className={'model-opt' + (authMode === 'claude-code' ? ' on' : '')}
                      onClick={() => {
                        setAuthMode('claude-code')
                        if (!ccStatus?.loggedIn) void login()
                      }}
                      style={{ padding: 12, textAlign: 'left' }}
                    >
                      <span className="name" style={{ fontSize: 13 }}>Use Claude Code login</span>
                      <span className="desc" style={{ fontSize: 11, marginTop: 2 }}>
                        {authMode === 'claude-code'
                          ? ccStatus == null
                            ? 'Checking status…'
                            : ccStatus.loggedIn
                              ? `Logged in${ccStatus.email ? ` as ${ccStatus.email}` : ''}`
                              : loggingIn
                                ? 'Opening browser…'
                                : loginError
                                  ? `Error: ${loginError}`
                                  : 'Not logged in'
                          : 'Reuse your existing subscription'}
                      </span>
                    </button>
                  </div>
                </div>
              )}
```

Replace the entire block with:

```typescript
              {selectedId === 'anthropic' && (
                <div className="field">
                  <label className="label">How to authenticate</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                    <button
                      type="button"
                      className={'model-opt' + (authMode === 'api-key' ? ' on' : '')}
                      onClick={() => setAuthMode('api-key')}
                      style={{ padding: 12, textAlign: 'left' }}
                    >
                      <span className="name" style={{ fontSize: 13 }}>API key</span>
                      <span className="desc" style={{ fontSize: 11, marginTop: 2 }}>
                        Paste an Anthropic API key
                      </span>
                    </button>
                    <button
                      type="button"
                      className={'model-opt' + (authMode === 'oauth-token' ? ' on' : '')}
                      onClick={() => setAuthMode('oauth-token')}
                      style={{ padding: 12, textAlign: 'left' }}
                    >
                      <span className="name" style={{ fontSize: 13 }}>OAuth token</span>
                      <span className="desc" style={{ fontSize: 11, marginTop: 2 }}>
                        Paste a CLAUDE_OAUTH_TOKEN
                      </span>
                    </button>
                    <button
                      type="button"
                      className={'model-opt' + (authMode === 'claude-code' ? ' on' : '')}
                      onClick={() => {
                        setAuthMode('claude-code')
                        if (!ccStatus?.loggedIn) void login()
                      }}
                      style={{ padding: 12, textAlign: 'left' }}
                    >
                      <span className="name" style={{ fontSize: 13 }}>Use Claude Code login</span>
                      <span className="desc" style={{ fontSize: 11, marginTop: 2 }}>
                        {authMode === 'claude-code'
                          ? ccStatus == null
                            ? 'Checking status…'
                            : ccStatus.loggedIn
                              ? `Logged in${ccStatus.email ? ` as ${ccStatus.email}` : ''}`
                              : loggingIn
                                ? 'Opening browser…'
                                : loginError
                                  ? `Error: ${loginError}`
                                  : 'Not logged in'
                          : 'Reuse your existing subscription'}
                      </span>
                    </button>
                  </div>
                </div>
              )}
```

- [ ] **Step 3: Update the key input label in AddProviderModal**

Find (around line 358–360):

```typescript
              ) : needsKey ? (
                <div className="field">
                  <label className="label">{preset?.keyLabel ?? 'API key'}</label>
```

Replace the label line with:

```typescript
                  <label className="label">{authMode === 'oauth-token' ? 'OAuth token' : (preset?.keyLabel ?? 'API key')}</label>
```

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/pages/ModelPage.tsx
git commit -m "feat(auth): 3-col auth grid + OAuth token card in AddProviderModal"
```

---

### Task 5: Provider detail panel — 3-col auth grid

**Files:**
- Modify: `src/renderer/src/pages/ModelPage.tsx` (~lines 694–755)

- [ ] **Step 1: Expand the detail panel auth grid to 3 columns**

Find the detail panel auth selector block (around line 694–736):

```typescript
            {active.id === 'anthropic' && (
              <div className="field">
                <label className="label">How to authenticate</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <button
                    type="button"
                    className={'model-opt' + (draft.authMode !== 'claude-code' ? ' on' : '')}
                    onClick={() => updateDraft({ authMode: 'api-key' })}
                    style={{ padding: 12, textAlign: 'left' }}
                  >
                    <span className="name" style={{ fontSize: 13 }}>API key</span>
                    <span className="desc" style={{ fontSize: 11, marginTop: 2 }}>
                      Paste an Anthropic API key
                    </span>
                  </button>
                  <button
                    type="button"
                    className={'model-opt' + (draft.authMode === 'claude-code' ? ' on' : '')}
                    onClick={async () => {
                      const updated = { ...draft, authMode: 'claude-code' as const, apiKey: '' }
                      updateDraft({ authMode: 'claude-code', apiKey: '' })
                      await save(updated)
                      if (!ccStatus?.loggedIn) void login()
                    }}
                    style={{ padding: 12, textAlign: 'left' }}
                  >
                    <span className="name" style={{ fontSize: 13 }}>Use Claude Code login</span>
                    <span className="desc" style={{ fontSize: 11, marginTop: 2 }}>
                      {draft.authMode === 'claude-code'
                        ? ccStatus == null
                          ? 'Checking status…'
                          : ccStatus.loggedIn
                            ? `Logged in${ccStatus.email ? ` as ${ccStatus.email}` : ''}`
                            : loggingIn
                              ? 'Opening browser…'
                              : loginError
                                ? `Error: ${loginError}`
                                : 'Not logged in'
                        : 'Reuse your existing subscription'}
                    </span>
                  </button>
                </div>
              </div>
            )}
```

Replace with:

```typescript
            {active.id === 'anthropic' && (
              <div className="field">
                <label className="label">How to authenticate</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  <button
                    type="button"
                    className={'model-opt' + (draft.authMode === 'api-key' ? ' on' : '')}
                    onClick={() => updateDraft({ authMode: 'api-key' })}
                    style={{ padding: 12, textAlign: 'left' }}
                  >
                    <span className="name" style={{ fontSize: 13 }}>API key</span>
                    <span className="desc" style={{ fontSize: 11, marginTop: 2 }}>
                      Paste an Anthropic API key
                    </span>
                  </button>
                  <button
                    type="button"
                    className={'model-opt' + (draft.authMode === 'oauth-token' ? ' on' : '')}
                    onClick={() => updateDraft({ authMode: 'oauth-token' })}
                    style={{ padding: 12, textAlign: 'left' }}
                  >
                    <span className="name" style={{ fontSize: 13 }}>OAuth token</span>
                    <span className="desc" style={{ fontSize: 11, marginTop: 2 }}>
                      Paste a CLAUDE_OAUTH_TOKEN
                    </span>
                  </button>
                  <button
                    type="button"
                    className={'model-opt' + (draft.authMode === 'claude-code' ? ' on' : '')}
                    onClick={async () => {
                      const updated = { ...draft, authMode: 'claude-code' as const, apiKey: '' }
                      updateDraft({ authMode: 'claude-code', apiKey: '' })
                      await save(updated)
                      if (!ccStatus?.loggedIn) void login()
                    }}
                    style={{ padding: 12, textAlign: 'left' }}
                  >
                    <span className="name" style={{ fontSize: 13 }}>Use Claude Code login</span>
                    <span className="desc" style={{ fontSize: 11, marginTop: 2 }}>
                      {draft.authMode === 'claude-code'
                        ? ccStatus == null
                          ? 'Checking status…'
                          : ccStatus.loggedIn
                            ? `Logged in${ccStatus.email ? ` as ${ccStatus.email}` : ''}`
                            : loggingIn
                              ? 'Opening browser…'
                              : loginError
                                ? `Error: ${loginError}`
                                : 'Not logged in'
                        : 'Reuse your existing subscription'}
                    </span>
                  </button>
                </div>
              </div>
            )}
```

- [ ] **Step 2: Fix the "API key selected" check and key label in the detail panel**

The existing code around line 700 uses `draft.authMode !== 'claude-code'` to determine if the key input should show. That condition already covers `oauth-token` (any non-claude-code mode shows the input). The only thing to fix is the label.

Find (around line 754–755):

```typescript
              <div className="field">
                <label className="label">{preset?.keyLabel ?? 'API key'}</label>
```

Replace the label line with:

```typescript
                <label className="label">{draft.authMode === 'oauth-token' ? 'OAuth token' : (preset?.keyLabel ?? 'API key')}</label>
```

- [ ] **Step 3: Fix the "show fetch models" check**

The detail panel currently shows the fetch-models button for `draft.authMode !== 'claude-code'` (line ~808). This is already correct — oauth-token providers can fetch models too. No change needed.

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/pages/ModelPage.tsx
git commit -m "feat(auth): 3-col auth grid + OAuth token card in provider detail panel"
```

---

### Task 6: FirstRunOnboarding — 3-col auth grid + oauth-token verify

**Files:**
- Modify: `src/renderer/src/onboarding/FirstRunOnboarding.tsx`

- [ ] **Step 1: Expand the onboarding auth grid to 3 columns**

Find the auth selector block (around line 574–603). It currently renders only when `canUseClaudeCode`:

```typescript
                {canUseClaudeCode && (
                  <div className="field" style={{ marginTop: 12 }}>
                    <label className="label">How to authenticate</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <button
                        type="button"
                        className={'ob-prov' + (authMode === 'api-key' ? ' on' : '')}
                        onClick={() => {
                          setAuthMode('api-key')
                          setVerified(false)
                        }}
                        style={{ padding: 12, alignItems: 'flex-start', textAlign: 'left' }}
                      >
                        <span className="ob-prov-name">API key</span>
                        <span className="ob-prov-sub">Paste an Anthropic API key</span>
                      </button>
                      <button
                        type="button"
                        className={'ob-prov' + (authMode === 'claude-code' ? ' on' : '')}
                        onClick={() => {
                          setAuthMode('claude-code')
                          setVerified(false)
                        }}
                        style={{ padding: 12, alignItems: 'flex-start', textAlign: 'left' }}
                      >
                        <span className="ob-prov-name">Use Claude Code login</span>
                        <span className="ob-prov-sub">Reuse existing subscription</span>
                      </button>
                    </div>
                  </div>
                )}
```

Replace with:

```typescript
                {(canUseClaudeCode || true) && (
                  <div className="field" style={{ marginTop: 12 }}>
                    <label className="label">How to authenticate</label>
                    <div style={{ display: 'grid', gridTemplateColumns: canUseClaudeCode ? '1fr 1fr 1fr' : '1fr 1fr', gap: 8 }}>
                      <button
                        type="button"
                        className={'ob-prov' + (authMode === 'api-key' ? ' on' : '')}
                        onClick={() => {
                          setAuthMode('api-key')
                          setVerified(false)
                        }}
                        style={{ padding: 12, alignItems: 'flex-start', textAlign: 'left' }}
                      >
                        <span className="ob-prov-name">API key</span>
                        <span className="ob-prov-sub">Paste an Anthropic API key</span>
                      </button>
                      <button
                        type="button"
                        className={'ob-prov' + (authMode === 'oauth-token' ? ' on' : '')}
                        onClick={() => {
                          setAuthMode('oauth-token')
                          setVerified(false)
                        }}
                        style={{ padding: 12, alignItems: 'flex-start', textAlign: 'left' }}
                      >
                        <span className="ob-prov-name">OAuth token</span>
                        <span className="ob-prov-sub">Paste a CLAUDE_OAUTH_TOKEN</span>
                      </button>
                      {canUseClaudeCode && (
                        <button
                          type="button"
                          className={'ob-prov' + (authMode === 'claude-code' ? ' on' : '')}
                          onClick={() => {
                            setAuthMode('claude-code')
                            setVerified(false)
                          }}
                          style={{ padding: 12, alignItems: 'flex-start', textAlign: 'left' }}
                        >
                          <span className="ob-prov-name">Use Claude Code login</span>
                          <span className="ob-prov-sub">Reuse existing subscription</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
```

- [ ] **Step 2: Update the key label in the verify block**

Find (around line 624–626):

```typescript
                    <div className="field" style={{ marginTop: 12 }}>
                      <label className="label">{preset.keyLabel}</label>
                      <input
```

Replace the label line with:

```typescript
                      <label className="label">{authMode === 'oauth-token' ? 'OAuth token' : preset.keyLabel}</label>
```

- [ ] **Step 3: Update `handleTest` to handle oauth-token without a network call**

Find `handleTest` (around line 180–187):

```typescript
  const handleTest = () => {
    setTesting(true)
    // Simulate key verification — real validation wired in future task
    setTimeout(() => {
      setTesting(false)
      setVerified(true)
    }, 900)
  }
```

Replace with:

```typescript
  const handleTest = () => {
    if (authMode === 'oauth-token') {
      // No network probe possible — token is valid if non-empty (mirrors ipc-handlers logic)
      setVerified(apiKey.trim().length > 0)
      return
    }
    setTesting(true)
    // Simulate key verification — real validation wired in future task
    setTimeout(() => {
      setTesting(false)
      setVerified(true)
    }, 900)
  }
```

- [ ] **Step 4: Update the verify condition to show the key input when authMode is oauth-token**

The existing code shows the key input block when `authMode === 'api-key'` (around line 622):

```typescript
                } : authMode === 'api-key' ? (
```

Change to:

```typescript
                } : authMode === 'api-key' || authMode === 'oauth-token' ? (
```

- [ ] **Step 5: Update `handleFinish` resolvedKey to handle oauth-token**

Find (around line 224):

```typescript
      const resolvedKey = preset.noAuth ? 'public' : authMode === 'claude-code' ? '' : apiKey
```

This line already handles `oauth-token` correctly (falls through to `apiKey`). No change needed — verify by inspection only.

- [ ] **Step 6: Typecheck**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/onboarding/FirstRunOnboarding.tsx
git commit -m "feat(auth): oauth-token card in onboarding auth selector with instant verify"
```

---

## Final Verification

- [ ] Run `npm run dev`, open Models & Providers
- [ ] Select Anthropic — verify 3 auth cards appear: "API key | OAuth token | Use Claude Code login"
- [ ] Select "OAuth token", paste a fake token, verify key input label reads "OAuth token"
- [ ] Click "Test connection" — verify it succeeds without a network call
- [ ] Add a new Anthropic provider via AddProviderModal — verify same 3-col layout
- [ ] Open onboarding (TweaksPanel → Simulate onboarding), step to provider — verify OAuth token card present
- [ ] Select OAuth token in onboarding, paste token, click "Verify key" — should immediately show verified state

```bash
npx tsc --noEmit
npx vitest run src/main/agent-manager.test.ts
```
