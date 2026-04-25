import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useProviders } from '../../hooks/useProviders'
import { useSessionStore } from '../../stores/useSessionStore'
import { useUIStore } from '../../stores/useUIStore'
import {
  filterCommands,
  findCommand,
  type SlashCommand,
  type SlashContext
} from '../../slash-commands'
import type { Attachment, DiscoveredCommand, PermissionMode, Session } from '@shared/types'

const PERMISSION_LABELS: Record<PermissionMode, { label: string; hint: string }> = {
  default: { label: 'Ask', hint: 'Prompt before risky tools' },
  acceptEdits: { label: 'Auto-edit', hint: 'Allow file edits without asking' },
  plan: { label: 'Plan', hint: 'Read-only planning mode' },
  bypassPermissions: { label: 'Bypass', hint: 'Skip all permission checks' }
}

interface ComposerProps {
  session: Session | null
  onSend: (text: string, attachments?: Attachment[]) => void
  onCancel: () => void
}

const EMPTY_SUGGESTIONS: string[] = []

async function fileToAttachment(f: File): Promise<Attachment> {
  const buf = await f.arrayBuffer()
  let binary = ''
  const bytes = new Uint8Array(buf)
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  const dataBase64 = btoa(binary)
  return {
    kind: f.type.startsWith('image/') ? 'image' : f.type.startsWith('text/') ? 'text' : 'binary',
    name: f.name,
    mimeType: f.type || 'application/octet-stream',
    size: f.size,
    dataBase64
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function Composer({ session, onSend, onCancel }: ComposerProps) {
  const [text, setText] = useState('')
  const [modelPopOpen, setModelPopOpen] = useState(false)
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [slashIndex, setSlashIndex] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const dragCounterRef = useRef(0)
  const { enabledModels } = useProviders()

  // Discover user/project commands from ~/.claude/commands and project dir.
  // These extend the built-in slash registry as `prompt`-kind entries: when
  // picked, we read the file body and ship it to the agent verbatim.
  const [diskCommands, setDiskCommands] = useState<DiscoveredCommand[]>([])
  useEffect(() => {
    let cancelled = false
    void window.folk.discover.commands(session?.workingDir).then((list) => {
      if (!cancelled) setDiskCommands(list)
    })
    return () => {
      cancelled = true
    }
  }, [session?.workingDir])

  const diskAsSlash: SlashCommand[] = useMemo(
    () =>
      diskCommands.map((c) => ({
        name: c.name,
        description: c.description || `${c.scope} command`,
        kind: 'prompt' as const,
        run: async (ctx) => {
          const body = await window.folk.discover.readCommand(c.path)
          if (typeof body !== 'string') {
            ctx.toast('err', body.error)
            return
          }
          // Strip frontmatter before pushing.
          const stripped = body.replace(/^---[\s\S]*?\n---\s*\n?/, '')
          ctx.send(stripped.trim() || `/${c.name}`)
        }
      })),
    [diskCommands]
  )

  // Slash autocomplete: only when text starts with `/` and has no spaces yet
  // (multi-token slash forms like `/foo bar` skip the menu and run the command
  // verbatim).
  const slashOpen = text.startsWith('/') && !text.includes(' ') && text.length > 0
  const slashMatches = useMemo<SlashCommand[]>(() => {
    if (!slashOpen) return []
    const builtin = filterCommands(text)
    const q = text.replace(/^\//, '').toLowerCase()
    const disk = diskAsSlash.filter(
      (c) =>
        !q ||
        c.name.toLowerCase().startsWith(q) ||
        c.description.toLowerCase().includes(q)
    )
    // De-dup: built-in wins on name collision.
    const have = new Set(builtin.map((c) => c.name))
    return [...builtin, ...disk.filter((c) => !have.has(c.name))]
  }, [slashOpen, text, diskAsSlash])

  const disabled = !session

  // Auto-grow textarea
  const handleInput = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 180) + 'px'
  }, [])

  const setPage = useUIStore((s) => s.setPage)
  const toast = useUIStore((s) => s.toast)
  const promptSuggestions = useSessionStore((s) =>
    session ? s.promptSuggestions[session.id] ?? EMPTY_SUGGESTIONS : EMPTY_SUGGESTIONS
  )
  const clearPromptSuggestions = useSessionStore((s) => s.clearPromptSuggestions)

  const newSession = useCallback(async () => {
    if (!session) {
      toast({ kind: 'info', text: 'No active session to clone — start a new one from the sidebar.' })
      return
    }
    const created = await window.folk.sessions.create({
      modelId: session.modelId,
      workingDir: session.workingDir,
      flags: session.flags ?? undefined,
      goal: session.goal ?? undefined
    })
    const st = useSessionStore.getState()
    st.upsertSession(created)
    st.setActive(created.id)
    toast({ kind: 'ok', text: 'Started a fresh session.' })
  }, [session, toast])

  const exportTranscript = useCallback(async () => {
    if (!session) return
    const messages = useSessionStore.getState().messages[session.id] ?? []
    const lines: string[] = [`# folk transcript — ${session.title || session.id}`, '']
    for (const m of messages) {
      if (m.role === 'system') {
        const txt = m.blocks.find((b) => b.kind === 'text')?.text
        lines.push('---', txt ? `_${txt}_` : '_context boundary_', '---', '')
        continue
      }
      lines.push(`## ${m.role === 'user' ? 'You' : 'folk'}`)
      for (const b of m.blocks) {
        if (b.kind === 'text') lines.push(b.text)
        else if (b.kind === 'thinking') lines.push(`> _thinking:_ ${b.text}`)
        else if (b.kind === 'tool')
          lines.push(`\`\`\`tool ${b.call.tool}\n${JSON.stringify(b.call.input, null, 2)}\n\`\`\``)
      }
      lines.push('')
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `folk-${session.id}.md`
    a.click()
    URL.revokeObjectURL(url)
    toast({ kind: 'ok', text: 'Transcript exported.' })
  }, [session, toast])

  const showCost = useCallback(() => {
    if (!session) return
    const stats = useSessionStore.getState().stats[session.id]
    if (!stats || stats.numTurns === 0) {
      toast({ kind: 'info', text: 'No turns yet — usage will appear after the first reply.' })
      return
    }
    const fmt = (n: number) => n.toLocaleString()
    const summary = [
      `cost: $${stats.costUsd.toFixed(4)} over ${stats.numTurns} turn(s)`,
      `tokens: ${fmt(stats.inputTokens)} in / ${fmt(stats.outputTokens)} out`,
      `cache: ${fmt(stats.cacheReadTokens)} read / ${fmt(stats.cacheCreateTokens)} created`
    ].join(' · ')
    useSessionStore.getState().appendNotice({
      sessionId: session.id,
      kind: 'compact_boundary',
      text: summary
    })
  }, [session, toast])

  const showStatus = useCallback(() => {
    if (!session) return
    const stats = useSessionStore.getState().stats[session.id]
    const last = stats
      ? `last turn: ${(stats.lastDurationMs / 1000).toFixed(1)}s · ${stats.lastInputTokens} in / ${stats.lastOutputTokens} out`
      : 'no turns yet'
    const summary = [
      `model: ${session.modelId}`,
      `cwd: ${session.workingDir}`,
      `state: ${session.status}`,
      last
    ].join(' · ')
    useSessionStore.getState().appendNotice({
      sessionId: session.id,
      kind: 'compact_boundary',
      text: summary
    })
  }, [session])

  const slashCtx: SlashContext = useMemo(
    () => ({
      session,
      setPage,
      newSession,
      exportTranscript,
      toast: (kind, t) => toast({ kind, text: t }),
      openModelPopover: () => setModelPopOpen(true),
      send: (t) => onSend(t),
      cancel: onCancel,
      showCost,
      showStatus
    }),
    [session, setPage, newSession, exportTranscript, toast, onSend, onCancel, showCost, showStatus]
  )

  const runSlash = useCallback(
    async (cmd: SlashCommand) => {
      setText('')
      if (textareaRef.current) textareaRef.current.style.height = 'auto'
      if (cmd.kind === 'prompt' && cmd.promptText) {
        onSend(cmd.promptText)
        return
      }
      try {
        await cmd.run?.(slashCtx)
      } catch (err) {
        toast({ kind: 'err', text: (err as Error).message })
      }
    },
    [slashCtx, onSend, toast]
  )

  const handleSend = useCallback(() => {
    const trimmed = text.trim()
    if (!trimmed || disabled) return
    // Slash dispatch: a single-token leading-slash entry runs as a command
    // instead of being shipped to the agent verbatim.
    if (trimmed.startsWith('/') && !trimmed.includes(' ')) {
      const name = trimmed.slice(1).toLowerCase()
      const cmd = findCommand(trimmed) ?? diskAsSlash.find((c) => c.name.toLowerCase() === name)
      if (cmd) {
        void runSlash(cmd)
        return
      }
    }
    onSend(trimmed, attachments.length > 0 ? attachments : undefined)
    if (session) clearPromptSuggestions(session.id)
    setText('')
    setAttachments([])
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [text, disabled, onSend, attachments, runSlash, diskAsSlash, session, clearPromptSuggestions])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (slashOpen && slashMatches.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setSlashIndex((i) => (i + 1) % slashMatches.length)
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          setSlashIndex((i) => (i - 1 + slashMatches.length) % slashMatches.length)
          return
        }
        if (e.key === 'Tab') {
          e.preventDefault()
          const pick = slashMatches[slashIndex] ?? slashMatches[0]
          if (pick) setText('/' + pick.name)
          return
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          setText('')
          return
        }
        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
          e.preventDefault()
          const pick = slashMatches[slashIndex] ?? slashMatches[0]
          if (pick) void runSlash(pick)
          return
        }
      }
      // Enter sends. Shift+Enter inserts a newline (default behavior).
      // IME composition (e.nativeEvent.isComposing) must not trigger send.
      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend, slashOpen, slashMatches, slashIndex, runSlash]
  )

  // Reset slash highlight whenever the menu reopens or the filter changes.
  useEffect(() => {
    if (!slashOpen) return
    setSlashIndex(0)
  }, [slashOpen, slashMatches.length])

  // Close popover on outside click
  useEffect(() => {
    if (!modelPopOpen) return
    const handler = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) {
        setModelPopOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [modelPopOpen])

  // Drag-and-drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current++
    if (dragCounterRef.current === 1) setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current--
    if (dragCounterRef.current === 0) setIsDragging(false)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
  }, [])

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      dragCounterRef.current = 0
      setIsDragging(false)
      const files = Array.from(e.dataTransfer.files)
      if (files.length === 0) return
      const newAtts = await Promise.all(files.map(fileToAttachment))
      setAttachments((prev) => [...prev, ...newAtts])
    },
    []
  )

  // Paste handler for clipboard images
  const handlePaste = useCallback(
    async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = Array.from(e.clipboardData.items)
      const imageItems = items.filter(
        (item) => item.kind === 'file' && item.type.startsWith('image/')
      )
      if (imageItems.length === 0) return
      e.preventDefault()
      const files = imageItems.map((item) => item.getAsFile()).filter((f): f is File => f !== null)
      const newAtts = await Promise.all(files.map(fileToAttachment))
      setAttachments((prev) => [...prev, ...newAtts])
    },
    []
  )

  const removeAttachment = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index))
  }, [])

  // Derive display label for the active model
  const activeModel =
    enabledModels.find((m) => m.id === selectedModelId) ??
    (session
      ? enabledModels.find((m) => m.id === session.modelId)
      : null) ??
    enabledModels[0] ??
    null

  const activeLabel = activeModel
    ? activeModel.label ?? activeModel.id
    : session?.modelId ?? 'No model'

  // Group models by provider
  const byProvider = enabledModels.reduce<
    Record<string, { providerName: string; models: typeof enabledModels }>
  >((acc, m) => {
    if (!acc[m.providerId]) {
      acc[m.providerId] = { providerName: m.providerName, models: [] }
    }
    acc[m.providerId].models.push(m)
    return acc
  }, {})

  const isRunning = session?.status === 'running'

  // Error banner: last assistant message error for this session
  const lastErr = useSessionStore((s) => {
    if (!session) return null
    const msgs = s.messages[session.id] ?? []
    const lastAsst = [...msgs].reverse().find((m) => m.role === 'assistant')
    return lastAsst?.error ?? null
  })

  // Last user message for crash retry
  const lastUser = useSessionStore((s) => {
    if (!session) return null
    const msgs = s.messages[session.id] ?? []
    return [...msgs].reverse().find((m) => m.role === 'user') ?? null
  })

  const hasProvider = enabledModels.length > 0

  // Determine banner to show (no-provider takes precedence over error)
  const showNoBanner = !hasProvider
  const showErrBanner = !showNoBanner && lastErr != null && lastErr.code !== 'cancelled'

  // Derive error message + action from code
  const bannerMsg = lastErr
    ? lastErr.code === 'auth'
      ? 'Invalid API key.'
      : lastErr.code === 'quota'
        ? 'Rate limited. Try again in a moment.'
        : lastErr.code === 'offline'
          ? 'No connection.'
          : lastErr.code === 'crash'
            ? 'Agent crashed.'
            : lastErr.code === 'invalid-model'
              ? 'Selected model is invalid or unavailable.'
              : lastErr.message
    : ''

  const bannerStyles: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '7px 12px',
    margin: '0 0 6px 0',
    background: 'color-mix(in srgb, var(--err) 10%, transparent)',
    border: '1px solid color-mix(in srgb, var(--err) 30%, transparent)',
    borderRadius: 'var(--r-sm)',
    fontSize: 12,
    color: 'var(--err)',
    fontFamily: 'var(--ff-sans)'
  }

  const noBannerStyles: React.CSSProperties = {
    ...bannerStyles,
    background: 'color-mix(in srgb, var(--warn) 10%, transparent)',
    border: '1px solid color-mix(in srgb, var(--warn) 30%, transparent)',
    color: 'var(--warn)'
  }

  const bannerBtnStyles: React.CSSProperties = {
    marginLeft: 'auto',
    background: 'none',
    border: '1px solid currentColor',
    borderRadius: 'var(--r-sm)',
    cursor: 'pointer',
    color: 'inherit',
    fontSize: 11,
    fontFamily: 'var(--ff-sans)',
    padding: '2px 8px',
    lineHeight: 1.6,
    flexShrink: 0
  }

  return (
    <div
      className={`composer${isDragging ? ' is-dragging' : ''}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="composer-drop">
          <div className="composer-drop-inner">
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <div className="composer-drop-title">Drop to attach</div>
            <div className="composer-drop-sub">Images, text, or binary files</div>
          </div>
        </div>
      )}

      <div className="composer-inner">
        {/* No-provider banner */}
        {showNoBanner && (
          <div style={noBannerStyles} role="alert">
            <span>Add a provider first.</span>
            <button type="button" style={bannerBtnStyles} onClick={() => setPage('model')}>
              Open Model &amp; API
            </button>
          </div>
        )}

        {/* Error banner */}
        {showErrBanner && lastErr && (
          <div style={bannerStyles} role="alert">
            <span>{bannerMsg}</span>
            {lastErr.code === 'auth' && (
              <button type="button" style={bannerBtnStyles} onClick={() => setPage('model')}>
                Open Model &amp; API
              </button>
            )}
            {lastErr.code === 'crash' && lastUser && (() => {
              const firstText = lastUser.blocks.find((b) => b.kind === 'text')
              const retryText = firstText?.kind === 'text' ? firstText.text : ''
              return (
                <button
                  type="button"
                  style={bannerBtnStyles}
                  onClick={() => retryText && onSend(retryText)}
                  disabled={!retryText}
                >
                  Retry
                </button>
              )
            })()}
          </div>
        )}

        {attachments.length > 0 && (
          <div className="composer-atts">
            {attachments.map((att, i) => (
              <div key={i} className="attach-chip">
                <div className="attach-chip-ic">
                  {att.kind === 'image' ? (
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21 15 16 10 5 21" />
                    </svg>
                  ) : att.kind === 'text' ? (
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                      <polyline points="10 9 9 9 8 9" />
                    </svg>
                  ) : (
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                      <polyline points="13 2 13 9 20 9" />
                    </svg>
                  )}
                </div>
                <div className="attach-chip-meta">
                  <div className="attach-chip-name" title={att.name}>
                    {att.name.length > 24 ? att.name.slice(0, 21) + '…' : att.name}
                  </div>
                  <div className="attach-chip-sub">{formatBytes(att.size)}</div>
                </div>
                <button
                  type="button"
                  aria-label="Remove attachment"
                  onClick={() => removeAttachment(i)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--fg-faint)',
                    padding: '2px 4px',
                    lineHeight: 1,
                    fontSize: 14,
                    borderRadius: 4,
                    flexShrink: 0
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {promptSuggestions.length > 0 && session && (
          <div className="composer-suggestions">
            {promptSuggestions.map((s) => (
              <button
                key={s}
                type="button"
                className="composer-suggestion"
                onClick={() => {
                  onSend(s)
                  clearPromptSuggestions(session.id)
                }}
                title="Send as your next message"
              >
                {s}
              </button>
            ))}
            <button
              type="button"
              className="composer-suggestion-dismiss"
              aria-label="Dismiss suggestions"
              onClick={() => clearPromptSuggestions(session.id)}
            >
              ×
            </button>
          </div>
        )}
        {slashOpen && slashMatches.length > 0 && (
          <div className="slash-menu" role="listbox" aria-label="Slash commands">
            {slashMatches.map((c, i) => (
              <button
                key={c.name}
                type="button"
                role="option"
                aria-selected={i === slashIndex}
                className={`slash-item ${i === slashIndex ? 'on' : ''}`}
                onMouseEnter={() => setSlashIndex(i)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  void runSlash(c)
                }}
              >
                <span className="slash-name">/{c.name}</span>
                <span className="slash-kind">{c.kind}</span>
                <span className="slash-desc">{c.description}</span>
              </button>
            ))}
          </div>
        )}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={disabled ? 'Select a session to start…' : 'Ask folk anything…'}
          disabled={disabled}
          rows={1}
        />
        <div className="composer-row">
          {/* Model chip + popover */}
          <div style={{ position: 'relative' }} ref={popRef}>
            <button
              className="btn btn-plain"
              style={{ fontSize: 12, fontFamily: 'var(--ff-mono)', gap: 4 }}
              onClick={() => setModelPopOpen((o) => !o)}
              title="Switch model"
              type="button"
            >
              ✦ {activeLabel} ⌄
            </button>

            {modelPopOpen && (
              <div className="model-pop">
                <div className="model-pop-hd">Model</div>
                <div className="model-pop-list">
                  {Object.entries(byProvider).map(([provId, { providerName, models }]) => (
                    <div key={provId}>
                      <div className="model-pop-group">
                        <span
                          className="prov-logo"
                          style={{ background: 'var(--stripe-purple)', color: '#fff' }}
                        >
                          {providerName.charAt(0).toUpperCase()}
                        </span>
                        {providerName}
                      </div>
                      {models.map((m) => {
                        const isOn = (selectedModelId ?? session?.modelId) === m.id
                        return (
                          <button
                            key={m.id}
                            className={`model-pop-item ${isOn ? 'on' : ''}`}
                            onClick={() => {
                              setSelectedModelId(m.id)
                              setModelPopOpen(false)
                            }}
                            type="button"
                          >
                            <div className="m-main">
                              <div className="m-disp">{m.label ?? m.id}</div>
                              <div className="m-id">{m.id}</div>
                            </div>
                            {isOn && (
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                              >
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  ))}
                  {enabledModels.length === 0 && (
                    <div style={{ padding: '12px', fontSize: 12, color: 'var(--body)' }}>
                      No models configured. Add one in Model &amp; API.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Permission mode chip */}
          {session && (
            <select
              className="btn btn-plain"
              style={{ fontSize: 12, fontFamily: 'var(--ff-mono)' }}
              value={session.permissionMode}
              title={PERMISSION_LABELS[session.permissionMode].hint}
              onChange={async (e) => {
                const mode = e.target.value as PermissionMode
                const updated = await window.folk.sessions.setPermissionMode(session.id, mode)
                useSessionStore.getState().upsertSession(updated)
                toast({ kind: 'ok', text: `Permissions: ${PERMISSION_LABELS[mode].label}` })
              }}
            >
              {(Object.keys(PERMISSION_LABELS) as PermissionMode[]).map((m) => (
                <option key={m} value={m}>
                  {PERMISSION_LABELS[m].label}
                </option>
              ))}
            </select>
          )}

          {/* Brainstorm — placeholder */}
          <button className="btn btn-plain" disabled title="Coming soon" type="button">
            Brainstorm
          </button>

          <div className="hint" style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--fg-faint)', fontFamily: 'var(--ff-mono)', display: 'flex', alignItems: 'center', gap: 6 }}>
            {isRunning ? (
              <button className="btn btn-plain" onClick={onCancel} type="button" style={{ fontSize: 12 }}>
                Cancel
              </button>
            ) : (
              <span>⌘↵</span>
            )}
          </div>

          <button
            className="btn composer-send"
            onClick={handleSend}
            disabled={disabled || !text.trim() || isRunning || !hasProvider}
            type="button"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
