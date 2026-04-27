// File-backed logger for the opencode bridge proxy. Writes to
// `<userData>/folk-opencode-proxy.log` with simple size-based rotation; also
// mirrors to the main process console so it shows up in `npm run dev` output.
//
// Each log line is a single self-contained JSON object so the file is easy to
// tail / grep / parse.

import { appendFileSync, statSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { mkdirSync } from 'node:fs'

export type LogLevel = 'info' | 'warn' | 'error'

const MAX_BYTES = 1_000_000 // 1MB → rotate

export interface ProxyLogger {
  path: string | null
  info: (event: string, fields?: Record<string, unknown>) => void
  warn: (event: string, fields?: Record<string, unknown>) => void
  error: (event: string, fields?: Record<string, unknown>) => void
}

let activeLogger: ProxyLogger | null = null

export function getLogger(): ProxyLogger {
  return activeLogger ?? createNullLogger()
}

export function initLogger(filePath: string): ProxyLogger {
  try {
    mkdirSync(dirname(filePath), { recursive: true })
  } catch {
    // ignore — the dir likely exists, and we still have console fallback below
  }

  // Touch the file so first write doesn't fail on missing path, and so rotate
  // checks have something to stat.
  try {
    appendFileSync(filePath, '')
  } catch {
    // fall through; writes below will surface the real error
  }

  const write = (level: LogLevel, event: string, fields?: Record<string, unknown>): void => {
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      level,
      event,
      ...fields
    })
    // Mirror to console first — losing console is unlikely; losing the file is.
    const consoleFn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
    consoleFn(`[opencode-proxy] ${line}`)
    try {
      // Rotate if oversized
      try {
        const s = statSync(filePath)
        if (s.size > MAX_BYTES) {
          renameSync(filePath, `${filePath}.1`)
          writeFileSync(filePath, '')
        }
      } catch {
        // ignore rotation errors
      }
      appendFileSync(filePath, line + '\n')
    } catch (err) {
      console.error(`[opencode-proxy] log write failed: ${(err as Error).message}`)
    }
  }

  activeLogger = {
    path: filePath,
    info: (event, fields) => write('info', event, fields),
    warn: (event, fields) => write('warn', event, fields),
    error: (event, fields) => write('error', event, fields)
  }
  activeLogger.info('logger_init', { path: filePath })
  return activeLogger
}

function createNullLogger(): ProxyLogger {
  // Used before initLogger runs (e.g. unit tests); console-only.
  const write = (level: LogLevel, event: string, fields?: Record<string, unknown>): void => {
    const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...fields })
    const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
    fn(`[opencode-proxy] ${line}`)
  }
  return {
    path: null,
    info: (e, f) => write('info', e, f),
    warn: (e, f) => write('warn', e, f),
    error: (e, f) => write('error', e, f)
  }
}
