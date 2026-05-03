import { useState } from 'react'
import { useSessionStore } from '../../stores/useSessionStore'
import type { Session, MessageBlock, PersistedToolCall } from '@shared/types'
import { Icon } from '../../components/icons'
import { useSessions } from '../../hooks/useSessions'
import { FOLK_INTERNAL_MARK } from './Conversation'

const EMPTY: never[] = []

type ShellStatus = 'running' | 'completed' | 'killed' | 'error' | 'unknown'

interface Shell {
  bashId: string
  command: string
  description?: string
  status: ShellStatus
  exitCode?: string
  startedAt: number
  lastUpdate: number
  stdout: string
  stderr: string
  pollCount: number
}

// Modern Claude Agent SDK uses unified Task framework. Bash with
// run_in_background returns BashOutput { backgroundTaskId, stdout, stderr,
// interrupted, ... }. Subsequent reads use TaskOutput tool with task_id.
// Kill uses TaskStop with task_id. The legacy BashOutput / KillBash tool
// names don't exist in this SDK — don't look for them.
const TASK_ID_RE = [
  /backgroundTaskId["']?\s*[:=]\s*["']?([A-Za-z0-9_-]+)/,
  /task_id["']?\s*[:=]\s*["']?([A-Za-z0-9_-]+)/,
  /bash_id["']?\s*[:=]\s*["']?([A-Za-z0-9_-]+)/,
  /shell_id["']?\s*[:=]\s*["']?([A-Za-z0-9_-]+)/,
  // Natural-language and path forms the Claude Code CLI emits for bg tasks:
  //   "Task ID: brwvx26s9"       (capital words, colon)
  //   "task brwvx26s9"           (in-line phrasing)
  //   "/tasks/brwvx26s9.output"  (path to the persisted output file)
  /(?:^|\b)Task\s*(?:id|ID)\s*[:=]\s*([A-Za-z0-9_-]{6,})/,
  /\/tasks\/([A-Za-z0-9_-]{6,})\.output/,
  /Started\s+in\s+background\s+as\s+(?:task\s+)?([A-Za-z0-9_-]{6,})/i
]

// SDK tool_result content arrives as either a plain string, an object, or
// an Anthropic content-block array like [{type:'text', text:'...'}]. Flatten
// to a single string for regex parsing.
function asString(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string') return v
  if (Array.isArray(v)) {
    const parts: string[] = []
    for (const item of v) {
      if (typeof item === 'string') parts.push(item)
      else if (item && typeof item === 'object') {
        const o = item as Record<string, unknown>
        if (typeof o.text === 'string') parts.push(o.text)
        else parts.push(asString(o))
      }
    }
    return parts.join('\n')
  }
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    if (typeof o.text === 'string') return o.text
    try {
      return JSON.stringify(v)
    } catch {
      return String(v)
    }
  }
  return String(v)
}

function asObject(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const o = v as Record<string, unknown>
    if (typeof o.text === 'string') return asObject(o.text)
    return o
  }
  if (Array.isArray(v)) {
    for (const item of v) {
      const r = asObject(item)
      if (r) return r
    }
  }
  if (typeof v === 'string') {
    const s = v.trim()
    if (s.startsWith('{')) {
      try {
        const parsed = JSON.parse(s)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>
        }
      } catch {
        /* fall through */
      }
    }
  }
  return null
}

function parseTaskId(output: unknown): string | null {
  const obj = asObject(output)
  if (obj) {
    for (const k of ['backgroundTaskId', 'task_id', 'bash_id', 'shell_id']) {
      const v = obj[k]
      if (typeof v === 'string' && v) return v
    }
  }
  const s = asString(output)
  for (const re of TASK_ID_RE) {
    const m = s.match(re)
    if (m) return m[1]
  }
  return null
}

function inputTaskId(input: unknown): string | null {
  if (!input || typeof input !== 'object') return null
  const o = input as Record<string, unknown>
  const v = o.task_id ?? o.bash_id ?? o.shell_id ?? o.id
  return typeof v === 'string' ? v : null
}

function getTag(raw: string, name: string): string | undefined {
  const m = raw.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, 'i'))
  return m ? m[1].trim() : undefined
}

