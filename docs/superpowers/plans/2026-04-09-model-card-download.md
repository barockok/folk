# Model Card Download System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single hardcoded GGUF download step with a model card grid (onboarding + settings) that lets users choose which WebGPU models to download, track progress per model, and select the active model.

**Architecture:** A shared model registry defines available WebGPU models. A new `ModelCard` component renders each model with download/progress/active states. IPC channels are enhanced to support per-model download commands with modelId tracking. Download state is persisted in the settings DB. The same card grid is used in both onboarding and settings.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Electron IPC, @huggingface/transformers, Zustand

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/shared/models.ts` | Model registry — list of available WebGPU models |
| Create | `src/renderer/src/components/ModelCard.tsx` | Reusable model card with download/progress/active states |
| Modify | `src/shared/types.ts` | Add `WebGPUModel`, `ModelDownloadProgress`, update `FolkAPI` |
| Modify | `src/preload/index.ts` | Add new IPC bridge methods for model download/select |
| Modify | `src/main/ipc-handlers.ts` | Add handlers for model download, cancel, set-active, get-downloaded |
| Modify | `src/main/inference-manager.ts` | Track modelId in download progress, support download-only mode |
| Modify | `src/renderer/src/inference-worker.ts` | Include modelId in progress events |
| Modify | `src/inference/preload.ts` | Forward modelId in download progress |
| Modify | `src/main/agent-manager.ts` | Use active model from settings, forward enhanced progress |
| Modify | `src/renderer/src/components/Onboarding/ModelDownloadStep.tsx` | Replace with model card grid |
| Modify | `src/renderer/src/components/Onboarding/OnboardingWizard.tsx` | Remove skip handler (Continue is always available) |
| Modify | `src/renderer/src/components/SettingsDrawer/ModelSettings.tsx` | Replace with model card grid |
| Modify | `src/renderer/src/App.tsx` | Fix onboarding trigger (only check workspacePath) |

---

### Task 1: Create Model Registry

**Files:**
- Create: `src/shared/models.ts`

- [ ] **Step 1: Create the model registry file**

```ts
// src/shared/models.ts

export interface WebGPUModel {
  id: string
  name: string
  params: string
  sizeEstimate: string
  description: string
  dtype: string
}

export const AVAILABLE_MODELS: WebGPUModel[] = [
  {
    id: 'onnx-community/gemma-4-e2b-it-ONNX',
    name: 'Gemma 4 E2B',
    params: '2B',
    sizeEstimate: '~1.5 GB',
    description: 'Fast, lightweight model for everyday tasks',
    dtype: 'q4f16'
  }
]

export const DEFAULT_MODEL_ID = 'onnx-community/gemma-4-e2b-it-ONNX'
```

- [ ] **Step 2: Commit**

```bash
git add src/shared/models.ts
git commit -m "feat: add WebGPU model registry"
```

---

### Task 2: Update Shared Types and IPC Bridge

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Add new types to `src/shared/types.ts`**

Add after the existing `DownloadProgress` interface (line 75):

```ts
export interface ModelDownloadProgress {
  modelId: string
  percent: number
  file: string
}
```

Update the `FolkAPI` interface — replace these existing members:

```ts
// Replace:
//   downloadModel: (url: string) => Promise<void>
//   onDownloadProgress: (callback: (data: DownloadProgress) => void) => () => void

// With:
  downloadModelById: (modelId: string) => Promise<void>
  cancelModelDownload: () => Promise<void>
  setActiveModel: (modelId: string) => Promise<void>
  getActiveModel: () => Promise<string | null>
  getDownloadedModels: () => Promise<string[]>
  onModelDownloadProgress: (callback: (data: ModelDownloadProgress) => void) => () => void
  onModelDownloadComplete: (callback: (data: { modelId: string }) => void) => () => void
  onModelDownloadError: (callback: (data: { modelId: string; error: string }) => void) => () => void
