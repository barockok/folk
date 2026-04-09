import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('inference', {
  onLoadModel: (callback: (modelId?: string) => void) => {
    ipcRenderer.on('inference:load-model', (_, modelId) => callback(modelId))
  },
  onGenerate: (
    callback: (requestId: string, prompt: string, maxTokens: number) => void
  ) => {
    ipcRenderer.on('inference:generate', (_, requestId, prompt, maxTokens) =>
      callback(requestId, prompt, maxTokens)
    )
  },
  onAbort: (callback: () => void) => {
    ipcRenderer.on('inference:abort', () => callback())
  },
  sendStatus: (status: string) => ipcRenderer.send('inference:status', status),
  sendToken: (requestId: string, token: string) =>
    ipcRenderer.send('inference:token', requestId, token),
  sendResult: (requestId: string, result: unknown) =>
    ipcRenderer.send('inference:result', requestId, result),
  sendError: (error: string) => ipcRenderer.send('inference:error', error),
  sendDownloadProgress: (progress: { modelId: string; percent: number; file: string }) =>
    ipcRenderer.send('inference:download-progress', progress),
  sendWorkerReady: () => ipcRenderer.send('inference:worker-ready')
})
