import { useState, useRef, useEffect, useCallback } from 'react'
import { useProviders } from '../../hooks/useProviders'
import type { Session } from '@shared/types'

interface ComposerProps {
  session: Session | null
  onSend: (text: string) => void
  onCancel: () => void
}

export function Composer({ session, onSend, onCancel }: ComposerProps) {
  const [text, setText] = useState('')
  const [modelPopOpen, setModelPopOpen] = useState(false)
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
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
    onSend(trimmed)
    setText('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [text, disabled, onSend])

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
    <div className="composer">
      <div className="composer-inner">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
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
