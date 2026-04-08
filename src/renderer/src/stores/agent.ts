import { create } from 'zustand'
import type { LlamaStatus, ToolCallStart, ToolCallResult, Artifact } from '../../../shared/types'

interface AgentState {
  llamaStatus: LlamaStatus
  isProcessing: boolean
  toolCalls: (ToolCallStart & { result?: ToolCallResult })[]
  artifacts: Artifact[]
  setLlamaStatus: (status: LlamaStatus) => void
  setProcessing: (processing: boolean) => void
  addToolCall: (call: ToolCallStart) => void
  completeToolCall: (result: ToolCallResult) => void
  addArtifact: (artifact: Artifact) => void
  clearToolCalls: () => void
}

export const useAgentStore = create<AgentState>((set) => ({
  llamaStatus: 'stopped',
  isProcessing: false,
  toolCalls: [],
  artifacts: [],

  setLlamaStatus: (status: LlamaStatus) => {
    set({ llamaStatus: status })
  },

  setProcessing: (processing: boolean) => {
    set({ isProcessing: processing })
  },

  addToolCall: (call: ToolCallStart) => {
    set((state) => ({
      toolCalls: [...state.toolCalls, call]
    }))
  },

  completeToolCall: (result: ToolCallResult) => {
    set((state) => ({
      toolCalls: state.toolCalls.map((tc) =>
        tc.id === result.id ? { ...tc, result } : tc
      )
    }))
  },

  addArtifact: (artifact: Artifact) => {
    set((state) => ({
      artifacts: [...state.artifacts, artifact]
    }))
  },

  clearToolCalls: () => {
    set({ toolCalls: [] })
  }
}))
