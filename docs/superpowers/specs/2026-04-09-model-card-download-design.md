# Model Card Download System

## Problem

The current onboarding references a GGUF model URL that doesn't apply to the WebGPU inference path. The actual ONNX model is silently auto-downloaded by `@huggingface/transformers` with no user control, no visibility into what's being downloaded, and no way to choose between models. Users should be able to see available WebGPU models as cards, download them explicitly, and choose which one to use — both during onboarding and later in settings.

## Architecture

### Model Registry (`src/shared/models.ts`)

A static array of available WebGPU/ONNX models. Each entry:

```ts
export interface WebGPUModel {
  id: string              // HuggingFace model ID (e.g. 'onnx-community/gemma-4-e2b-it-ONNX')
  name: string            // Display name (e.g. 'Gemma 4 E2B')
  params: string          // Parameter count (e.g. '2B')
  sizeEstimate: string    // Human-readable size (e.g. '~1.5 GB')
  description: string     // One-liner (e.g. 'Fast, lightweight model for everyday tasks')
  dtype: string           // Quantization dtype (e.g. 'q4f16')
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
  // Add more models here as they become available
]
```

Adding a new model = adding one object to this array. No other changes needed.

### Download State Management

**Per-model download state** tracked in renderer via a Zustand store or local component state:

```ts
type ModelDownloadStatus = 'not_downloaded' | 'downloading' | 'downloaded' | 'error'

interface ModelDownloadState {
  status: ModelDownloadStatus
  progress: number        // 0-100
  currentFile: string     // Which ONNX shard is downloading
  error: string | null
}
```

**Persistence:** When a model finishes downloading, save its ID to settings DB (`downloadedModels` key — JSON array of model IDs). On startup, read this to know which models are already cached. The active model is stored as `activeModelId` in settings.

### IPC Changes

**New/modified channels:**

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `model:download-start` | renderer -> main | Start downloading a specific model by ID |
| `model:download-cancel` | renderer -> main | Cancel an in-progress download |
| `model:download-progress` | main -> renderer | Enhanced: includes `modelId`, `percent`, `file` |
| `model:download-complete` | main -> renderer | Model finished downloading, includes `modelId` |
| `model:download-error` | main -> renderer | Download failed, includes `modelId`, `error` |
| `model:set-active` | renderer -> main | Set which downloaded model to use for inference |
| `model:get-downloaded` | renderer -> main | Returns list of downloaded model IDs from settings |

**Download flow:**

1. Renderer calls `model:download-start` with model ID
2. Main process tells InferenceManager to load the model (which triggers transformers.js download)
3. InferenceManager forwards per-file progress events with model ID
4. On completion, main process saves model ID to `downloadedModels` in settings DB
5. Main process sends `model:download-complete` to renderer

**Cancel flow:**

1. Renderer calls `model:download-cancel`
2. Main process aborts the inference window's current load (or destroys and recreates the hidden window)

### Components

#### `ModelCard` (`src/renderer/src/components/ModelCard.tsx`)

Shared component used in both onboarding and settings. Props:

```ts
interface ModelCardProps {
  model: WebGPUModel
  status: ModelDownloadStatus
  progress: number
  currentFile: string
  isActive: boolean
  onDownload: () => void
  onCancel: () => void
  onSetActive: () => void
}
```

Visual states:
- **Not downloaded:** Card with model info + "Download" button
- **Downloading:** Progress bar with percent, current file name, cancel button
- **Downloaded (inactive):** Green checkmark badge + "Use This Model" button
- **Downloaded (active):** Green checkmark + "Active" badge (highlighted card border)
- **Error:** Red error message + "Retry" button

Card layout:
```
+---------------------------------------+
| Gemma 4 E2B                      2B   |
| Fast, lightweight model                |
| ~1.5 GB  ·  q4f16                     |
|                                        |
| [Download]  or  [====== 45%]          |
+---------------------------------------+
```

#### Onboarding `ModelDownloadStep` (modified)

Replaces the current single-model view with a grid of ModelCards. Changes:
- Import `AVAILABLE_MODELS` from shared registry
- Render a card for each model
- "Continue" button always visible (user can skip or download first)
- Skip button removed (Continue serves the same purpose)
- Track download state per model locally

#### Settings `ModelSettings` (modified)

Replaces the current GGUF-focused view:
- Remove API Configuration section (not relevant for WebGPU)
- Remove "Change Model" file dialog button
- Show same ModelCard grid as onboarding
- Active model indicator
- Keep `formatBytes` utility if needed for future use

### InferenceManager Changes

Modify `loadModel()` to:
- Accept a model ID parameter (already does)
- Forward the model ID with download progress events
- Support aborting a download in progress

Modify the inference worker (`inference-worker.ts`) to:
- Include model ID in `sendDownloadProgress` calls
- Track total download progress across all ONNX shards (not just per-file)

### Preload Bridge Changes

Add to `FolkAPI` interface and preload:
- `downloadModelById(modelId: string): Promise<void>`
- `cancelModelDownload(): Promise<void>`
- `setActiveModel(modelId: string): Promise<void>`
- `getDownloadedModels(): Promise<string[]>`
- `onModelDownloadProgress(callback): () => void` — enhanced with modelId
- `onModelDownloadComplete(callback): () => void`
- `onModelDownloadError(callback): () => void`

### App.tsx Onboarding Trigger

Change the first-launch check: show onboarding if `workspacePath` is not set (remove `modelPath` check since model download is now optional).

## Error Handling

- **Network failure mid-download:** Show error on the card with retry button. Partial HuggingFace cache is handled by transformers.js (it resumes).
- **WebGPU not supported:** Detect at startup, show a warning banner instead of model cards.
- **Model load failure after download:** Mark model as downloaded but show error when trying to set active. Offer re-download.
- **Multiple simultaneous downloads:** Not supported — only one model downloads at a time. Other cards show "Download" button disabled while one is in progress.

## Testing

- Verify model cards render with correct info from registry
- Verify download triggers `loadModel` in inference worker
- Verify progress updates flow: worker -> main -> renderer per model
- Verify cancel aborts download
- Verify downloaded state persists across app restart
- Verify active model selection loads correct model
- Verify onboarding allows skipping all downloads
- Verify settings shows same cards with correct states