```

Also keep the old `DownloadProgress` type (other code may reference it) but it is no longer used in `FolkAPI`.

Remove `downloadModel` and `onDownloadProgress` from the `FolkAPI` interface.

- [ ] **Step 2: Update `src/preload/index.ts`**

Replace the model section (lines 29-32) and the `onDownloadProgress` listener (lines 81-86):

```ts
  // Model
  getModelInfo: () => ipcRenderer.invoke('model:info'),
  changeModel: (path) => ipcRenderer.invoke('model:change', path),
  downloadModelById: (modelId) => ipcRenderer.invoke('model:download-by-id', modelId),
  cancelModelDownload: () => ipcRenderer.invoke('model:download-cancel'),
  setActiveModel: (modelId) => ipcRenderer.invoke('model:set-active', modelId),
  getActiveModel: () => ipcRenderer.invoke('model:get-active'),
  getDownloadedModels: () => ipcRenderer.invoke('model:get-downloaded'),
```

Replace the `onDownloadProgress` listener with three new listeners:

```ts
  onModelDownloadProgress: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, data: Parameters<typeof callback>[0]) =>
      callback(data)
    ipcRenderer.on('model:download-progress', handler)
    return () => ipcRenderer.removeListener('model:download-progress', handler)
  },
  onModelDownloadComplete: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, data: Parameters<typeof callback>[0]) =>
      callback(data)
    ipcRenderer.on('model:download-complete', handler)
    return () => ipcRenderer.removeListener('model:download-complete', handler)
  },
  onModelDownloadError: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, data: Parameters<typeof callback>[0]) =>
      callback(data)
    ipcRenderer.on('model:download-error', handler)
    return () => ipcRenderer.removeListener('model:download-error', handler)
  },
```

- [ ] **Step 3: Commit**

```bash
git add src/shared/types.ts src/preload/index.ts
git commit -m "feat: add model download IPC types and preload bridge"
```

---

### Task 3: Enhance Inference Worker to Track Model ID

**Files:**
- Modify: `src/renderer/src/inference-worker.ts`
- Modify: `src/inference/preload.ts`

- [ ] **Step 1: Update inference preload to include modelId in progress**

In `src/inference/preload.ts`, update `sendDownloadProgress` signature:

```ts
  sendDownloadProgress: (progress: { modelId: string; percent: number; file: string }) =>
    ipcRenderer.send('inference:download-progress', progress),
