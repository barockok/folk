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
