# PostHog Telemetry — Design Spec

**Date:** 2026-05-04  
**Status:** Approved

---

## Overview

Add privacy-first telemetry to Folk using PostHog. Two SDKs run in parallel under one `distinct_id`: `posthog-node` in the main process (session lifecycle, errors, app events) and `posthog-js` in the renderer (page views, onboarding, feature interactions). No chat content, file paths, API keys, or PII ever leaves the device.

---

## Architecture

### Dual-SDK with shared identity

| Process | SDK | Events |
|---|---|---|
| Main (Node) | `posthog-node` | app_launched, session_started, session_completed, session_error, app_quit, update_available, update_installed |
| Renderer (Browser) | `posthog-js` | page_viewed, onboarding_completed, onboarding_skipped, provider_added, provider_removed, mcp_added, mcp_removed, telemetry_opt_out, telemetry_opt_in |

`distinct_id` is a random UUIDv4 generated once by the main process and stored in `userData/folk-telemetry.json`. The renderer receives it via IPC on startup. Both SDKs send events under the same ID so PostHog merges them into one user identity. The ID is never linked to any PII.

### Persistence file

`<userData>/folk-telemetry.json`:
```json
{ "distinctId": "uuid-v4", "enabled": true }
```

---

## Privacy Contract

### Always tracked (safe metadata only)

- App version, platform, arch
- Error code: `auth` | `quota` | `offline` | `cancelled` | `crash` | `unknown`
- Provider type: `anthropic` | `openai` | `google` | `openai-compatible` (never the key or base URL)
- Session turn count, cost bucket (`<$0.01` / `$0.01–0.10` / `$0.10–1` / `$1+`), duration bucket
- Permission mode (`default` | `acceptEdits` | `plan` | `bypassPermissions`), incognito flag
- Page name (one of the fixed nav pages), onboarding step reached
- MCP server count (never server name, URL, or credentials)

### Never tracked

- Message text (user or assistant)
- Tool inputs or outputs
- File paths or working directory
- API keys or base URLs
- Model IDs (custom provider model names could be revealing)
- Profile fields (nickname, role, pronouns, about)
- IP address (PostHog configured with `disable_geoip: true`)

---

## Files

```
src/main/telemetry.ts
  — PostHog Node SDK init
  — distinct_id generation + folk-telemetry.json read/write
  — opt-in / opt-out toggle
  — typed capture helpers: captureAppLaunched, captureSessionStarted, etc.
  — IPC handlers: telemetry:getConfig, telemetry:setEnabled

src/renderer/src/lib/telemetry.ts
  — PostHog JS SDK init (lazy, after receiving config from main)
  — opt_in / opt_out wrappers
  — typed capture fn: capture(event, props)

src/renderer/src/hooks/useTelemetry.ts
  — initialises PostHog JS on mount (fetches config via IPC)
  — fires page_viewed on page change
  — exposes setEnabled(bool) for TweaksPanel + onboarding
```

---

## IPC Surface

Added to `ipc-handlers.ts` and exposed via preload:

| Channel | Direction | Payload |
|---|---|---|
| `telemetry:getConfig` | renderer → main | → `{ distinctId: string, enabled: boolean }` |
| `telemetry:setEnabled` | renderer → main | `(enabled: boolean)` → void |

`preload-api.ts` gains a `telemetry` namespace:
```ts
telemetry: {
  getConfig: () => Promise<{ distinctId: string; enabled: boolean }>
  setEnabled: (enabled: boolean) => Promise<void>
}
```

---

## Build-time Configuration

Environment variables injected at build (GitHub Actions secrets):

```
VITE_POSTHOG_KEY=phc_xxx
VITE_POSTHOG_HOST=https://eu.i.posthog.com   # optional, defaults to US cloud
```

Main process reads these from `process.env.VITE_POSTHOG_KEY` (electron-vite exposes `VITE_*` vars to main via define).

**If key is absent** (local dev, no secret set): both SDKs silently no-op. No errors, no console spam. A `__DEV_TELEMETRY__` flag in main telemetry module gates the init.

---

## Opt-out UX

### Onboarding (FirstRunOnboarding — Step 1, Welcome)

Add a checkbox below the welcome copy:

> ☑ Help improve Folk by sending anonymous usage data. No chat content ever leaves your device. [Learn more]

Default: **checked (opted in)**. Unchecking sets `enabled: false` before the onboarding finish handler runs. "Learn more" opens PostHog's privacy policy in the system browser.

### TweaksPanel

Add a toggle row:

```
Analytics  [toggle]
Anonymous usage data only. No chat content.
```

Toggle fires `telemetry:setEnabled` IPC immediately. Both SDKs update synchronously.

---

## PostHog Configuration

```ts
// posthog-js (renderer)
posthog.init(key, {
  api_host: host,
  person_profiles: 'never',          // no person profiles, just events
  autocapture: false,                 // no DOM click capture
  capture_pageview: false,            // manual page_viewed only
  capture_pageleave: false,
  disable_session_recording: true,
  disable_surveys: true,
  disable_web_experiments: true,
  persistence: 'memory',             // no cookies / localStorage for PH itself
  bootstrap: { distinctID: fromMain },
})
```

```ts
// posthog-node (main)
new PostHog(key, {
  host,
  disableGeoip: true,
  flushAt: 10,
  flushInterval: 30_000,
})
```

---

## Session Event Schema

### `session_started`
```ts
{
  provider_type: 'anthropic' | 'openai' | 'google' | 'openai-compatible'
  permission_mode: PermissionMode
  is_incognito: boolean
  has_mcps: boolean
  mcp_count: number
}
```

### `session_completed`
```ts
{
  provider_type: string
  turn_count: number
  cost_bucket: '<$0.01' | '$0.01-0.10' | '$0.10-1.00' | '$1+'
  duration_bucket: '<30s' | '30s-2m' | '2m-10m' | '10m+'
}
```

### `session_error`
```ts
{
  error_code: 'auth' | 'quota' | 'offline' | 'cancelled' | 'crash' | 'unknown'
  provider_type: string
}
```

---

## Testing

- Unit: `telemetry.ts` (main) — mock PostHog, assert capture called with correct schema, assert no-op when key absent
- Unit: `lib/telemetry.ts` (renderer) — same pattern
- Manual: toggle opt-out in TweaksPanel → verify PostHog Live Events dashboard shows nothing; opt back in → verify events appear
