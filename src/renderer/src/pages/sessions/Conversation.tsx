import { useSessionStore } from '../../stores/useSessionStore'
import type { Session } from '@shared/types'
import { ToolCard } from './ToolCard'

export function Conversation({ session }: { session: Session | null }) {
  const messages = useSessionStore((s) => (session ? s.messages[session.id] ?? [] : []))

  if (!session) {
    return <div className="session-empty">Pick a session or start a new one.</div>
  }

  return (
    <div className="conv">
      <div className="conv-inner">
        {messages.map((m) => (
          <article key={m.id} className={`msg msg-${m.role}`}>
            <div className={`msg-avatar ${m.role === 'user' ? 'user' : 'assist'}`}>
              {m.role === 'user' ? 'Y' : 'F'}
            </div>
            <div className="msg-content">
              <div className="msg-name">
                {m.role === 'user' ? 'You' : 'folk'}
                <span className="when">{new Date(m.createdAt).toLocaleTimeString()}</span>
              </div>
              {m.thinking && <pre className="msg-thinking">{m.thinking}</pre>}
              <div className="msg-body md">
                <p>{m.text}</p>
              </div>
              {m.toolCalls.map((t) => (
                <ToolCard key={t.callId} call={t} />
              ))}
              {m.error && <div className="msg-error">{m.error.message}</div>}
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
