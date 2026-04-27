// macOS Keychain wrapper for storing OAuth tokens. Uses the `security`
// command — same pattern folk already uses to detect Claude Code creds.
// Falls back gracefully on non-macOS (no token persistence; tokens live for
// the run only).
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileP = promisify(execFile)
const SERVICE = 'folk-mcp-oauth'
const isDarwin = process.platform === 'darwin'

// In-memory fallback for non-macOS so the OAuth flow at least works for the
// session. Tokens are lost on restart.
const memoryStore = new Map<string, string>()

export interface StoredTokens {
  accessToken: string
  refreshToken?: string
  expiresAt?: number  // epoch ms
  tokenType?: string  // usually "Bearer"
  scope?: string
}

export async function storeTokens(account: string, tokens: StoredTokens): Promise<void> {
  const json = JSON.stringify(tokens)
  if (!isDarwin) {
    memoryStore.set(account, json)
    return
  }
  try {
    // -U updates if exists, otherwise inserts. -w supplies the password.
    await execFileP('security', [
      'add-generic-password',
      '-a', account,
      '-s', SERVICE,
      '-w', json,
      '-U'
    ])
  } catch (err) {
    throw new Error(`Failed to write Keychain entry: ${(err as Error).message}`)
  }
}

export async function loadTokens(account: string): Promise<StoredTokens | null> {
  if (!isDarwin) {
    const cached = memoryStore.get(account)
    return cached ? (JSON.parse(cached) as StoredTokens) : null
  }
  try {
    const { stdout } = await execFileP('security', [
      'find-generic-password',
      '-a', account,
      '-s', SERVICE,
      '-w'
    ])
    const json = stdout.trim()
    if (!json) return null
    return JSON.parse(json) as StoredTokens
  } catch {
    // Not found — that's fine, just means no tokens stored
    return null
  }
}

export async function deleteTokens(account: string): Promise<void> {
  if (!isDarwin) {
    memoryStore.delete(account)
    return
  }
  try {
    await execFileP('security', [
      'delete-generic-password',
      '-a', account,
      '-s', SERVICE
    ])
  } catch {
    // Already gone — fine
  }
}
