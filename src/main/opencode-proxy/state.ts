// Singleton proxy handle, set by main/index.ts on app ready and consumed by
// agent-manager. Lives in its own module to avoid an import cycle between
// main/index.ts and main/agent-manager.ts.

import type { ProxyHandle } from './server'

let current: ProxyHandle | null = null

export function setProxyHandle(handle: ProxyHandle | null): void {
  current = handle
}

export function getOpencodeProxyPort(): number | null {
  return current?.port ?? null
}

export function getOpencodeProxyHandle(): ProxyHandle | null {
  return current
}
