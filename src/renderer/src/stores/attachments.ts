import { create } from 'zustand'

interface AttachedFile {
  name: string
  content: string
}

interface AttachmentState {
  files: AttachedFile[]
  addFile: (file: AttachedFile) => void
  removeFile: (name: string) => void
  clearFiles: () => void
}

export const useAttachmentStore = create<AttachmentState>((set) => ({
  files: [],
  addFile: (file) => set((s) => ({ files: [...s.files, file] })),
  removeFile: (name) => set((s) => ({ files: s.files.filter((f) => f.name !== name) })),
  clearFiles: () => set({ files: [] })
}))
