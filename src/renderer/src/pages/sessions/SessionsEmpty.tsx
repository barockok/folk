interface Props {
  hasSessions: boolean
  onNew: () => void
}

export function SessionsEmpty({ hasSessions, onNew }: Props) {
  return (
    <div className="sess-empty" role="region" aria-label="No active session">
      <div className="sess-empty-stage">
        <div className="sess-empty-rail" aria-hidden>
          <span className="sess-empty-rail-line" />
          <span className="sess-empty-rail-dot" />
        </div>
        <div className="sess-empty-content">
          <span className="sess-empty-eyebrow">workspace</span>
          <h1 className="sess-empty-title">
            {hasSessions ? (
              <>
                A clean slate.
                <span className="sess-empty-title-soft">Pick a thread, or start a new one.</span>
              </>
            ) : (
              <>
                Begin a conversation.
                <span className="sess-empty-title-soft">Local-first. Properly formatted.</span>
              </>
            )}
          </h1>
          <p className="sess-empty-lede">
            {hasSessions
              ? 'Threads from the rail are kept on disk as plain JSONL — open one to resume, or open a fresh canvas.'
              : 'Spin up a Claude Code session in any folder, with your own keys. Transcripts stay on your machine.'}
          </p>
          <div className="sess-empty-actions">
            <button className="sess-empty-cta" onClick={onNew} type="button">
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              <span>New session</span>
            </button>
            <span className="sess-empty-hint">
              <span>or press</span>
              <kbd className="kbd">⌘</kbd>
              <kbd className="kbd">K</kbd>
              <span>to search</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
