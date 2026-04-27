import { create } from 'zustand'
import type { MCPServer, ToolInfo } from '@shared/types'

interface MCPState {
  servers: MCPServer[]
  hydrated: boolean
  load: () => Promise<void>
  save: (s: MCPServer) => Promise<void>
  setEnabled: (id: string, enabled: boolean) => Promise<void>
  remove: (id: string) => Promise<void>
  test: (id: string) => Promise<{ ok: boolean; tools: ToolInfo[]; error?: string }>
}

export const useMCPStore = create<MCPState>((set, get) => ({
  servers: [],
  hydrated: false,
  load: async () => {
    const servers = await window.folk.mcp.list()
    set({ servers, hydrated: true })
  },
  save: async (s) => {
    await window.folk.mcp.save(s)
    await get().load()
  },
  setEnabled: async (id, enabled) => {
    const target = get().servers.find((s) => s.id === id)
    if (!target || target.source === 'local') return
    // Optimistic update so the toggle feels instant
    set({ servers: get().servers.map((s) => (s.id === id ? { ...s, isEnabled: enabled } : s)) })
    await window.folk.mcp.save({ ...target, isEnabled: enabled })
    await get().load()
  },
  remove: async (id) => {
    await window.folk.mcp.delete(id)
    await get().load()
  },
  test: async (id) => {
    const res = await window.folk.mcp.test(id)
    await get().load()
    return res
  }
}))
