# Multi-Window Session Popout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a pop-out button to the session topbar that opens the active session in its own minimal BrowserWindow, with correct streaming, sidebar focus-focus interception, and cleanup on close.

**Architecture:** A new `window-manager.ts` singleton tracks `Map<sessionId, BrowserWindow>` for popup windows. `wireStreaming` changes from single-window to multi-window broadcast via a getter closure. The renderer detects `#popout/<sessionId>` in the URL hash and renders a minimal `PopoutShell` instead of the full `Shell`. A `popoutIds` set in `useUIStore` drives UI guards in Topbar, SessionsPage, and CommandPalette.

**Tech Stack:** Electron BrowserWindow, ipcMain.handle, Zustand, React, TypeScript.

---

## File Map

| File | Change |
|------|--------|
| `src/main/window-manager.ts` | **Create** — popup lifecycle + BrowserWindow map |
| `src/main/ipc-streaming.ts` | **Modify** — change signature to `(agent, getWindows)`, broadcast all |
| `src/main/index.ts` | **Modify** — import window-manager, pass getter to wireStreaming |
| `src/main/ipc-handlers.ts` | **Modify** — add `window:popout`, `window:getPopouts`; close popup on session delete |
| `src/main/__mocks__/electron.ts` | **Modify** — add `BrowserWindow` mock class |
| `src/main/ipc-streaming.test.ts` | **Create** — multi-window broadcast unit test |
| `src/main/window-manager.test.ts` | **Create** — map lifecycle unit test |
| `src/shared/preload-api.ts` | **Modify** — add `window` namespace to `FolkAPI` |
| `src/preload/index.ts` | **Modify** — expose `window` API via contextBridge |
| `src/renderer/src/stores/useUIStore.ts` | **Modify** — add `popoutIds: Set<string>` + `setPopoutIds` |
| `src/renderer/src/App.tsx` | **Modify** — hash detection → PopoutShell; popout subscription |
| `src/renderer/src/components/PopoutShell.tsx` | **Create** — minimal window layout |
| `src/renderer/src/components/Topbar.tsx` | **Modify** — pop-out button when session active and not already popped |
| `src/renderer/src/components/Sidebar.tsx` | **Modify** — intercept `openSession` when session is popped |
| `src/renderer/src/components/CommandPalette.tsx` | **Modify** — intercept session select when session is popped |

---

## Task 1: Expand Electron mock for BrowserWindow

**Files:**
- Modify: `src/main/__mocks__/electron.ts`

- [ ] **Step 1: Read the existing electron mock**

```bash
cat src/main/__mocks__/electron.ts
```

- [ ] **Step 2: Add BrowserWindow mock class**

Append to `src/main/__mocks__/electron.ts`:

```ts
type IpcListener = (...args: unknown[]) => void

export class BrowserWindow {
  private static _all: BrowserWindow[] = []
  webContents = {
    send: vi.fn() as (channel: string, ...args: unknown[]) => void
  }
  private _destroyed = false
  private _listeners: Map<string, IpcListener[]> = new Map()

  constructor(public readonly opts: Record<string, unknown> = {}) {
    BrowserWindow._all.push(this)
  }

  isDestroyed(): boolean { return this._destroyed }
  focus = vi.fn()
  loadURL = vi.fn()
  loadFile = vi.fn()
  close(): void { this._destroyed = true }

  on(event: string, fn: IpcListener): this {
    const arr = this._listeners.get(event) ?? []
    arr.push(fn)
    this._listeners.set(event, arr)
    return this
  }

  emit(event: string, ...args: unknown[]): void {
    for (const fn of this._listeners.get(event) ?? []) fn(...args)
  }

  static getAllWindows(): BrowserWindow[] { return [...BrowserWindow._all] }
  static _reset(): void { BrowserWindow._all = [] }
}
```

- [ ] **Step 3: Run typecheck**

```bash
npx tsc --noEmit
```

