import type { SessionConfig } from '@shared/types'

const STORAGE_KEY = 'folk.defaultSessionConfig'

// Subset of SessionConfig that makes sense to persist across new-session
// launches. `title` and `goal` are intentionally excluded — those are
// per-session, not preferences.
export type DefaultSessionConfig = Pick<
  SessionConfig,
  'modelId' | 'workingDir' | 'flags' | 'permissionMode' | 'incognito' | 'enabledMcpIds'
>

export function loadDefaultSessionConfig(): DefaultSessionConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as DefaultSessionConfig
    if (!parsed || typeof parsed !== 'object') return null
    if (typeof parsed.modelId !== 'string' || typeof parsed.workingDir !== 'string') return null
    return parsed
  } catch {
    return null
  }
}

export function saveDefaultSessionConfig(cfg: DefaultSessionConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg))
}

export function clearDefaultSessionConfig(): void {
  localStorage.removeItem(STORAGE_KEY)
}
