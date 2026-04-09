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
