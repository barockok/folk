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

// Poll for the proxy to come up. Returns the port once ready, or null after
// the timeout. Callers should treat null as "proxy unavailable, surface a
// friendly error to the user".
export async function waitForProxyPort(timeoutMs: number): Promise<number | null> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const port = getOpencodeProxyPort()
    if (port != null) return port
    await new Promise((r) => setTimeout(r, 100))
  }
  return getOpencodeProxyPort()
}
