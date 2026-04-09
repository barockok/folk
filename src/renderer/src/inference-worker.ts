import {
  Gemma4ForConditionalGeneration,
  AutoProcessor,
  TextStreamer,
  env
} from '@huggingface/transformers'

// Configure transformers.js
env.allowRemoteModels = true

const DEFAULT_MODEL = 'onnx-community/gemma-4-e2b-it-ONNX'

let model: Gemma4ForConditionalGeneration | null = null
let processor: ReturnType<typeof AutoProcessor.from_pretrained> extends Promise<infer T>
  ? T
  : never
let abortController: AbortController | null = null

interface InferenceAPI {
  onLoadModel: (callback: (modelId?: string) => void) => void
  onGenerate: (
    callback: (requestId: string, prompt: string, maxTokens: number) => void
  ) => void
  onAbort: (callback: () => void) => void
  sendStatus: (status: string) => void
  sendToken: (requestId: string, token: string) => void
  sendResult: (requestId: string, result: unknown) => void
  sendError: (error: string) => void
  sendDownloadProgress: (progress: unknown) => void
  sendWorkerReady: () => void
}

const api = (window as unknown as { inference: InferenceAPI }).inference

// Load model handler
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

// Generate handler
api.onGenerate(async (requestId: string, prompt: string, maxTokens: number) => {
  if (!model || !processor) {
    api.sendResult(requestId, { error: 'Model not loaded' })
    return
  }

  abortController = new AbortController()
  let fullOutput = ''

  try {
    const inputs = await (processor as { (text: string): Promise<Record<string, unknown>> })(prompt)

    const streamer = new TextStreamer(
      (processor as { tokenizer: ConstructorParameters<typeof TextStreamer>[0] }).tokenizer,
      {
        skip_prompt: true,
        skip_special_tokens: false,
        callback_function: (token: string) => {
          fullOutput += token
          api.sendToken(requestId, token)
        }
      }
    )

    await model.generate({
      ...inputs,
      max_new_tokens: maxTokens || 2048,
      do_sample: false,
      streamer,
      abort_signal: abortController.signal
    } as never)

    api.sendResult(requestId, { output: fullOutput })
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      api.sendResult(requestId, { output: fullOutput, aborted: true })
    } else {
      const message = err instanceof Error ? err.message : String(err)
      api.sendResult(requestId, { error: message })
    }
  } finally {
    abortController = null
  }
})

// Abort handler
api.onAbort(() => {
  abortController?.abort()
})

// Signal ready
api.sendWorkerReady()
