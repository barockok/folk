import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { BrowserWindow } from './__mocks__/electron'
import type { BrowserWindow as ElectronBrowserWindow } from 'electron'
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
    const getWindows = () => [winA, winB] as unknown as ElectronBrowserWindow[]
    wireStreaming(mgr, getWindows)
    // AgentManager extends EventEmitter — emit directly to simulate agent event
    ;(mgr as unknown as { emit: (e: string, d: unknown) => void }).emit('done', { sessionId: 'abc' })
    expect(winA.webContents.send).toHaveBeenCalledWith('agent:done', { sessionId: 'abc' })
    expect(winB.webContents.send).toHaveBeenCalledWith('agent:done', { sessionId: 'abc' })
  })

  it('skips destroyed windows', () => {
    winB.close()
    const getWindows = () => [winA, winB] as unknown as ElectronBrowserWindow[]
    wireStreaming(mgr, getWindows)
    ;(mgr as unknown as { emit: (e: string, d: unknown) => void }).emit('done', { sessionId: 'abc' })
    expect(winA.webContents.send).toHaveBeenCalledWith('agent:done', { sessionId: 'abc' })
    expect(winB.webContents.send).not.toHaveBeenCalled()
  })
})