```

- [ ] **Step 2: Update inference worker to pass modelId in progress**

In `src/renderer/src/inference-worker.ts`, the `onLoadModel` handler receives a `modelId`. Update the `progressCallback` (around line 42) to include it:

Replace lines 36-71 with:

```ts
api.onLoadModel(async (modelId?: string) => {
  try {
    api.sendStatus('loading')
    const id = modelId || DEFAULT_MODEL
    console.log(`[InferenceWorker] Loading model: ${id}`)

    const progressCallback = (progress: { status: string; progress?: number; file?: string }): void => {
      if (progress.status === 'progress') {
        api.sendDownloadProgress({
          modelId: id,
          percent: Math.round(progress.progress || 0),
          file: progress.file || ''
        })
      }
    }

    const [loadedModel, loadedProcessor] = await Promise.all([
      Gemma4ForConditionalGeneration.from_pretrained(id, {
        dtype: 'q4f16' as never,
        device: 'webgpu',
        progress_callback: progressCallback
      }),
      AutoProcessor.from_pretrained(id)
    ])

    model = loadedModel as Gemma4ForConditionalGeneration
    processor = loadedProcessor

    console.log(`[InferenceWorker] Model loaded`)
    api.sendStatus('ready')
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[InferenceWorker] Load error:`, err)
    api.sendStatus('error')
    api.sendError(message)
  }
})
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/inference-worker.ts src/inference/preload.ts
git commit -m "feat: include modelId in inference download progress events"
```

---

### Task 4: Update IPC Handlers in Main Process

**Files:**
- Modify: `src/main/ipc-handlers.ts`
- Modify: `src/main/inference-manager.ts`
- Modify: `src/main/agent-manager.ts`

- [ ] **Step 1: Add download tracking to InferenceManager**

In `src/main/inference-manager.ts`, add a `currentModelId` field and update `loadModel` to track it.

After line 22 (`private requestCounter = 0`), add:

```ts
  private currentModelId: string | null = null
```

In `loadModel` (line 90), update to store the modelId:

```ts
  async loadModel(modelId?: string): Promise<void> {
    if (!this.window) throw new Error('Inference window not initialized')
    this.currentModelId = modelId || null
    this.window.webContents.send('inference:load-model', modelId)

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Model load timeout')), 300000)
      const handler = (status: string): void => {
        if (status === 'ready') {
          clearTimeout(timeout)
          this.removeListener('status', handler)
          resolve()
        } else if (status === 'error') {
          clearTimeout(timeout)
          this.removeListener('status', handler)
          reject(new Error('Model failed to load'))
        }
      }
      this.on('status', handler)
    })
  }

  getCurrentModelId(): string | null {
    return this.currentModelId
  }
```

- [ ] **Step 2: Update AgentManager to forward enhanced download progress and expose inference**

In `src/main/agent-manager.ts`, the `download-progress` forwarder (line 49-52) already forwards to renderer. No changes needed — the progress data now includes `modelId` from the worker.

Add a method to expose the InferenceManager for IPC handlers. After the `closeAll` method (line 171), add:

```ts
  getInference(): InferenceManager {
    return this.inference
  }
```

- [ ] **Step 3: Update IPC handlers with new model channels**

In `src/main/ipc-handlers.ts`, replace the model section (lines 122-139) with:

```ts
  // --- Model ---
  ipcMain.handle('model:info', async () => {
    const activeModel = db.getSetting('activeModelId') as string | null
    return {
      name: activeModel || 'gemma-4-e2b-it-ONNX',
      path: 'WebGPU (in-browser)',
      sizeBytes: 0,
      quantization: 'q4f16',
      contextSize: 2048
    }
  })

  ipcMain.handle('model:change', async () => {
    // No-op in WebGPU mode
  })

  ipcMain.handle('model:download-by-id', async (_event, modelId: string) => {
    const win = getMainWindow()
    try {
      const inference = deps.agentManager.getInference()
      await inference.loadModel(modelId)
      // Save to downloaded models list
      const downloaded = (db.getSetting('downloadedModels') as string[] | null) || []
      if (!downloaded.includes(modelId)) {
        downloaded.push(modelId)
        db.setSetting('downloadedModels', downloaded)
      }
      // Set as active if no active model
      const activeModel = db.getSetting('activeModelId') as string | null
      if (!activeModel) {
        db.setSetting('activeModelId', modelId)
      }
      win?.webContents.send('model:download-complete', { modelId })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      win?.webContents.send('model:download-error', { modelId, error: message })
      throw err
    }
  })

  ipcMain.handle('model:download-cancel', async () => {
    const inference = deps.agentManager.getInference()
    inference.abort()
  })

  ipcMain.handle('model:set-active', async (_event, modelId: string) => {
    db.setSetting('activeModelId', modelId)
    // Reload model in inference engine
    const inference = deps.agentManager.getInference()
    await inference.loadModel(modelId)
  })

  ipcMain.handle('model:get-active', async () => {
    return db.getSetting('activeModelId') as string | null
  })

  ipcMain.handle('model:get-downloaded', async () => {
    return (db.getSetting('downloadedModels') as string[] | null) || []
  })
```

- [ ] **Step 4: Commit**

```bash
git add src/main/ipc-handlers.ts src/main/inference-manager.ts src/main/agent-manager.ts
git commit -m "feat: add per-model download/cancel/activate IPC handlers"
```

---

### Task 5: Create ModelCard Component

**Files:**
- Create: `src/renderer/src/components/ModelCard.tsx`

- [ ] **Step 1: Create the ModelCard component**

```tsx
// src/renderer/src/components/ModelCard.tsx
import { Download, CheckCircle, Loader2, XCircle, Cpu } from 'lucide-react'
import type { WebGPUModel } from '../../../shared/models'

export type ModelDownloadStatus = 'not_downloaded' | 'downloading' | 'downloaded' | 'error'

interface ModelCardProps {
  model: WebGPUModel
  status: ModelDownloadStatus
  progress: number
  currentFile: string
  error: string | null
  isActive: boolean
  downloadDisabled: boolean
  onDownload: () => void
  onCancel: () => void
  onSetActive: () => void
}

export default function ModelCard({
  model,
  status,
  progress,
  currentFile,
  error,
  isActive,
  downloadDisabled,
  onDownload,
  onCancel,
  onSetActive
}: ModelCardProps): React.JSX.Element {
  const borderClass = isActive
    ? 'border-electric-cyan'
    : 'border-border-mist-08 hover:border-border-mist-12'

  return (
    <div
      className={`bg-pure-black border ${borderClass} rounded-default p-5 transition-colors`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <Cpu size={16} className="text-text-muted" />
          <h3 className="text-sm font-semibold text-text-primary">{model.name}</h3>
        </div>
        <span className="text-xs font-mono text-text-muted bg-border-mist-08 px-2 py-0.5 rounded">
          {model.params}
        </span>
      </div>

      {/* Description */}
      <p className="text-xs text-text-secondary mb-3">{model.description}</p>

      {/* Meta */}
      <div className="flex items-center gap-3 text-xs text-text-muted font-mono mb-4">
        <span>{model.sizeEstimate}</span>
        <span className="text-border-mist-10">·</span>
        <span>{model.dtype}</span>
      </div>

      {/* Action area */}
      {status === 'not_downloaded' && (
        <button
          onClick={onDownload}
          disabled={downloadDisabled}
          className={`flex items-center gap-2 w-full justify-center px-4 py-2.5 rounded-default text-sm font-medium transition-colors ${
            downloadDisabled
              ? 'bg-border-mist-08 text-text-muted cursor-not-allowed'
              : 'bg-white text-black hover:bg-white/90 cursor-pointer'
          }`}
        >
          <Download size={14} />
          Download
        </button>
      )}

      {status === 'downloading' && (
        <div>
          <div className="w-full h-2 bg-border-mist-08 rounded-full overflow-hidden mb-2">
            <div
              className="h-full bg-electric-cyan transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-xs text-text-muted">{progress}%</span>
            <span className="font-mono text-xs text-text-muted truncate ml-2 max-w-[60%]">
              {currentFile}
            </span>
          </div>
          <button
            onClick={onCancel}
            className="flex items-center gap-2 w-full justify-center px-4 py-2 rounded-default text-sm text-text-secondary border border-border-mist-10 hover:border-border-mist-12 transition-colors cursor-pointer"
          >
            Cancel
          </button>
        </div>
      )}

      {status === 'downloaded' && !isActive && (
        <button
          onClick={onSetActive}
          className="flex items-center gap-2 w-full justify-center px-4 py-2.5 rounded-default text-sm font-medium bg-white text-black hover:bg-white/90 transition-colors cursor-pointer"
        >
          <CheckCircle size={14} />
          Use This Model
        </button>
      )}

      {status === 'downloaded' && isActive && (
        <div className="flex items-center gap-2 justify-center px-4 py-2.5 rounded-default text-sm font-medium text-electric-cyan border border-electric-cyan/30 bg-electric-cyan/5">
          <CheckCircle size={14} />
          Active
        </div>
      )}

      {status === 'error' && (
        <div>
          <div className="flex items-center gap-2 text-error text-xs mb-2">
            <XCircle size={12} />
            <span className="truncate">{error || 'Download failed'}</span>
          </div>
          <button
            onClick={onDownload}
            disabled={downloadDisabled}
            className="flex items-center gap-2 w-full justify-center px-4 py-2.5 rounded-default text-sm font-medium bg-white text-black hover:bg-white/90 transition-colors cursor-pointer"
          >
            <Download size={14} />
            Retry
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/ModelCard.tsx
git commit -m "feat: create reusable ModelCard component"
```

---

### Task 6: Create Shared Model Download Hook

**Files:**
- Create: `src/renderer/src/hooks/useModelDownload.ts`

This hook encapsulates all model download state and IPC listeners so both onboarding and settings can reuse it without duplicating logic.

- [ ] **Step 1: Create the hook**

```ts
// src/renderer/src/hooks/useModelDownload.ts
import { useState, useEffect, useCallback } from 'react'
import type { ModelDownloadStatus } from '../components/ModelCard'

interface ModelState {
  status: ModelDownloadStatus
  progress: number
  currentFile: string
  error: string | null
}

interface UseModelDownloadReturn {
  states: Record<string, ModelState>
  downloadedModels: string[]
  activeModelId: string | null
  downloadingModelId: string | null
  download: (modelId: string) => void
  cancel: () => void
  setActive: (modelId: string) => void
}

const defaultState: ModelState = {
  status: 'not_downloaded',
  progress: 0,
  currentFile: '',
  error: null
}

export function useModelDownload(): UseModelDownloadReturn {
  const [states, setStates] = useState<Record<string, ModelState>>({})
  const [downloadedModels, setDownloadedModels] = useState<string[]>([])
  const [activeModelId, setActiveModelId] = useState<string | null>(null)
  const [downloadingModelId, setDownloadingModelId] = useState<string | null>(null)

  // Load initial state
  useEffect(() => {
    window.folk.getDownloadedModels().then((models) => {
      setDownloadedModels(models)
      const initial: Record<string, ModelState> = {}
      for (const id of models) {
        initial[id] = { status: 'downloaded', progress: 100, currentFile: '', error: null }
      }
      setStates((prev) => ({ ...prev, ...initial }))
    })
    window.folk.getActiveModel().then((id) => {
      if (id) setActiveModelId(id)
    })
  }, [])

  // Listen for progress
  useEffect(() => {
    const cleanupProgress = window.folk.onModelDownloadProgress((data) => {
      setStates((prev) => ({
        ...prev,
        [data.modelId]: {
          status: 'downloading',
          progress: data.percent,
          currentFile: data.file,
          error: null
        }
      }))
    })

    const cleanupComplete = window.folk.onModelDownloadComplete((data) => {
      setStates((prev) => ({
        ...prev,
        [data.modelId]: { status: 'downloaded', progress: 100, currentFile: '', error: null }
      }))
      setDownloadedModels((prev) =>
        prev.includes(data.modelId) ? prev : [...prev, data.modelId]
      )
      setDownloadingModelId(null)
    })

    const cleanupError = window.folk.onModelDownloadError((data) => {
      setStates((prev) => ({
        ...prev,
        [data.modelId]: {
          status: 'error',
          progress: 0,
          currentFile: '',
          error: data.error
        }
      }))
      setDownloadingModelId(null)
    })

    return () => {
      cleanupProgress()
      cleanupComplete()
      cleanupError()
    }
  }, [])

  const download = useCallback((modelId: string) => {
    setDownloadingModelId(modelId)
    setStates((prev) => ({
      ...prev,
      [modelId]: { status: 'downloading', progress: 0, currentFile: '', error: null }
    }))
    window.folk.downloadModelById(modelId).catch(() => {
      // Error handled via onModelDownloadError event
    })
  }, [])

  const cancel = useCallback(() => {
    if (downloadingModelId) {
      window.folk.cancelModelDownload()
      setStates((prev) => ({
        ...prev,
        [downloadingModelId]: { ...defaultState }
      }))
      setDownloadingModelId(null)
    }
  }, [downloadingModelId])

  const setActive = useCallback((modelId: string) => {
    setActiveModelId(modelId)
    window.folk.setActiveModel(modelId)
  }, [])

  const getState = useCallback(
    (modelId: string): ModelState => states[modelId] || defaultState,
    [states]
  )

  // Return a proxy-like object that returns defaultState for unknown models
  const statesWithDefaults = new Proxy(states, {
    get(target, prop: string) {
      return target[prop] || defaultState
    }
  })

  return {
    states: statesWithDefaults,
    downloadedModels,
    activeModelId,
    downloadingModelId,
    download,
    cancel,
    setActive
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/hooks/useModelDownload.ts
git commit -m "feat: create useModelDownload hook for shared download state"
```

---

### Task 7: Rewrite Onboarding ModelDownloadStep

**Files:**
- Modify: `src/renderer/src/components/Onboarding/ModelDownloadStep.tsx`
- Modify: `src/renderer/src/components/Onboarding/OnboardingWizard.tsx`

- [ ] **Step 1: Rewrite ModelDownloadStep to use model card grid**

Replace the entire content of `src/renderer/src/components/Onboarding/ModelDownloadStep.tsx`:

```tsx
import ModelCard from '../ModelCard'
import { AVAILABLE_MODELS } from '../../../../shared/models'
import { useModelDownload } from '../../hooks/useModelDownload'

interface ModelDownloadStepProps {
  onNext: () => void
}

export default function ModelDownloadStep({ onNext }: ModelDownloadStepProps): React.JSX.Element {
  const { states, activeModelId, downloadingModelId, download, cancel, setActive } =
    useModelDownload()

  return (
    <div className="flex flex-col items-center justify-center flex-1 px-6 max-w-2xl mx-auto w-full">
      <h2 className="text-2xl font-semibold text-text-primary mb-2">Choose your AI model</h2>
      <p className="text-sm text-text-secondary mb-8 text-center">
        Download a model to run AI locally. You can always download more later in Settings.
      </p>

      <div className="grid grid-cols-1 gap-4 w-full mb-8">
        {AVAILABLE_MODELS.map((model) => {
          const state = states[model.id]
          return (
            <ModelCard
              key={model.id}
              model={model}
              status={state.status}
              progress={state.progress}
              currentFile={state.currentFile}
              error={state.error}
              isActive={activeModelId === model.id}
              downloadDisabled={downloadingModelId !== null && downloadingModelId !== model.id}
              onDownload={() => download(model.id)}
              onCancel={cancel}
              onSetActive={() => setActive(model.id)}
            />
          )
        })}
      </div>

      <button
        onClick={onNext}
        className="bg-white text-black px-8 py-3 rounded-default font-medium hover:bg-white/90 transition-colors cursor-pointer"
      >
        Continue
      </button>

      <p className="text-xs text-text-muted mt-3 text-center">
        You can skip this and download models later in Settings
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Update OnboardingWizard to remove onSkip**

In `src/renderer/src/components/Onboarding/OnboardingWizard.tsx`, change line 54-56 from:

```tsx
        {step === 1 && (
          <ModelDownloadStep onNext={() => setStep(2)} onSkip={() => setStep(2)} />
        )}
```

To:

```tsx
        {step === 1 && <ModelDownloadStep onNext={() => setStep(2)} />}
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/Onboarding/ModelDownloadStep.tsx src/renderer/src/components/Onboarding/OnboardingWizard.tsx
git commit -m "feat: replace onboarding download step with model card grid"
```

---

### Task 8: Rewrite Settings ModelSettings

**Files:**
- Modify: `src/renderer/src/components/SettingsDrawer/ModelSettings.tsx`

- [ ] **Step 1: Rewrite ModelSettings to use model card grid**

Replace the entire content of `src/renderer/src/components/SettingsDrawer/ModelSettings.tsx`:

```tsx
import ModelCard from '../ModelCard'
import { AVAILABLE_MODELS } from '../../../../shared/models'
import { useModelDownload } from '../../hooks/useModelDownload'

export default function ModelSettings(): React.JSX.Element {
  const { states, activeModelId, downloadingModelId, download, cancel, setActive } =
    useModelDownload()

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-medium text-text-primary mb-1">Available Models</h3>
        <p className="text-xs text-text-muted mb-4">
          Download and manage local AI models. Only one model can be active at a time.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {AVAILABLE_MODELS.map((model) => {
          const state = states[model.id]
          return (
            <ModelCard
              key={model.id}
              model={model}
              status={state.status}
              progress={state.progress}
              currentFile={state.currentFile}
              error={state.error}
              isActive={activeModelId === model.id}
              downloadDisabled={downloadingModelId !== null && downloadingModelId !== model.id}
              onDownload={() => download(model.id)}
              onCancel={cancel}
              onSetActive={() => setActive(model.id)}
            />
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/SettingsDrawer/ModelSettings.tsx
git commit -m "feat: replace settings model view with model card grid"
```

---

### Task 9: Fix Onboarding Trigger and Agent Model Loading

**Files:**
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/main/agent-manager.ts`

- [ ] **Step 1: Fix onboarding trigger in App.tsx**

In `src/renderer/src/App.tsx`, change the `checkFirstLaunch` function (lines 43-57). Replace the condition on line 47:

```ts
// Old:
if (!workspace && !modelPath) {

// New:
if (!workspace) {
```

And remove the `modelPath` variable (line 46):

```ts
// Old:
const workspace = await window.folk.getSetting('workspacePath')
const modelPath = await window.folk.getSetting('modelPath')
if (!workspace && !modelPath) {

// New:
const workspace = await window.folk.getSetting('workspacePath')
if (!workspace) {
```

- [ ] **Step 2: Update AgentManager to use active model from settings**

In `src/main/agent-manager.ts`, update the `initialize` method (line 54-57) to load the active model from settings:

Replace:

```ts
    // Load the model
    console.log('[AgentManager] Loading Gemma 4 model via WebGPU...')
    await this.inference.loadModel()
    console.log('[AgentManager] Model loaded and ready')
```

With:

```ts
    // Load the active model (or default)
    const activeModelId = this.db.getSetting('activeModelId') as string | null
    if (activeModelId) {
      console.log(`[AgentManager] Loading model: ${activeModelId}`)
      await this.inference.loadModel(activeModelId)
      console.log('[AgentManager] Model loaded and ready')
    } else {
      console.log('[AgentManager] No active model set, skipping model load')
      // Model will be loaded when user downloads and activates one
    }
```

Also update `handleMessage` (around line 86) to check if any model is available before trying to generate. Replace:

```ts
    // Wait for model to be ready (may still be loading on first launch)
    if (this.inference.getStatus() !== 'ready') {
      console.log('[AgentManager] Waiting for model to finish loading...')
      win?.webContents.send('agent:token', { conversationId, token: '_Loading AI model, please wait..._\n\n' })
      await this.inference.waitForReady()
      console.log('[AgentManager] Model ready, proceeding')
    }
```

With:

```ts
    // Check if a model is loaded
    if (this.inference.getStatus() === 'idle') {
      // No model loaded at all — tell user to download one
      const errorMsg = 'No AI model is loaded. Please download and activate a model in Settings.'
      win?.webContents.send('agent:error', { conversationId, error: errorMsg })
      return
    }

    // Wait for model to be ready (may still be loading)
    if (this.inference.getStatus() !== 'ready') {
      console.log('[AgentManager] Waiting for model to finish loading...')
      win?.webContents.send('agent:token', { conversationId, token: '_Loading AI model, please wait..._\n\n' })
      await this.inference.waitForReady()
      console.log('[AgentManager] Model ready, proceeding')
    }
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/App.tsx src/main/agent-manager.ts
git commit -m "feat: use active model from settings, fix onboarding trigger"
```

---

### Task 10: Clean Up Unused Code

**Files:**
- Modify: `src/main/model-manager.ts` (remove if no longer referenced)
- Modify: `src/shared/types.ts` (remove old `DownloadProgress` if unused)

- [ ] **Step 1: Check for remaining references to old download APIs**

Run:

```bash
grep -rn "downloadModel\b\|onDownloadProgress\b\|MODEL_URL\|DownloadProgress" src/ --include="*.ts" --include="*.tsx"
```

Remove any remaining references to:
- `downloadModel` (the old single-URL version)
- `onDownloadProgress` (replaced by `onModelDownloadProgress`)
- `MODEL_URL` constants pointing to the GGUF URL
- `DownloadProgress` type (if no longer imported anywhere)

- [ ] **Step 2: Remove `DownloadProgress` from types if unused**

If no remaining references, remove from `src/shared/types.ts` (lines 71-75):

```ts
// Remove:
export interface DownloadProgress {
  percent: number
  speed: string
  eta: string
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: remove unused GGUF download code and old download types"
```

---

### Task 11: Verify End-to-End

- [ ] **Step 1: Build the project**

```bash
npm run build
```

Expected: No TypeScript errors, build succeeds.

- [ ] **Step 2: Manual verification checklist**

Run `npm run dev` and verify:

1. First launch → onboarding shows model cards with "Download" button
2. Click "Download" → progress bar appears with percent and file name
3. Click "Cancel" → download stops, card resets to "Download" state
4. Download completes → card shows "Active" badge
5. Click "Continue" without downloading → proceeds to workspace step
6. Open Settings → Model tab shows same cards with correct state
7. Restart app → downloaded models persist, active model is remembered
8. Try to chat without a model → shows error message

- [ ] **Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address issues found during verification"
```
