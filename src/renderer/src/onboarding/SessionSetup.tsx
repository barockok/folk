// SessionSetup.tsx — in-place new-session sheet with YOLO guard (Task 35)
import { useState, useMemo } from 'react'
import type { SessionConfig } from '@shared/types'
import { useProviders } from '../hooks/useProviders'
import { useMCPStore } from '../stores/useMCPStore'
import { useUIStore } from '../stores/useUIStore'
import { Icon } from '../components/icons'
import {
  loadDefaultSessionConfig,
  saveDefaultSessionConfig,
  clearDefaultSessionConfig
} from '../lib/defaultSessionConfig'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SessionSetupProps {
  onLaunch: (config: SessionConfig) => Promise<void>
  onCancel: () => void
}

type PermMode = 'ask' | 'skip'

// ---------------------------------------------------------------------------
// Command preview builder
// ---------------------------------------------------------------------------

function buildCommand(
  modelId: string,
  folder: string,
  permMode: PermMode,
  extraFlags: string
): string {
  const parts: string[] = ['claude-code']
  if (modelId) parts.push(`--model ${modelId}`)
  if (permMode === 'skip') parts.push('--dangerously-skip-permissions')
  if (extraFlags.trim()) parts.push(extraFlags.trim())
  parts.push(folder || '<folder>')
  return parts.join(' \\\n  ')
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="ss-section-lbl">{children}</div>
}

interface PermCardProps {
  mode: 'ask' | 'skip'
  selected: boolean
  onSelect: () => void
}