Expected: no new errors (existing errors only, if any).

- [ ] **Step 4: Commit**

```bash
git add src/main/__mocks__/electron.ts
git commit -m "test: add BrowserWindow mock to electron stub"
```

---

## Task 2: Unit-test + implement `ipc-streaming.ts` multi-window broadcast

**Files:**
- Create: `src/main/ipc-streaming.test.ts`
- Modify: `src/main/ipc-streaming.ts`

- [ ] **Step 1: Write the failing test**

Create `src/main/ipc-streaming.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BrowserWindow } from './__mocks__/electron'

// Import the module under test AFTER electron mock resolves via vitest.config alias
vi.mock('electron', () => import('./__mocks__/electron'))

import { wireStreaming } from './ipc-streaming'
import { AgentManager } from './agent-manager'
import { Database } from './database'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('wireStreaming multi-window broadcast', () => {
  let db: Database
  let dir: string
  let mgr: AgentManager
  let winA: BrowserWindow
  let winB: BrowserWindow

  beforeEach(() => {
    BrowserWindow._reset()
    dir = mkdtempSync(join(tmpdir(), 'folk-stream-'))
    db = new Database(join(dir, 'folk.db'))
    mgr = new AgentManager(db)
    winA = new BrowserWindow()
    winB = new BrowserWindow()
  })

  afterEach(() => {
    mgr.dispose()
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('broadcasts agent:done to all live windows', () => {
    const getWindows = () => [winA as unknown as import('electron').BrowserWindow, winB as unknown as import('electron').BrowserWindow]
    wireStreaming(mgr, getWindows)
    ;(mgr as unknown as { emit: (e: string, d: unknown) => void }).emit('done', { sessionId: 'abc' })
    expect(winA.webContents.send).toHaveBeenCalledWith('agent:done', { sessionId: 'abc' })
    expect(winB.webContents.send).toHaveBeenCalledWith('agent:done', { sessionId: 'abc' })
  })

  it('skips destroyed windows', () => {
    winB.close()
    const getWindows = () => [winA as unknown as import('electron').BrowserWindow, winB as unknown as import('electron').BrowserWindow]
    wireStreaming(mgr, getWindows)
    ;(mgr as unknown as { emit: (e: string, d: unknown) => void }).emit('done', { sessionId: 'abc' })
    expect(winA.webContents.send).toHaveBeenCalledWith('agent:done', { sessionId: 'abc' })
    expect(winB.webContents.send).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/main/ipc-streaming.test.ts
```

Expected: FAIL (wireStreaming still uses old signature).

- [ ] **Step 3: Update `src/main/ipc-streaming.ts`**

Replace the entire file:

```ts
import type { BrowserWindow } from 'electron'
import { AgentManager } from './agent-manager'

export function wireStreaming(agent: AgentManager, getWindows: () => BrowserWindow[]): void {
  const send = (channel: string, payload: unknown): void => {
    for (const win of getWindows()) {
      if (!win.isDestroyed()) win.webContents.send(channel, payload)
    }
  }
  agent.on('chunk', (e) => send('agent:chunk', e))
  agent.on('thinking', (e) => send('agent:thinking', e))
  agent.on('toolCall', (e) => send('agent:toolCall', e))
  agent.on('toolResult', (e) => send('agent:toolResult', e))
  agent.on('done', (e) => send('agent:done', e))
  agent.on('error', (e) => send('agent:error', e))
  agent.on('notice', (e) => send('agent:notice', e))
  agent.on('usage', (e) => send('agent:usage', e))
  agent.on('permissionRequest', (e) => send('agent:permissionRequest', e))
  agent.on('mcpElicitation', (e) => send('agent:mcpElicitation', e))
  agent.on('toolProgress', (e) => send('agent:toolProgress', e))
  agent.on('promptSuggestion', (e) => send('agent:promptSuggestion', e))
}
```

- [ ] **Step 4: Run test to confirm pass**

