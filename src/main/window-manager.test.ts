import { describe, it, expect, beforeEach } from 'vitest'
import { BrowserWindow } from './__mocks__/electron'
import type { BrowserWindow as ElectronBrowserWindow } from 'electron'
import { WindowManager } from './window-manager'

describe('WindowManager', () => {
  let wm: WindowManager

  beforeEach(() => {
    BrowserWindow._reset()
    wm = new WindowManager()
  })

  it('getPopoutIds returns empty initially', () => {
    expect(wm.getPopoutIds()).toEqual([])
  })

  it('popout creates a window and tracks the id', () => {
    wm.popout('session-1')
    expect(wm.getPopoutIds()).toContain('session-1')
  })

  it('popout focuses existing window instead of creating a new one', () => {
    wm.popout('session-1')
    const allBefore = BrowserWindow.getAllWindows().length
    wm.popout('session-1')
    expect(BrowserWindow.getAllWindows().length).toBe(allBefore)
    const popup = BrowserWindow.getAllWindows()[0]!
    expect(popup.focus).toHaveBeenCalled()
    expect(wm.getPopoutIds()).toHaveLength(1)
  })

  it('getAllWindows returns all non-destroyed popup windows', () => {
    wm.popout('s1')
    wm.popout('s2')
    expect(wm.getAllWindows()).toHaveLength(2)
  })

  it('close removes session from map', () => {
    wm.popout('s1')
    wm.close('s1')
    expect(wm.getPopoutIds()).toEqual([])
  })

  it('onPopoutsChanged fires on popout and close', () => {
    const calls: string[][] = []
    wm.onPopoutsChanged((ids) => calls.push([...ids]))
    wm.popout('s1')
    wm.close('s1')
    expect(calls).toHaveLength(2)
    expect(calls[0]).toContain('s1')
    expect(calls[1]).toEqual([])
  })

  it('closed window event triggers removal', () => {
    wm.popout('s1')
    const popup = BrowserWindow.getAllWindows()[0]! as unknown as BrowserWindow
    popup.emit('closed')
    expect(wm.getPopoutIds()).toEqual([])
  })
})