function PermCard({ mode, selected, onSelect }: PermCardProps) {
  const isSkip = mode === 'skip'
  return (
    <div
      className={`ss-perm${isSkip ? ' danger' : ''}${selected ? ' on' : ''}`}
      role="radio"
      aria-checked={selected}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect()}
    >
      <div className={`ss-perm-ic ${isSkip ? 'risky' : 'safe'}`}>
        <Icon name={isSkip ? 'bolt' : 'shield'} size={14} />
      </div>
      <div className="ss-perm-body">
        <div className="ss-perm-title">
          {isSkip ? (
            <>
              Skip permissions
              <span className="ss-perm-flag ss-perm-flag--mono">
                --dangerously-skip-permissions
              </span>
            </>
          ) : (
            <>
              Ask before every action
              <span className="ss-perm-reco">recommended</span>
            </>
          )}
        </div>
        <div className="ss-perm-sub">
          {isSkip
            ? 'Claude acts autonomously without confirmation prompts.'
            : 'Claude will ask for approval before running tools or writing files.'}
        </div>
      </div>
      {selected && (
        <div className="ss-perm-check">
          <Icon name="check" size={13} />
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SessionSetup({ onLaunch, onCancel }: SessionSetupProps) {
  const { enabledModels } = useProviders()
  const mcpServers = useMCPStore((s) => s.servers)
  const toast = useUIStore((s) => s.toast)
  // Servers eligible for the picker — globally-enabled, owned by folk (skip
  // read-only locals which the SDK loads from its own discovery anyway).
  const eligibleMcps = useMemo(
    () => mcpServers.filter((s) => s.isEnabled && s.source !== 'local'),
    [mcpServers]
  )

  const savedDefault = useMemo(() => loadDefaultSessionConfig(), [])
  const hasSavedDefault = savedDefault != null

  // --- form state, hydrated from saved defaults if present ---
  const [folder, setFolder] = useState(savedDefault?.workingDir ?? '')
  const [selectedModelId, setSelectedModelId] = useState<string>(
    savedDefault?.modelId ?? enabledModels[0]?.id ?? ''
  )
  const [advOpen, setAdvOpen] = useState(false)
  const [permMode, setPermMode] = useState<PermMode>(
    savedDefault?.permissionMode === 'bypassPermissions' ? 'skip' : 'ask'
  )
  const [yoloAck, setYoloAck] = useState(false)
  const [incognito, setIncognito] = useState(savedDefault?.incognito ?? false)
  // null = inherit (all globally-enabled MCPs); array = explicit allowlist.
  const [mcpAllow, setMcpAllow] = useState<string[] | null>(
    savedDefault?.enabledMcpIds ?? null
  )
  const [extraFlags, setExtraFlags] = useState(savedDefault?.flags ?? '')
  const [launching, setLaunching] = useState(false)
  const [saveAsDefault, setSaveAsDefault] = useState(false)

  const isYolo = permMode === 'skip'

  // Reset ack whenever permission mode changes
  function handlePermMode(m: PermMode) {
    setPermMode(m)
    if (m === 'ask') setYoloAck(false)
  }

  // Dynamic subtitle for advanced toggle
  const advSubtitle = useMemo(() => {
    const parts: string[] = []
    if (permMode === 'skip') parts.push('skip-permissions on')
    else parts.push('permissions enabled')
    if (incognito) parts.push('incognito')
    if (mcpAllow) parts.push(`${mcpAllow.length}/${eligibleMcps.length} MCPs`)
    if (extraFlags.trim()) parts.push('custom flags')
    return parts.join(' · ')
  }, [permMode, incognito, mcpAllow, eligibleMcps.length, extraFlags])

  // Command preview
  const cmdPreview = useMemo(
    () => buildCommand(selectedModelId, folder, permMode, extraFlags),
    [selectedModelId, folder, permMode, extraFlags]
  )

  // Launch disabled conditions
  const canLaunch = folder.trim() !== '' && selectedModelId !== '' && (!isYolo || yoloAck) && !launching

  async function handleLaunch() {
    if (!canLaunch) return
    setLaunching(true)
    try {
      // skip-permissions in folk maps to the SDK's permissionMode option
      // (with the matching ack flag set in agent-manager). The CLI flag is
      // not how the SDK itself reads this — passing it via extraArgs alone
      // doesn't disable prompts.
      const flags: string[] = []
      if (extraFlags.trim()) flags.push(extraFlags.trim())

      const launchConfig: SessionConfig = {
        modelId: selectedModelId,
        workingDir: folder.trim(),
        flags: flags.length ? flags.join(' ') : undefined,
        permissionMode: permMode === 'skip' ? 'bypassPermissions' : 'default',
        incognito,
        enabledMcpIds: mcpAllow
      }
      if (saveAsDefault) {
        saveDefaultSessionConfig({
          modelId: launchConfig.modelId,
          workingDir: launchConfig.workingDir,
          flags: launchConfig.flags,
          permissionMode: launchConfig.permissionMode,
          incognito: launchConfig.incognito,
          enabledMcpIds: launchConfig.enabledMcpIds
        })
        toast({ kind: 'ok', text: 'Saved as default for new sessions' })
      }
      await onLaunch(launchConfig)
    } finally {
      setLaunching(false)
    }
  }

  function handleClearDefault() {
    clearDefaultSessionConfig()
    setSaveAsDefault(false)
    toast({ kind: 'info', text: 'Default session config cleared' })
  }

  return (
    <div className="ss-wrap">
      <div className="ss-card">
        {/* Header */}
        <div className="ss-hd">
          <div>
            <div className="ss-title">New session</div>
            <p className="ss-sub">
              Configure your working folder, model, and launch options before starting.
            </p>
          </div>
        </div>

        <div className="ss-body">
          {/* ----------------------------------------------------------------
              Section 1: Working folder
          ---------------------------------------------------------------- */}
          <div>
            <SectionLabel>Working folder</SectionLabel>
            <div className="ss-folder-row">
              <div className="ss-folder-input">
                <Icon name="folder" size={14} />
                <input
                  className="input"
                  type="text"
                  placeholder="/path/to/project"
                  value={folder}
                  onChange={(e) => setFolder(e.target.value)}
                  spellCheck={false}
                  autoComplete="off"
                />
              </div>
              <button
                className="btn"
                type="button"
                onClick={async () => {
                  const picked = await window.folk.dialog.openFolder(folder.trim() || undefined)
                  if (picked) setFolder(picked)
                }}
              >
                Browse
              </button>
            </div>
          </div>

          {/* ----------------------------------------------------------------
              Section 2: Model
          ---------------------------------------------------------------- */}
          <div>
            <SectionLabel>Provider &amp; model</SectionLabel>
            {enabledModels.length === 0 ? (
              <div className="ob-note">
                <Icon name="info" size={14} />
                <span>Configure a provider in <strong>Model &amp; API</strong> first.</span>
              </div>
            ) : (
              (() => {
                const byProvider = enabledModels.reduce<
                  Record<string, { providerName: string; models: typeof enabledModels }>
                >((acc, m) => {
                  if (!acc[m.providerId])
                    acc[m.providerId] = { providerName: m.providerName, models: [] }
                  acc[m.providerId].models.push(m)
                  return acc
                }, {})
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {Object.entries(byProvider).map(([provId, { providerName, models }]) => (
                      <div key={provId}>
                        <div
                          style={{
                            fontSize: 11,
                            textTransform: 'uppercase',
                            letterSpacing: '0.06em',
                            color: 'var(--fg-faint)',
                            marginBottom: 6,
                            fontFamily: 'var(--ff-mono)'
                          }}
                        >
                          {providerName}
                        </div>
                        <div className="ss-model-grid">
                          {models.map((m) => (
                            <button
                              key={`${m.providerId}:${m.id}`}
                              type="button"
                              className={`ss-model${selectedModelId === m.id ? ' on' : ''}`}
                              onClick={() => setSelectedModelId(m.id)}
                            >
                              <div>
                                <span className="ss-model-name">{m.label || m.id}</span>
                                <span className="ss-model-sub">{m.id}</span>
                              </div>
                              {selectedModelId === m.id && (
                                <Icon
                                  name="check"
                                  size={13}
                                  style={{ marginLeft: 'auto', color: 'var(--stripe-purple)' }}
                                />
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })()
            )}
          </div>

          {/* ----------------------------------------------------------------
              Section 4: Launch options (collapsible)
          ---------------------------------------------------------------- */}
          <div className="ss-adv-section">
            <button
              type="button"
              className={`ss-adv-toggle${advOpen ? ' open' : ''}`}
              onClick={() => setAdvOpen((v) => !v)}
              aria-expanded={advOpen}
            >
              <div className="ss-adv-toggle-ic">
                <Icon name="settings" size={14} />
              </div>
              <div className="ss-adv-toggle-txt">
                <div className="ss-adv-toggle-label">Launch options</div>
                <div className="ss-adv-toggle-sub">{advSubtitle}</div>
              </div>
              {/* Status pills */}
              <div className="ss-adv-tag">
                {isYolo && (
                  <span className="ss-adv-pill warn">
                    <span className="ss-adv-pill-dot" />
                    skip-permissions
                  </span>
                )}
                {incognito && (
                  <span className="ss-adv-pill">incognito</span>
                )}
                {mcpAllow && (
                  <span className="ss-adv-pill">
                    MCPs {mcpAllow.length}/{eligibleMcps.length}
                  </span>
                )}
                {extraFlags.trim() && (
                  <span className="ss-adv-pill">+flags</span>
                )}
              </div>
              <div className="ss-adv-chev">
                <Icon name={advOpen ? 'chevronDown' : 'chevronRight'} size={14} />
              </div>
            </button>

            {advOpen && (
              <div className="ss-adv">
                {/* Permissions */}
                <div className="ss-opt-group">
                  <div className="ss-opt-head">
                    <div className="ss-opt-label">Permissions</div>
                  </div>
                  <div className="ss-perm-grid">
                    <PermCard mode="ask" selected={permMode === 'ask'} onSelect={() => handlePermMode('ask')} />
                    <PermCard mode="skip" selected={permMode === 'skip'} onSelect={() => handlePermMode('skip')} />
                  </div>
                </div>

                {/* YOLO warning block */}
                {isYolo && (
                  <div className="ss-yolo-warn">
                    <div className="ss-yolo-warn-hd">
                      <Icon name="bolt" size={14} />
                      Dangerous mode — Claude will act without confirmation
                    </div>
                    <ul className="ss-yolo-warn-list">
                      <li>
                        All file writes, deletions, and shell commands will execute immediately in{' '}
                        <code className="mono">{folder.trim() || '<folder>'}</code>.
                      </li>
                      <li>There is no undo for destructive operations.</li>
                      <li>
                        <code className="mono">--dangerously-skip-permissions</code> is passed verbatim to the Claude Code binary.
                      </li>
                    </ul>
                    <label className="ss-yolo-ack">
                      <input
                        type="checkbox"
                        checked={yoloAck}
                        onChange={(e) => setYoloAck(e.target.checked)}
                      />
                      I understand the risks and accept full responsibility
                    </label>
                  </div>
                )}

                {/* Incognito */}
                <div className="ss-opt-group">
                  <div className="ss-opt-head">
                    <div className="ss-opt-label">Incognito</div>
                  </div>
                  <label
                    className={`ss-perm${incognito ? ' on' : ''}`}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="ss-perm-ic safe">
                      <Icon name="shield" size={14} />
                    </div>
                    <div className="ss-perm-body">
                      <div className="ss-perm-title">Skip skills</div>
                      <div className="ss-perm-sub">
                        Don't load any skills from <code className="mono">~/.claude/skills</code>,
                        the project, or installed plugins. Useful for clean-room sessions.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={incognito}
                      onChange={(e) => setIncognito(e.target.checked)}
                      style={{ marginLeft: 'auto' }}
                    />
                  </label>
                </div>

                {/* MCP servers */}
                {eligibleMcps.length > 0 && (
                  <div className="ss-opt-group">
                    <div className="ss-opt-head">
                      <div className="ss-opt-label">MCP servers</div>
                      <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
                        <button
                          type="button"
                          className="btn btn-plain"
                          onClick={() => setMcpAllow(null)}
                        >
                          All (default)
                        </button>
                        <button
                          type="button"
                          className="btn btn-plain"
                          onClick={() => setMcpAllow([])}
                        >
                          None
                        </button>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {eligibleMcps.map((srv) => {
                        const inherited = mcpAllow === null
                        const checked = inherited || mcpAllow!.includes(srv.id)
                        return (
                          <label
                            key={srv.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              padding: '6px 8px',
                              border: '1px solid var(--border)',
                              borderRadius: 'var(--r-sm)',
                              cursor: 'pointer'
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                const next = inherited
                                  ? eligibleMcps.map((m) => m.id)
                                  : [...mcpAllow!]
                                if (e.target.checked) {
                                  if (!next.includes(srv.id)) next.push(srv.id)
                                } else {
                                  const i = next.indexOf(srv.id)
                                  if (i >= 0) next.splice(i, 1)
                                }
                                setMcpAllow(next)
                              }}
                            />
                            <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 12 }}>
                              {srv.name}
                            </span>
                            <span
                              style={{
                                fontSize: 11,
                                color: 'var(--fg-faint)',
                                marginLeft: 'auto'
                              }}
                            >
                              {srv.transport}
                            </span>
                          </label>
                        )
                      })}
                    </div>
                    <div
                      style={{ fontSize: 11, color: 'var(--fg-faint)', marginTop: 6 }}
                    >
                      {mcpAllow === null
                        ? 'Inherits all globally-enabled MCPs.'
                        : `Restricts this session to ${mcpAllow.length} of ${eligibleMcps.length} MCPs.`}
                    </div>
                  </div>
                )}

                {/* Raw CLI flags */}
                <div className="ss-opt-group">
                  <div className="ss-opt-head">
                    <div className="ss-opt-label">Raw CLI flags</div>
                    <a
                      className="ss-raw-link"
                      href="https://docs.anthropic.com/claude-code"
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Icon name="external" size={12} />
                      docs
                    </a>
                  </div>
                  <div className="ss-raw-input">
                    <span className="ss-raw-prefix">$</span>
                    <input
                      className="input"
                      type="text"
                      placeholder="--verbose --no-cache"
                      value={extraFlags}
                      onChange={(e) => setExtraFlags(e.target.value)}
                      spellCheck={false}
                      autoComplete="off"
                    />
                  </div>
                </div>

                {/* Command preview */}
                <div className="ss-opt-group">
                  <div className="ss-opt-label">Command preview</div>
                  <div className="ss-cmd">
                    <div className="ss-cmd-hd">
                      <Icon name="terminal" size={12} />
                      invocation
                    </div>
                    <code className="ss-cmd-body">{cmdPreview}</code>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="ss-foot">
          <button
            type="button"
            className="btn btn-plain"
            onClick={onCancel}
            disabled={launching}
          >
            Cancel
          </button>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center' }}>
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                color: 'var(--body)',
                cursor: 'pointer',
                userSelect: 'none'
              }}
              title="Persist these settings so future new sessions launch with them automatically."
            >
              <input
                type="checkbox"
                checked={saveAsDefault}
                onChange={(e) => setSaveAsDefault(e.target.checked)}
              />
              Save as default for new sessions
            </label>
            {hasSavedDefault && (
              <button
                type="button"
                className="btn btn-plain"
                onClick={handleClearDefault}
                style={{ fontSize: 11, padding: '2px 6px' }}
                title="Forget the saved default — next new session will reopen this dialog."
              >
                Clear default
              </button>
            )}
          </div>
          <button
            type="button"
            className={`btn${isYolo ? ' btn-danger-solid' : ' btn-primary'}`}
            onClick={handleLaunch}
            disabled={!canLaunch}
          >
            {launching ? (
              <>
                <span className="spinner" />
                Launching…
              </>
            ) : (
              'Launch session'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
