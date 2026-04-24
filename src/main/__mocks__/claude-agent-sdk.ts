// Test-only stub for @anthropic-ai/claude-agent-sdk. Aliased from vitest.config.ts.
// Do not import from production code — the electron-vite build uses the real SDK.

import { EventEmitter } from 'node:events'

export class Agent extends EventEmitter {
  opts: Record<string, unknown>
  cancelled = false
  constructor(opts: Record<string, unknown>) {
    super()
    this.opts = opts
  }
  async sendMessage(_text: string, _attachments?: unknown[]): Promise<void> {
    queueMicrotask(() => {
      this.emit('chunk', { text: 'hello' })
      this.emit('done')
    })
  }
  async cancel(): Promise<void> {
    this.cancelled = true
    this.emit('done')
  }
  async dispose(): Promise<void> {
    /* noop */
  }
}

let factory: (opts: Record<string, unknown>) => Agent = (opts) => new Agent(opts)

export function __setFactory(fn: (opts: Record<string, unknown>) => Agent): void {
  factory = fn
}

export function createAgent(opts: Record<string, unknown>): Agent {
  return factory(opts)
}
