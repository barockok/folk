import { create } from 'zustand'
import type { Conversation, Message } from '../../../shared/types'

interface ConversationState {
  conversations: Conversation[]
  activeConversationId: string | null
  messages: Message[]
  streamingText: string
  loadConversations: () => Promise<void>
  setActiveConversation: (id: string | null) => Promise<void>
  createConversation: () => Promise<Conversation>
  deleteConversation: (id: string) => Promise<void>
  renameConversation: (id: string, title: string) => Promise<void>
  sendMessage: (content: string) => Promise<void>
  appendToken: (token: string) => void
  addMessage: (message: Message) => void
  clearStreaming: () => void
}

export const useConversationStore = create<ConversationState>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  messages: [],
  streamingText: '',

  loadConversations: async () => {
    const conversations = await window.folk.listConversations()
    set({ conversations })
  },

  setActiveConversation: async (id: string | null) => {
    set({ activeConversationId: id, messages: [], streamingText: '' })
    if (id) {
      const messages = await window.folk.getMessages(id)
      set({ messages })
    }
  },

  createConversation: async () => {
    const conversation = await window.folk.createConversation()
    set((state) => ({
      conversations: [conversation, ...state.conversations],
      activeConversationId: conversation.id,
      messages: [],
      streamingText: ''
    }))
    return conversation
  },

  deleteConversation: async (id: string) => {
    await window.folk.deleteConversation(id)
    set((state) => ({
      conversations: state.conversations.filter((c) => c.id !== id),
      activeConversationId: state.activeConversationId === id ? null : state.activeConversationId,
      messages: state.activeConversationId === id ? [] : state.messages,
      streamingText: state.activeConversationId === id ? '' : state.streamingText
    }))
  },

  renameConversation: async (id: string, title: string) => {
    await window.folk.renameConversation(id, title)
    set((state) => ({
      conversations: state.conversations.map((c) => (c.id === id ? { ...c, title } : c))
    }))
  },

  sendMessage: async (content: string) => {
    let { activeConversationId } = get()

    if (!activeConversationId) {
      const conversation = await get().createConversation()
      activeConversationId = conversation.id
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      conversationId: activeConversationId,
      role: 'user',
      content: [{ type: 'text', text: content }],
      createdAt: Date.now(),
      tokenCount: null
    }

    set((state) => ({
      messages: [...state.messages, userMessage]
    }))

    await window.folk.sendMessage(activeConversationId, content)
  },

  appendToken: (token: string) => {
    set((state) => ({
      streamingText: state.streamingText + token
    }))
  },

  addMessage: (message: Message) => {
    set((state) => ({
      messages: [...state.messages, message],
      streamingText: ''
    }))
  },

  clearStreaming: () => {
    set({ streamingText: '' })
  }
}))