interface ParsedOutput {
  status: ShellStatus
  exitCode?: string
  stdout: string
  stderr: string
  interrupted?: boolean
}

function parseTaskOutput(output: unknown, isError?: boolean): ParsedOutput {
  // Try JSON shape first (modern SDK BashOutput).
  const obj = asObject(output)
  if (obj) {
    const stdout = typeof obj.stdout === 'string' ? obj.stdout : ''
    const stderr = typeof obj.stderr === 'string' ? obj.stderr : ''
    const interrupted = obj.interrupted === true
    const exitCode =
      typeof obj.exit_code === 'number'
        ? String(obj.exit_code)
        : typeof obj.exitCode === 'number'
        ? String(obj.exitCode)
        : typeof obj.returnCode === 'number'
        ? String(obj.returnCode)
        : undefined
    let status: ShellStatus
    if (interrupted) status = 'killed'
    else if (typeof obj.backgroundTaskId === 'string' && exitCode === undefined) status = 'running'
    else if (exitCode !== undefined) status = exitCode === '0' ? 'completed' : 'error'
    else if (isError) status = 'error'
    else status = 'unknown'
    return { status, exitCode, stdout, stderr, interrupted }
  }
  // Fall back to XML-ish tag parse for older formats.
  const raw = asString(output)
  const statusRaw = (
    getTag(raw, 'status') ||
    raw.match(/status[:\s]+([A-Za-z_]+)/i)?.[1] ||
    ''
  ).toLowerCase()
  const status: ShellStatus =
    statusRaw === 'running'
      ? 'running'
      : statusRaw === 'completed'
      ? 'completed'
      : statusRaw === 'killed'
      ? 'killed'
      : statusRaw
      ? 'error'
      : isError
      ? 'error'
      : 'unknown'
  return {
    status,
    exitCode: getTag(raw, 'exit_code') || getTag(raw, 'exitCode'),
    stdout: getTag(raw, 'stdout') ?? '',
    stderr: getTag(raw, 'stderr') ?? ''
  }
}

