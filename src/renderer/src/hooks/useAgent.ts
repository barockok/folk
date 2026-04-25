import { useEffect } from 'react'
import { useSessionStore } from '../stores/useSessionStore'
import { useUIStore } from '../stores/useUIStore'

export function useAgent(): void {
  const {
    appendChunk,
    appendThinking,
    appendToolCall,
    appendToolResult,
    appendNotice,
    appendUsage,
    setError,
    markIdle
  } = useSessionStore()
  const { toast } = useUIStore()
  useEffect(() => {
    const offs = [
      window.folk.agent.onChunk((e) => appendChunk(e)),
      window.folk.agent.onThinking((e) => appendThinking(e)),
      window.folk.agent.onToolCall((e) => appendToolCall(e)),
      window.folk.agent.onToolResult((e) => appendToolResult(e)),
      window.folk.agent.onDone((e) => markIdle(e.sessionId)),
      window.folk.agent.onNotice((e) => appendNotice(e)),
      window.folk.agent.onUsage((e) => appendUsage(e)),
      window.folk.agent.onError((e) => {
        setError(e)
        toast({ kind: 'err', text: e.message })
      })
    ]
    return () => offs.forEach((o) => o())
  }, [
    appendChunk,
    appendThinking,
    appendToolCall,
    appendToolResult,
    appendNotice,
    appendUsage,
    setError,
    markIdle,
    toast
  ])
}
