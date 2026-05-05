# Multi-Window Session Popout — Design Spec
Date: 2026-05-05

## Overview

Add a "pop out" button to the session topbar that expands the active session into its own minimal BrowserWindow. The session is canonical — if popped out, clicking it in the sidebar or command palette focuses the popup window instead of loading it in the main window. Closing the popup snaps the session back to the main window.

---

## Architecture

### Main process: `src/main/window-manager.ts` (new)

Singleton module exposing:

- `popout(sessionId, mainWindow)` — create a new BrowserWindow for the session, or focus it if one already exists. Loads `index.html#popout/<sessionId>`. Calls `wireStreaming(agentManager, win)` immediately. Listens `win.on('closed')` to remove from map and broadcast updated IDs.
- `focus(sessionId)` — focus existing popup window (used internally by `popout`).
- `getPopoutIds(): string[]` — returns all currently-popped session IDs.
- `broadcastPopouts(allWindows: BrowserWindow[])` — sends `window:popouts` IPC push to all windows with current IDs.

Internal state: `Map<string, BrowserWindow>` keyed by sessionId.

### IPC surface (added to `src/main/ipc-handlers.ts`)

| Channel | Direction | Payload | Description |
|---------|-----------|---------|-------------|
| `window:popout` | invoke | `sessionId: string` | Create or focus popup |
| `window:getPopouts` | invoke | — | Returns `string[]` of active popout IDs |
| `window:popouts` | push (send) | `string[]` | Broadcast to all windows on change |

### Agent streaming

`wireStreaming` signature changes from `(agent, win: BrowserWindow)` to `(agent, getWindows: () => BrowserWindow[])`. One listener set on AgentManager; each event is broadcast to all live windows returned by the getter. The getter returns `[mainWindow, ...windowManager.getAllWindows()].filter(w => !w.isDestroyed())`. No per-popup listener registration, no memory leak on close.

### `src/shared/preload-api.ts`

New `window` namespace added to `FolkAPI`:

```ts
window: {
  popout: (sessionId: string) => Promise<void>
  getPopouts: () => Promise<string[]>
  onPopoutsChanged: (fn: (ids: string[]) => void) => () => void
}
```

### `src/preload/index.ts`

Expose the `window` API via `contextBridge` using `ipcRenderer.invoke` for `popout`/`getPopouts` and `ipcRenderer.on` for `window:popouts` push.

---

## Renderer

### Popout detection in `src/renderer/src/App.tsx`

All hooks (`useAgent`, `useTelemetry`, `useUpdater`, etc.) are called unconditionally at the top of `App()` — React rules require this. After hooks, branch on hash:

```tsx
// hooks called first (unconditionally)
useAgent(); useUpdater(); ...

const popoutMatch = /^#popout\/(.+)$/.exec(window.location.hash)
if (popoutMatch) {
  return <PopoutShell sessionId={popoutMatch[1]} />
}
// existing <Shell> path
```

`PopoutShell` does NOT call hooks itself — they already ran in `App()`.

### `src/renderer/src/components/PopoutShell.tsx` (new)

Minimal layout — no left sidebar, no nav. Structure:

```
┌─────────────────────────────────────────────┐
│ [traffic lights area]  Title        [panel] │  ← hiddenInset clearance, ~38px
├─────────────────────────────────────────────┤
│                              │               │
│   <Conversation>             │ <FileViewer>  │
│   <Composer>                 │  or           │
│                              │ <TodoPanel>   │
└─────────────────────────────────────────────┘
```

Boot sequence:
1. Parse `sessionId` from prop (from hash)
2. `sessions.get(sessionId)` → local `session` state
3. `sessions.loadMessages(sessionId)` → hydrate via `useSessionStore`
4. Set `activeId` in session store to this session
5. Render conversation + composer + right panel

Right panel toggled by button in the titlebar strip (mirrors main Topbar's right-sidebar toggle). Uses `useUIStore.rightSidebarCollapsed` / `viewerFilePath` as today.

### `src/renderer/src/stores/useUIStore.ts`

Two additions:

```ts
popoutIds: Set<string>
setPopoutIds: (ids: string[]) => void
```

### `src/renderer/src/App.tsx` (main window only)

On mount, call `window.folk.window.getPopouts()` → `setPopoutIds`. Subscribe `window.folk.window.onPopoutsChanged(setPopoutIds)`. Cleanup on unmount.

### `src/renderer/src/components/Topbar.tsx`

When `page === 'sessions'` AND `activeId` is non-null AND `!popoutIds.has(activeId)`: render a pop-out button in `.tb-actions` (expand/external icon). On click: `window.folk.window.popout(activeId)`.

When `popoutIds.has(activeId)`: button not shown (session is already in its own window; main window should clear active or show something else).

### `src/renderer/src/pages/sessions/HistoryRail.tsx`

`onPick` caller in `SessionsPage` checks `popoutIds.has(id)` before calling `setActive`. If popped: call `window.folk.window.popout(id)` (focuses window), skip `setActive`.

### `src/renderer/src/components/CommandPalette.tsx`

Session selection: same guard — check `popoutIds.has(id)`, focus popup if true.

---

## Popup BrowserWindow config

```ts
new BrowserWindow({
  width: 900,
  height: 720,
  minWidth: 600,
  minHeight: 400,
  titleBarStyle: 'hiddenInset',
  trafficLightPosition: { x: 16, y: 12 },
  webPreferences: { /* same as mainWindow */ }
})
```

Loads: `<RENDERER_URL>#popout/<sessionId>` (dev) or `index.html` with hash appended (prod).

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Popup closed by user | `window-manager` removes from map, broadcasts updated IDs. Main window `popoutIds` updates. Session available in sidebar again (not auto-selected). |
| Main window selects popped session | `popoutIds` check intercepts — focuses popup instead. Main window does not load session. |
| Cmd+K selects popped session | Same intercept. Closes palette, focuses popup. |
| Multiple popouts | Each session gets its own BrowserWindow. All receive streaming events. |
| App quit | Electron destroys all windows. `window-all-closed` only relevant on non-darwin; folk is macOS. No special handling needed. |
| Session deleted while popped | `sessions.delete` IPC should also call `windowManager.close(id)` to destroy popup. |
| Popout window loses focus | `blur`/`focus` events wire `data-window-state` same as main window for CSS desaturation. |

---

## Files Changed / Created

| File | Change |
|------|--------|
| `src/main/window-manager.ts` | New — popup lifecycle + map |
| `src/main/index.ts` | Import window-manager, update `wireStreaming` call with window getter |
| `src/main/ipc-handlers.ts` | Add `window:popout`, `window:getPopouts` handlers |
| `src/main/ipc-streaming.ts` | Change signature to `(agent, getWindows)`, broadcast to all |
| `src/shared/preload-api.ts` | Add `window` namespace to `FolkAPI` |
| `src/preload/index.ts` | Expose `window` API |
| `src/renderer/src/App.tsx` | Detect hash, mount `PopoutShell` or `Shell`. Subscribe popout events. |
| `src/renderer/src/components/PopoutShell.tsx` | New — minimal window layout |
| `src/renderer/src/stores/useUIStore.ts` | Add `popoutIds` + `setPopoutIds` |
| `src/renderer/src/components/Topbar.tsx` | Add pop-out button |
| `src/renderer/src/pages/SessionsPage.tsx` | Guard `onPick` with popout check |
| `src/renderer/src/components/CommandPalette.tsx` | Guard session select with popout check |