function collectShells(
  messages: ReadonlyArray<{ blocks: ReadonlyArray<MessageBlock>; createdAt: number }>
): Shell[] {
  const map = new Map<string, Shell>()
  // Pending Bash starts indexed by tool callId so we can attach the bash_id
  // once the result lands.
  const pendingByCallId = new Map<string, { command: string; description?: string; ts: number }>()

  const walk = (call: PersistedToolCall, ts: number) => {
    if (call.tool === 'Bash' && call.input && typeof call.input === 'object') {
      const o = call.input as Record<string, unknown>
      if (o.run_in_background === true) {
        const command = typeof o.command === 'string' ? o.command : ''
        const description = typeof o.description === 'string' ? o.description : undefined
        if (call.output !== undefined) {
          const id = parseTaskId(call.output)
          if (id) {
            // Initial Bash call may already include some stdout/stderr.
            const parsed = parseTaskOutput(call.output, call.isError)
            if (!map.has(id)) {
              map.set(id, {
                bashId: id,
                command,
                description,
                status: parsed.status === 'unknown' ? 'running' : parsed.status,
                exitCode: parsed.exitCode,
                startedAt: ts,
                lastUpdate: ts,
                stdout: parsed.stdout,
                stderr: parsed.stderr,
                pollCount: 0
              })
            }
          }
        } else {
          pendingByCallId.set(call.callId, { command, description, ts })
        }
      }
    }
    // TaskOutput is the modern poll tool; older sessions may have BashOutput.
    // Only update an existing shell entry — Task* tools also operate on
    // sub-agent tasks (Task tool dispatches), which we don't surface here.
    if (call.tool === 'TaskOutput' || call.tool === 'BashOutput') {
      const id = inputTaskId(call.input)
      if (id && call.output !== undefined) {
        const parsed = parseTaskOutput(call.output, call.isError)
        const entry = map.get(id)
        if (entry) {
          const terminal =
            entry.status === 'killed' || entry.status === 'completed' || entry.status === 'error'
          if (!terminal) entry.status = parsed.status === 'unknown' ? entry.status : parsed.status
          if (parsed.exitCode) entry.exitCode = parsed.exitCode
          // Output is full snapshot in modern SDK (BashOutput returns total
          // stdout/stderr each time), so replace rather than concat.
          if (parsed.stdout) entry.stdout = parsed.stdout
          if (parsed.stderr) entry.stderr = parsed.stderr
          entry.lastUpdate = ts
          entry.pollCount += 1
        }
      }
    }
    // Claude often skips TaskOutput and just reads the persisted task output
    // file directly via Read. Detect that pattern, pair to the shell entry,
    // and parse stdout / exit code / interruption markers from the file body.
    if (call.tool === 'Read' && call.input && typeof call.input === 'object') {
      const filePath = (call.input as Record<string, unknown>).file_path
      if (typeof filePath === 'string') {
        const m = filePath.match(/\/tasks\/([A-Za-z0-9_-]+)\.output\b/)
        if (m && call.output !== undefined) {
          const id = m[1]
          const entry = map.get(id)
          if (entry) {
            const body = asString(call.output)
            // Read prefixes lines with "   N→" cat-n style. Strip that for
            // a faithful stdout view.
            const stripped = body.replace(/^\s*\d+→/gm, '')
            const exitMatch =
              stripped.match(/(?:^|\n)\s*(?:Exit\s*code|Exit|exit_code|exitCode)\s*[:=]?\s*(\d+)/i)
            const interrupted =
              /\b(killed|terminated|interrupted|sigterm|sigkill)\b/i.test(stripped)
            const terminal =
              entry.status === 'killed' ||
              entry.status === 'completed' ||
              entry.status === 'error'
            if (stripped) entry.stdout = stripped
            if (exitMatch) {
              entry.exitCode = exitMatch[1]
              if (!terminal) entry.status = exitMatch[1] === '0' ? 'completed' : 'error'
            } else if (interrupted) {
              if (!terminal) entry.status = 'killed'
            } else if (!terminal) {
              // No explicit markers — but Claude reading the persisted output
              // file usually means the task finished and it's collecting the
              // result. Optimistically mark completed; if it was actually a
              // mid-flight peek, the next Refresh re-evaluates.
              entry.status = 'completed'
            }
            entry.lastUpdate = ts
          }
        }
      }
    }
    // TaskStop is the modern kill tool; older sessions may have KillBash.
    // Only flip status when we already track this id as a shell — sub-agent
    // task stops should not invent shell rows.
    if (call.tool === 'TaskStop' || call.tool === 'KillBash') {
      const id = inputTaskId(call.input)
      if (id) {
        const entry = map.get(id)
        if (entry) {
          entry.status = 'killed'
          entry.lastUpdate = ts
        }
      }
    }
    if (call.children) for (const c of call.children) walk(c, ts)
  }

  for (const m of messages) {
    for (const b of m.blocks) {
      if (b.kind !== 'tool') continue
      walk(b.call, m.createdAt)
    }
  }

  // Sort: running first, then most recent activity.
  return Array.from(map.values()).sort((a, b) => {
    const ar = a.status === 'running' ? 0 : 1
    const br = b.status === 'running' ? 0 : 1
    if (ar !== br) return ar - br
    return b.lastUpdate - a.lastUpdate
  })
}

