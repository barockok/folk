// SessionSetup.tsx — in-place new-session sheet with YOLO guard (Task 35)
import { useState, useMemo } from 'react'
import type { SessionConfig } from '@shared/types'
import { useProviders } from '../hooks/useProviders'
import { Icon } from '../components/icons'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SessionSetupProps {
  onLaunch: (config: SessionConfig) => Promise<void>
  onCancel: () => void
}

type PermMode = 'ask' | 'skip'

type GoalId = 'general' | 'code' | 'research' | 'data' | 'writing' | 'ops'

interface GoalOption {
  id: GoalId
  label: string
  hint: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GOALS: GoalOption[] = [
  { id: 'general', label: 'General', hint: 'Open-ended assistance' },
  { id: 'code', label: 'Code', hint: 'Write, review, or debug code' },
  { id: 'research', label: 'Research', hint: 'Explore a topic or codebase' },
  { id: 'data', label: 'Data', hint: 'Analyse, transform, or visualise data' },
  { id: 'writing', label: 'Writing', hint: 'Docs, copy, or structured text' },
  { id: 'ops', label: 'Ops', hint: 'Infra, scripts, or automation' },
]

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

  // --- form state ---
  const [folder, setFolder] = useState('')
  const [selectedModelId, setSelectedModelId] = useState<string>(
    enabledModels[0]?.id ?? ''
  )
  const [goal, setGoal] = useState<GoalId | null>(null)
  const [advOpen, setAdvOpen] = useState(false)
  const [permMode, setPermMode] = useState<PermMode>('ask')
  const [yoloAck, setYoloAck] = useState(false)
  const [extraFlags, setExtraFlags] = useState('')
  const [launching, setLaunching] = useState(false)

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
    if (extraFlags.trim()) parts.push('custom flags')
    return parts.join(' · ')
  }, [permMode, extraFlags])

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
      const flags: string[] = []
      if (permMode === 'skip') flags.push('--dangerously-skip-permissions')
      if (extraFlags.trim()) flags.push(extraFlags.trim())

      await onLaunch({
        modelId: selectedModelId,
        workingDir: folder.trim(),
        goal: goal ?? undefined,
        flags: flags.length ? flags.join(' ') : undefined,
      })
    } finally {
      setLaunching(false)
    }
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
                disabled
                title="Coming soon"
              >
                Browse
              </button>
            </div>
          </div>

          {/* ----------------------------------------------------------------
              Section 2: Model
          ---------------------------------------------------------------- */}
          <div>
            <SectionLabel>Model</SectionLabel>
            {enabledModels.length === 0 ? (
              <div className="ob-note">
                <Icon name="info" size={14} />
                <span>Configure a provider in <strong>Model &amp; API</strong> first.</span>
              </div>
            ) : (
              <div className="ss-model-grid">
                {enabledModels.slice(0, 6).map((m) => (
                  <button
                    key={`${m.providerId}:${m.id}`}
                    type="button"
                    className={`ss-model${selectedModelId === m.id ? ' on' : ''}`}
                    onClick={() => setSelectedModelId(m.id)}
                  >
                    <div>
                      <span className="ss-model-name">{m.label || m.id}</span>
                      <span className="ss-model-sub">{m.providerName}</span>
                    </div>
                    {selectedModelId === m.id && (
                      <Icon name="check" size={13} style={{ marginLeft: 'auto', color: 'var(--stripe-purple)' }} />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ----------------------------------------------------------------
              Section 3: Goal picker
          ---------------------------------------------------------------- */}
          <div>
            <SectionLabel>What are you doing? <span style={{ fontFamily: 'var(--ff-sans)', textTransform: 'none', letterSpacing: 0, color: 'var(--fg-faint)', fontSize: '10px' }}>(optional)</span></SectionLabel>
            <div className="ss-goal-grid">
              {GOALS.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  className={`ss-goal${goal === g.id ? ' on' : ''}`}
                  onClick={() => setGoal(goal === g.id ? null : g.id)}
                >
                  <div className="ss-goal-dot" />
                  <div>
                    <span className="ss-goal-label">{g.label}</span>
                    <span className="ss-goal-hint">{g.hint}</span>
                  </div>
                </button>
              ))}
            </div>
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
          <div style={{ flex: 1 }} />
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
