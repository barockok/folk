import { useEffect } from 'react'
import { useConversationStore } from '../stores/conversation'
import { useAgentStore } from '../stores/agent'

export function useIPC(): void {
  const activeConversationId = useConversationStore((s) => s.activeConversationId)
  const appendToken = useConversationStore((s) => s.appendToken)
  const addMessage = useConversationStore((s) => s.addMessage)
  const clearStreaming = useConversationStore((s) => s.clearStreaming)
  const setLlamaStatus = useAgentStore((s) => s.setLlamaStatus)
  const setProcessing = useAgentStore((s) => s.setProcessing)
  const addToolCall = useAgentStore((s) => s.addToolCall)
  const completeToolCall = useAgentStore((s) => s.completeToolCall)
  const addArtifact = useAgentStore((s) => s.addArtifact)
  const clearToolCalls = useAgentStore((s) => s.clearToolCalls)

  useEffect(() => {
    const unsubToken = window.folk.onToken((data) => {
      if (data.conversationId === activeConversationId) {
        appendToken(data.token)
      }
    })

    const unsubComplete = window.folk.onAgentComplete((data) => {
      if (data.conversationId === activeConversationId) {
        if (data.message) {
          addMessage(data.message)
        }
        clearStreaming()
        setProcessing(false)
        clearToolCalls()
      }
    })

    const unsubError = window.folk.onAgentError((data) => {
      if (data.conversationId === activeConversationId) {
        clearStreaming()
        setProcessing(false)
        clearToolCalls()
      }
    })

    const unsubToolStart = window.folk.onToolStart((data) => {
      if (data.conversationId === activeConversationId) {
        addToolCall(data.toolCall)
      }
    })

    const unsubToolResult = window.folk.onToolResult((data) => {
      if (data.conversationId === activeConversationId) {
        completeToolCall(data.toolCall)
      }
    })

    const unsubArtifact = window.folk.onArtifact((data) => {
      if (data.conversationId === activeConversationId) {
        addArtifact(data.artifact)
      }
    })

    const unsubLlamaStatus = window.folk.onLlamaStatusChange((status) => {
      setLlamaStatus(status)
    })

    return () => {
      unsubToken()
      unsubComplete()
      unsubError()
      unsubToolStart()
      unsubToolResult()
      unsubArtifact()
      unsubLlamaStatus()
    }
  }, [
    activeConversationId,
    appendToken,
    addMessage,
    clearStreaming,
    setLlamaStatus,
    setProcessing,
    addToolCall,
    completeToolCall,
    addArtifact,
    clearToolCalls
  ])
}