function formatRuntime(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ${m % 60}m`
  const d = Math.floor(h / 24)
  return `${d}d ${h % 24}h ${m % 60}m`
}

function lineCount(s: string): number {
  if (!s) return 0
  let n = 1
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 10) n++
  if (s.endsWith('\n')) n--
  return n
}

function byteSize(s: string): string {
  const b = new Blob([s]).size
  if (b < 1024) return `${b}B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)}KB`
  return `${(b / (1024 * 1024)).toFixed(1)}MB`
}

export function hasShells(
  messages: ReadonlyArray<{ blocks: ReadonlyArray<MessageBlock>; createdAt: number }>
): boolean {
  // Mirrors ShellPanel's render filter: sidebar only shows running shells.
  // If a session has only finished shells, the panel renders nothing — so
  // the rail's empty-state check should treat that as "no shells" too.
  return collectShells(messages).some((s) => s.status === 'running')
}

// Per-session optimistic overrides. Keyed sessionId → bashId → status.
// User clicks Stop; we don't wait for the model to actually invoke KillBash
// before flipping the badge — the model may pick the wrong tool, or the shell
// may have been killed in a previous session and we'd never see proof.
// Module-level so it survives panel re-mounts within a session.
const OPTIMISTIC: Map<string, Map<string, ShellStatus>> = new Map()
// Dismissed shells — hidden from the sidebar entirely. Keyed sessionId →
// Set<bashId>. Independent of status so user can dismiss any state.
const DISMISSED: Map<string, Set<string>> = new Map()

function getOverride(sessionId: string, bashId: string): ShellStatus | undefined {
  return OPTIMISTIC.get(sessionId)?.get(bashId)
}
function setOverride(sessionId: string, bashId: string, status: ShellStatus): void {
  let m = OPTIMISTIC.get(sessionId)
  if (!m) {
    m = new Map()
    OPTIMISTIC.set(sessionId, m)
  }
  m.set(bashId, status)
}
function isDismissed(sessionId: string, bashId: string): boolean {
  return DISMISSED.get(sessionId)?.has(bashId) ?? false
}
function dismiss(sessionId: string, bashId: string): void {
  let s = DISMISSED.get(sessionId)
  if (!s) {
    s = new Set()
    DISMISSED.set(sessionId, s)
  }
  s.add(bashId)
}

export function ShellPanel({ session }: { session: Session | null }) {
  const messages = useSessionStore((s) => (session ? s.messages[session.id] ?? EMPTY : EMPTY))
  const isStreaming = useSessionStore((s) => (session ? s.streamingSessions.has(session.id) : false))
  const { send } = useSessions()
  const [openId, setOpenId] = useState<string | null>(null)
  // Bump to re-render after writing to module-level OPTIMISTIC map.
  const [, setTick] = useState(0)

  if (!session) return null
  const collected = collectShells(messages)
  // Apply optimistic overrides + filter dismissed + only show running shells
  // in the sidebar. Completed / killed / errored ones drop off automatically.
  const shells = collected
    .filter((sh) => !isDismissed(session.id, sh.bashId))
    .map((sh) => {
      const ov = getOverride(session.id, sh.bashId)
      if (!ov) return sh
      if (ov === 'killed' && sh.status !== 'completed') {
        return { ...sh, status: 'killed' as const }
      }
      return sh
    })
    .filter((sh) => sh.status === 'running')
  if (shells.length === 0) return null

  const running = shells.length
  const dismissedCount = 0
  const now = Date.now()
  const handleDismiss = (id: string) => {
    dismiss(session.id, id)
    if (openId === id) setOpenId(null)
    setTick((t) => t + 1)
  }
  const clearFinished = () => {
    for (const sh of shells) {
      if (sh.status === 'killed' || sh.status === 'completed' || sh.status === 'error') {
        dismiss(session.id, sh.bashId)
      }
    }
    setOpenId(null)
    setTick((t) => t + 1)
  }

  const refresh = (id: string) => {
    if (isStreaming) return
    void send(
      session.id,
      `${FOLK_INTERNAL_MARK}\nCall the TaskOutput tool now with task_id="${id}" and block=false. Do not explain — just invoke the tool and report stdout/stderr/exit status.`,
      undefined,
      { silent: true }
    )
  }
  const stop = (id: string) => {
    if (isStreaming) return
    setOverride(session.id, id, 'killed')
    setTick((t) => t + 1)
    void send(
      session.id,
      `${FOLK_INTERNAL_MARK}\nCall the TaskStop tool now with task_id="${id}". This is a direct command — do not ask for confirmation, do not explain, just invoke TaskStop. After it returns, call TaskOutput once with task_id="${id}" and block=false to confirm the task is no longer running.`,
      undefined,
      { silent: true }
    )
  }

  return (
    <section className="sctx-section sh-panel">
      <div className="sctx-hd">
        <Icon name="terminal" size={11} />
        <span className="sctx-title">Shells</span>
        <span className="sctx-count">{shells.length}</span>
        {running > 0 && <span className="sh-running-pill">{running} running</span>}
        {dismissedCount > 0 && (
          <button
            type="button"
            className="sh-clear-btn"
            onClick={clearFinished}
            title="Hide all stopped/completed shells"
          >
            Clear
          </button>
        )}
      </div>
      <ul className="sh-list">
        {shells.map((sh) => {
          const isOpen = openId === sh.bashId
          const endTs = sh.status === 'running' ? now : sh.lastUpdate
          const runtime = formatRuntime(Math.max(0, endTs - sh.startedAt))
          const out = sh.stdout || sh.stderr
          const lines = lineCount(out)
          return (
            <li key={sh.bashId} className={`sh-item sh-${sh.status}`}>
              <div className="sh-row-wrap">
                <button
                  type="button"
                  className="sh-row"
                  onClick={() => setOpenId(isOpen ? null : sh.bashId)}
                  aria-expanded={isOpen}
                >
                  <span className="sh-caret" aria-hidden="true">
                    <Icon name="chevronRight" size={12} />
                  </span>
                  <span className={`sh-dot sh-dot-${sh.status}`} aria-hidden="true" />
                  <span className="sh-cmd trunc" title={sh.command || sh.bashId}>
                    {sh.command || sh.bashId}
                  </span>
                  <span className="sh-meta">{runtime}</span>
                </button>
                <button
                  type="button"
                  className="sh-dismiss"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDismiss(sh.bashId)
                  }}
                  title="Hide from sidebar"
                  aria-label="Hide shell from sidebar"
                >
                  <Icon name="x" size={11} />
                </button>
              </div>
              {isOpen && (
                <div className="sh-detail">
                  <div className="sh-kv">
                    <span className="sh-k">Status</span>
                    <span className={`sh-v sh-v-${sh.status}`}>
                      {sh.status}
                      {sh.exitCode ? ` · exit ${sh.exitCode}` : ''}
                    </span>
                  </div>
                  <div className="sh-kv">
                    <span className="sh-k">Shell</span>
                    <span className="sh-v sh-mono">{sh.bashId}</span>
                  </div>
                  <div className="sh-kv">
                    <span className="sh-k">Runtime</span>
                    <span className="sh-v">{runtime}</span>
                  </div>
                  {sh.command && (
                    <div className="sh-kv">
                      <span className="sh-k">Command</span>
                      <span className="sh-v sh-mono trunc" title={sh.command}>
                        {sh.command}
                      </span>
                    </div>
                  )}
                  <div className="sh-out-hd">
                    <span>Output</span>
                    <span className="sh-out-meta">
                      {lines} lines · {byteSize(out)} · {sh.pollCount} polls
                    </span>
                  </div>
                  <pre className="sh-out">{out || '(no output captured yet)'}</pre>
                  {sh.stderr && sh.stdout && (
                    <>
                      <div className="sh-out-hd">
                        <span>stderr</span>
                      </div>
                      <pre className="sh-out sh-err">{sh.stderr}</pre>
                    </>
                  )}
                  <div className="sh-actions">
                    <button
                      type="button"
                      className="sh-btn"
                      disabled={isStreaming || sh.status !== 'running'}
                      onClick={() => refresh(sh.bashId)}
                      title={isStreaming ? 'Wait for the current turn to finish' : ''}
                    >
                      <Icon name="refresh" size={11} /> Refresh
                    </button>
                    <button
                      type="button"
                      className="sh-btn sh-btn-danger"
                      disabled={isStreaming || sh.status !== 'running'}
                      onClick={() => stop(sh.bashId)}
                      title={isStreaming ? 'Wait for the current turn to finish' : ''}
                    >
                      <Icon name="x" size={11} /> Stop
                    </button>
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