```bash
npx vitest run src/main/ipc-streaming.test.ts
```

Expected: PASS.

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit
```

Expected: error on `src/main/index.ts` — `wireStreaming` call passes wrong type (single BrowserWindow instead of getter). That is expected at this step; fixed in Task 4.

- [ ] **Step 6: Commit**

```bash
git add src/main/ipc-streaming.ts src/main/ipc-streaming.test.ts
git commit -m "feat(streaming): broadcast agent events to all windows via getter"
```

---

## Task 3: Create `src/main/window-manager.ts` + tests

**Files:**
- Create: `src/main/window-manager.ts`
- Create: `src/main/window-manager.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/main/window-manager.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { BrowserWindow } from './__mocks__/electron'

vi.mock('electron', () => import('./__mocks__/electron'))

import { WindowManager } from './window-manager'

describe('WindowManager', () => {
  let wm: WindowManager
  let mainWin: BrowserWindow

  beforeEach(() => {
    BrowserWindow._reset()
    mainWin = new BrowserWindow()
    wm = new WindowManager()
  })

  it('getPopoutIds returns empty initially', () => {
    expect(wm.getPopoutIds()).toEqual([])
  })

  it('popout creates a window and returns its id', () => {
    wm.popout('session-1', mainWin as unknown as import('electron').BrowserWindow)
    expect(wm.getPopoutIds()).toContain('session-1')
  })

  it('popout focuses existing window instead of creating a new one', () => {
    wm.popout('session-1', mainWin as unknown as import('electron').BrowserWindow)
    const first = BrowserWindow.getAllWindows().find((w) => w !== mainWin)!
    wm.popout('session-1', mainWin as unknown as import('electron').BrowserWindow)
    expect(first.focus).toHaveBeenCalled()
    expect(wm.getPopoutIds()).toHaveLength(1)
  })

  it('getAllWindows returns all popup windows', () => {
    wm.popout('s1', mainWin as unknown as import('electron').BrowserWindow)
    wm.popout('s2', mainWin as unknown as import('electron').BrowserWindow)
    expect(wm.getAllWindows()).toHaveLength(2)
  })

  it('close removes session from map and broadcasts', () => {
    const broadcasts: string[][] = []
    wm.onPopoutsChanged((ids) => broadcasts.push(ids))
    wm.popout('s1', mainWin as unknown as import('electron').BrowserWindow)
    wm.close('s1')
    expect(wm.getPopoutIds()).toEqual([])
    expect(broadcasts[broadcasts.length - 1]).toEqual([])
  })

  it('closed window triggers removal on closed event', () => {
    wm.popout('s1', mainWin as unknown as import('electron').BrowserWindow)
    const popup = BrowserWindow.getAllWindows().find((w) => w !== mainWin)!
    popup.emit('closed')
    expect(wm.getPopoutIds()).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run src/main/window-manager.test.ts
```

Expected: FAIL (module doesn't exist).

- [ ] **Step 3: Create `src/main/window-manager.ts`**

```ts
import { BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { is } from '@electron-toolkit/utils'

export class WindowManager {
  private map = new Map<string, BrowserWindow>()
  private listeners: Array<(ids: string[]) => void> = []

  popout(sessionId: string, mainWindow: BrowserWindow): void {
    const existing = this.map.get(sessionId)
    if (existing && !existing.isDestroyed()) {
      existing.focus()
      return
    }

    const win = new BrowserWindow({
      width: 900,
      height: 720,
      minWidth: 600,
      minHeight: 400,
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 16, y: 12 },
      webPreferences: {
        preload: join(__dirname, '../preload/index.mjs'),
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false
      }
    })

    win.on('blur', () => { win.webContents.send('app:windowState', 'blurred') })
    win.on('focus', () => { win.webContents.send('app:windowState', 'focused') })

    const hash = `#popout/${sessionId}`
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      void win.loadURL(process.env['ELECTRON_RENDERER_URL'] + hash)
    } else {
      void win.loadFile(join(__dirname, '../renderer/index.html'), { hash: `popout/${sessionId}` })
    }

    this.map.set(sessionId, win)
    this.broadcast()

    win.on('closed', () => {
      this.map.delete(sessionId)
      this.broadcast()
    })
  }

  close(sessionId: string): void {
    const win = this.map.get(sessionId)
    if (win && !win.isDestroyed()) win.close()
    this.map.delete(sessionId)
    this.broadcast()
  }

  getPopoutIds(): string[] {
    return [...this.map.keys()]
  }

  getAllWindows(): BrowserWindow[] {
    return [...this.map.values()].filter((w) => !w.isDestroyed())
  }

  broadcastTo(targets: BrowserWindow[]): void {
    const ids = this.getPopoutIds()
    for (const win of targets) {
      if (!win.isDestroyed()) win.webContents.send('window:popouts', ids)
    }
  }

  onPopoutsChanged(fn: (ids: string[]) => void): () => void {
    this.listeners.push(fn)
    return () => { this.listeners = this.listeners.filter((l) => l !== fn) }
  }

  private broadcast(): void {
    const ids = this.getPopoutIds()
    for (const fn of this.listeners) fn(ids)
  }
}
```

- [ ] **Step 4: Run test to confirm pass**

```bash
npx vitest run src/main/window-manager.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/window-manager.ts src/main/window-manager.test.ts
git commit -m "feat(window-manager): popup lifecycle with Map and broadcast"
```

---

## Task 4: Wire window-manager into `src/main/index.ts`

**Files:**
- Modify: `src/main/index.ts`

- [ ] **Step 1: Import WindowManager and update wireStreaming call**

In `src/main/index.ts`, after the existing imports, add:

```ts
import { WindowManager } from './window-manager'
```

After `let mainWindow: BrowserWindow | null = null`, add:

```ts
let windowManager: WindowManager
```

Find:
```ts
  agentManager = new AgentManager(db, (id) => mcpManager.getAccessToken(id), telemetry)
```

After that line (before `mcpManager.setBusyCheck`), add:
```ts
  windowManager = new WindowManager()
```

Find:
```ts
  if (mainWindow) {
    wireStreaming(agentManager, mainWindow)
  }
```

Replace with:
```ts
  const getStreamTargets = (): BrowserWindow[] =>
    [mainWindow, ...windowManager.getAllWindows()].filter((w): w is BrowserWindow => !!w && !w.isDestroyed())
  wireStreaming(agentManager, getStreamTargets)
  windowManager.onPopoutsChanged((ids) => {
    const targets = [mainWindow, ...windowManager.getAllWindows()].filter((w): w is BrowserWindow => !!w && !w.isDestroyed())
    windowManager.broadcastTo(targets)
  })
```

Also pass `windowManager` to `registerIpc` (see Task 5 which modifies registerIpc signature):
```ts
  registerIpc(db, agentManager, mcpManager, telemetry, windowManager)
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: error on registerIpc call (wrong arity) — that's expected until Task 5.

- [ ] **Step 3: Commit**

```bash
git add src/main/index.ts
git commit -m "chore(main): wire WindowManager into app lifecycle and streaming"
```

---

## Task 5: Add IPC handlers for `window:popout` and `window:getPopouts`

**Files:**
- Modify: `src/main/ipc-handlers.ts`

- [ ] **Step 1: Update `registerIpc` signature**

In `src/main/ipc-handlers.ts`, find the import block and add:
```ts
import { WindowManager } from './window-manager'
import { BrowserWindow } from 'electron'
```

Find:
```ts
export function registerIpc(
  db: Database,
  agent: AgentManager,
  mcp: MCPManager,
  telemetry: Telemetry
): void {
```

Replace with:
```ts
export function registerIpc(
  db: Database,
  agent: AgentManager,
  mcp: MCPManager,
  telemetry: Telemetry,
  windowManager: WindowManager
): void {
```

- [ ] **Step 2: Replace sessions:delete handler to also close popup**

Find:
```ts
  ipcMain.handle('sessions:delete', (_e, id: string) => agent.deleteSession(id))
```

Replace with:
```ts
  ipcMain.handle('sessions:delete', (_e, id: string) => {
    windowManager.close(id)
    return agent.deleteSession(id)
  })
```

- [ ] **Step 3: Add window:popout and window:getPopouts handlers**

After the `ipcMain.handle('sessions:delete', ...)` line, add:

```ts
  ipcMain.handle('window:popout', (_e, sessionId: string) => {
    const allWins = BrowserWindow.getAllWindows()
    const mainWin = allWins.find((w) => !windowManager.getAllWindows().includes(w) && !w.isDestroyed())
    if (mainWin) windowManager.popout(sessionId, mainWin)
  })
  ipcMain.handle('window:getPopouts', () => windowManager.getPopoutIds())
```

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit
```

Expected: clean (or only pre-existing errors).

- [ ] **Step 5: Run all tests**

```bash
npx vitest run
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/main/ipc-handlers.ts
git commit -m "feat(ipc): add window:popout and window:getPopouts handlers"
```

---

## Task 6: Add `window` namespace to `FolkAPI` and expose via preload

**Files:**
- Modify: `src/shared/preload-api.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Add `window` namespace to `FolkAPI` in `src/shared/preload-api.ts`**

Find the closing `}` of the `FolkAPI` interface (after the `telemetry` block) and add before it:

```ts
  window: {
    popout: (sessionId: string) => Promise<void>
    getPopouts: () => Promise<string[]>
    onPopoutsChanged: (fn: (ids: string[]) => void) => () => void
  }
```

- [ ] **Step 2: Expose `window` API in `src/preload/index.ts`**

Find the `telemetry: {` block in the `folk` object. After the closing `}` of `telemetry`, add:

```ts
  window: {
    popout: (sessionId) => ipcRenderer.invoke('window:popout', sessionId),
    getPopouts: () => ipcRenderer.invoke('window:getPopouts'),
    onPopoutsChanged: (fn) => listen<string[]>('window:popouts', fn)
  },
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/shared/preload-api.ts src/preload/index.ts
git commit -m "feat(preload): expose window.popout/getPopouts/onPopoutsChanged API"
```

---

## Task 7: Add `popoutIds` to `useUIStore`

**Files:**
- Modify: `src/renderer/src/stores/useUIStore.ts`

- [ ] **Step 1: Add `popoutIds` and `setPopoutIds` to the interface and initial state**

In `src/renderer/src/stores/useUIStore.ts`, find the `interface UIState {` block. After `forceOnboarding: boolean`, add:

```ts
  popoutIds: Set<string>
  setPopoutIds: (ids: string[]) => void
```

In the `create<UIState>((set) => ({` block, after `forceOnboarding: false,` add:

```ts
  popoutIds: new Set<string>(),
  setPopoutIds: (ids) => set({ popoutIds: new Set(ids) }),
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/stores/useUIStore.ts
git commit -m "feat(store): add popoutIds state to useUIStore"
```

---

## Task 8: Update `App.tsx` — hash detection + popout subscription

**Files:**
- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: Add PopoutShell import and popout subscription**

In `src/renderer/src/App.tsx`, add import after the existing imports:

```ts
import { PopoutShell } from './components/PopoutShell'
```

In the `App()` function, after the existing `useEffect` for window events (the one with `offState`, `offTweaks`, etc.) add a new effect:

```ts
  useEffect(() => {
    const api = window.folk?.window
    if (!api) return
    void api.getPopouts().then((ids) => useUIStore.getState().setPopoutIds(ids))
    const off = api.onPopoutsChanged((ids) => useUIStore.getState().setPopoutIds(ids))
    return off
  }, [])
```

After all hooks but before the `return`, add the popout hash check:

```ts
  const popoutMatch = /^#?popout\/(.+)$/.exec(window.location.hash)
  if (popoutMatch) {
    return <PopoutShell sessionId={popoutMatch[1]} />
  }
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: error about `PopoutShell` not existing — that's expected, fixed in Task 9.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/App.tsx
git commit -m "feat(app): detect popout hash and subscribe to popout changes"
```

---

## Task 9: Create `PopoutShell.tsx`

**Files:**
- Create: `src/renderer/src/components/PopoutShell.tsx`

- [ ] **Step 1: Create the component**

Create `src/renderer/src/components/PopoutShell.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { useSessionStore } from '../stores/useSessionStore'
import { useUIStore } from '../stores/useUIStore'
import { Conversation } from '../pages/sessions/Conversation'
import { Composer } from '../pages/sessions/Composer'
import type { Session } from '@shared/types'

const popoutStyles = {
  root: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100vh',
    overflow: 'hidden',
    background: 'var(--bg-app)'
  },
  titlebar: {
    height: 38,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    paddingLeft: 80,
    paddingRight: 12,
    WebkitAppRegion: 'drag' as const,
    borderBottom: '1px solid var(--border)'
  },
  title: {
    fontSize: 13,
    fontFamily: 'var(--ff-sans)',
    color: 'var(--body)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    flex: 1
  },
  panelToggle: {
    WebkitAppRegion: 'no-drag' as const,
    background: 'transparent',
    border: 0,
    cursor: 'pointer',
    padding: '4px 6px',
    color: 'var(--fg-faint)'
  },
  body: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden'
  },
  main: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden'
  }
}

export function PopoutShell({ sessionId }: { sessionId: string }) {
  const [session, setSession] = useState<Session | null>(null)
  const setActive = useSessionStore((s) => s.setActive)
  const hydrateMessages = useSessionStore((s) => s.hydrateMessages)
  const rightSidebarCollapsed = useUIStore((s) => s.rightSidebarCollapsed)
  const toggleRightSidebar = useUIStore((s) => s.toggleRightSidebar)

  useEffect(() => {
    void (async () => {
      const s = await window.folk.sessions.get(sessionId)
      if (s) {
        setSession(s)
        setActive(s.id)
        await hydrateMessages(s.id)
      }
    })()
  }, [sessionId, setActive, hydrateMessages])

  async function handleSend(text: string) {
    if (!session) return
    await window.folk.agent.sendMessage(session.id, text)
  }

  async function handleCancel() {
    if (!session) return
    await window.folk.agent.cancel(session.id)
  }

  const title = session?.title ?? 'Loading…'

  return (
    <div style={popoutStyles.root}>
      <div style={popoutStyles.titlebar}>
        <span style={popoutStyles.title}>{title}</span>
        <button
          type="button"
          style={popoutStyles.panelToggle}
          onClick={toggleRightSidebar}
          title={rightSidebarCollapsed ? 'Show context panel' : 'Hide context panel'}
        >
          {rightSidebarCollapsed ? '▶' : '◀'}
        </button>
      </div>
      <div style={popoutStyles.body}>
        <div style={popoutStyles.main}>
          <Conversation session={session} />
          <Composer
            session={session}
            onSend={handleSend}
            onCancel={handleCancel}
          />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/PopoutShell.tsx
git commit -m "feat(popout): add PopoutShell minimal window layout"
```

---

## Task 10: Add pop-out button to `Topbar.tsx`

**Files:**
- Modify: `src/renderer/src/components/Topbar.tsx`

- [ ] **Step 1: Read current Topbar.tsx**

```bash
cat src/renderer/src/components/Topbar.tsx
```

- [ ] **Step 2: Add popoutIds selector and pop-out button**

In `src/renderer/src/components/Topbar.tsx`, after the `activeSessionTitle` selector, add:

```ts
  const activeId = useSessionStore((s) => s.activeId)
  const popoutIds = useUIStore((s) => s.popoutIds)
```

In the `<div className="tb-actions">` block, before the right-sidebar toggle button, add:

```tsx
        {page === 'sessions' && activeId && !popoutIds.has(activeId) && (
          <button
            type="button"
            className="btn btn-plain btn-icon"
            onClick={() => void window.folk.window.popout(activeId)}
            title="Pop out session"
            aria-label="Pop out session into its own window"
          >
            <Icon name="external" size={14} />
          </button>
        )}
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/Topbar.tsx
git commit -m "feat(topbar): add pop-out button for active non-popped sessions"
```

---

## Task 11: Guard session pick in `Sidebar.tsx`

**Files:**
- Modify: `src/renderer/src/components/Sidebar.tsx`

**Context:** The session list in the sidebar is rendered directly in `Sidebar.tsx`. The `openSession` function at line 212 calls `setActive(id)` + `setPage('sessions')`. HistoryRail is defined but unused; the guard goes in Sidebar.

- [ ] **Step 1: Add popoutIds selector**

In `src/renderer/src/components/Sidebar.tsx`, after the existing selectors (around line 137–140), add:

```ts
  const popoutIds = useUIStore((s) => s.popoutIds)
```

- [ ] **Step 2: Guard the `openSession` function**

Find:

```ts
  const openSession = (id: string) => {
    setActive(id)
    setPage('sessions')
  }
```

Replace with:

```ts
  const openSession = (id: string) => {
    if (popoutIds.has(id)) {
      void window.folk.window.popout(id)
      return
    }
    setActive(id)
    setPage('sessions')
  }
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/Sidebar.tsx
git commit -m "feat(sidebar): intercept session pick for popped-out sessions"
```

---

## Task 12: Guard session select in `CommandPalette.tsx`

**Files:**
- Modify: `src/renderer/src/components/CommandPalette.tsx`

- [ ] **Step 1: Add popoutIds selector**

In `src/renderer/src/components/CommandPalette.tsx`, after the existing selectors, add:

```ts
  const popoutIds = useUIStore((s) => s.popoutIds)
```

- [ ] **Step 2: Update `openSession` function**

Find:

```ts
  const openSession = (id: string) => {
    setActive(id)
    setPage('sessions')
    closeCmdk()
  }
```

Replace with:

```ts
  const openSession = (id: string) => {
    if (popoutIds.has(id)) {
      void window.folk.window.popout(id)
      closeCmdk()
      return
    }
    setActive(id)
    setPage('sessions')
    closeCmdk()
  }
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 4: Run all tests**

```bash
npx vitest run
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/CommandPalette.tsx
git commit -m "feat(cmdk): intercept session select for popped-out sessions"
```

---

## Task 13: Smoke test + final typecheck

**Files:** None created.

- [ ] **Step 1: Full typecheck**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 2: Run all tests**

```bash
npx vitest run
```

Expected: all pass (note: database tests may fail without `npx @electron/rebuild` per CLAUDE.md gotcha — that is pre-existing).

- [ ] **Step 3: Start dev server and test manually**

```bash
npm run dev
```

Manual test checklist:
1. Open a session — pop-out button appears in topbar (external icon).
2. Click pop-out — new window opens showing the session conversation.
3. Close the popup — button reappears in main window topbar; session is clickable in sidebar again.
4. Send a message from the main window while the session is popped — confirm streaming events arrive in the popup window.
5. Open command palette (⌘K) — search for a popped session — selecting it focuses the popup window instead of loading in main.
6. Click the session in the sidebar while it is popped — popup gets focus.
7. Delete a session that is popped — popup window closes.
8. Pop out two sessions — each gets its own window; all receive streaming.

- [ ] **Step 4: Final commit (if any minor fixes needed)**

```bash
git add <changed files>
git commit -m "fix(popout): <description of any smoke-test fixes>"
```
