import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'events'

// Mock child_process before importing
vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>()
  return {
    ...actual,
    spawn: vi.fn(() => {
      const proc = new EventEmitter() as any
      proc.stdout = new EventEmitter()
      proc.stderr = new EventEmitter()
      proc.kill = vi.fn()
      proc.pid = 1234
      return proc
    })
  }
})

// Mock fetch
vi.stubGlobal('fetch', vi.fn())

import { LlamaServerManager } from '@main/llama-server'

describe('LlamaServerManager', () => {
  let manager: LlamaServerManager

  const defaultConfig = {
    modelPath: '/path/to/model.gguf',
    port: 8080,
    contextSize: 4096
  }

  beforeEach(() => {
    vi.clearAllMocks()
    manager = new LlamaServerManager(defaultConfig)
  })

  it('initializes with correct config', () => {
    expect(manager.getStatus()).toBe('stopped')
    expect(manager.getPort()).toBe(8080)
    expect(manager.getBaseUrl()).toBe('http://127.0.0.1:8080')
  })

  it('buildArgs returns correct CLI arguments', () => {
    const args = manager.buildArgs()
    expect(args).toEqual([
      '--model',
      '/path/to/model.gguf',
      '--jinja',
      '--port',
      '8080',
      '--ctx-size',
      '4096'
    ])
  })

  it('buildArgs includes --n-gpu-layers when gpuLayers is set', () => {
    const managerWithGpu = new LlamaServerManager({
      ...defaultConfig,
      gpuLayers: 32
    })
    const args = managerWithGpu.buildArgs()
    expect(args).toEqual([
      '--model',
      '/path/to/model.gguf',
      '--jinja',
      '--port',
      '8080',
      '--ctx-size',
      '4096',
      '--n-gpu-layers',
      '32'
    ])
  })
})
