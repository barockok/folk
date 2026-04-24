import { useState, useRef, useEffect, useCallback } from 'react'
import { useProviders } from '../../hooks/useProviders'
import type { Attachment, Session } from '@shared/types'

interface ComposerProps {
  session: Session | null
  onSend: (text: string, attachments?: Attachment[]) => void
  onCancel: () => void
}

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
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const dragCounterRef = useRef(0)
  const { enabledModels } = useProviders()

  const disabled = !session

  // Auto-grow textarea
  const handleInput = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 180) + 'px'
  }, [])

  const handleSend = useCallback(() => {
    const trimmed = text.trim()
    if (!trimmed || disabled) return
    onSend(trimmed, attachments.length > 0 ? attachments : undefined)
    setText('')
    setAttachments([])
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [text, disabled, onSend, attachments])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend]
  )

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
            disabled={disabled || !text.trim() || isRunning}
            type="button"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
