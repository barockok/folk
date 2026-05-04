import { describe, it, expect, vi, beforeEach } from 'vitest'

const initSpy = vi.fn()
const captureSpy = vi.fn()
const optInSpy = vi.fn()
const optOutSpy = vi.fn()

vi.mock('posthog-js', () => ({
  default: {
    init: (...a: unknown[]) => initSpy(...a),
    capture: (...a: unknown[]) => captureSpy(...a),
    opt_in_capturing: () => optInSpy(),
    opt_out_capturing: () => optOutSpy(),
  },
}))

import {
  initRendererTelemetry,
  captureRenderer,
  setRendererEnabled,
  __resetForTest,
} from './telemetry'

beforeEach(() => {
  initSpy.mockClear()
  captureSpy.mockClear()
  optInSpy.mockClear()
  optOutSpy.mockClear()
  __resetForTest()
})

describe('renderer telemetry', () => {
  it('initialises with provided distinctId and config', () => {
    initRendererTelemetry({
      distinctId: 'abc',
      enabled: true,
      key: 'phc_test',
      host: 'https://x',
    })
    expect(initSpy).toHaveBeenCalledTimes(1)
    const [key, opts] = initSpy.mock.calls[0]
    expect(key).toBe('phc_test')
    expect(opts.api_host).toBe('https://x')
    expect(opts.autocapture).toBe(false)
    expect(opts.persistence).toBe('memory')
    expect(opts.bootstrap.distinctID).toBe('abc')
  })

  it('skips init when key is empty', () => {
    initRendererTelemetry({ distinctId: 'abc', enabled: true, key: '', host: 'h' })
    expect(initSpy).not.toHaveBeenCalled()
  })

  it('captures only when enabled', () => {
    initRendererTelemetry({
      distinctId: 'abc', enabled: false, key: 'phc_test', host: 'https://x',
    })
    captureRenderer('page_viewed', { page_name: 'sessions' })
    expect(captureSpy).not.toHaveBeenCalled()
  })

  it('captures when enabled', () => {
    initRendererTelemetry({
      distinctId: 'abc', enabled: true, key: 'phc_test', host: 'https://x',
    })
    captureRenderer('page_viewed', { page_name: 'sessions' })
    expect(captureSpy).toHaveBeenCalledWith('page_viewed', { page_name: 'sessions' })
  })

  it('setRendererEnabled toggles SDK opt state', () => {
    initRendererTelemetry({
      distinctId: 'abc', enabled: true, key: 'phc_test', host: 'https://x',
    })
    setRendererEnabled(false)
    expect(optOutSpy).toHaveBeenCalled()
    setRendererEnabled(true)
    expect(optInSpy).toHaveBeenCalled()
  })

  it('init is idempotent', () => {
    initRendererTelemetry({ distinctId: 'abc', enabled: true, key: 'phc_test', host: 'h' })
    initRendererTelemetry({ distinctId: 'abc', enabled: true, key: 'phc_test', host: 'h' })
    expect(initSpy).toHaveBeenCalledTimes(1)
  })
})
