import type { FolkAPI } from '../shared/types'

declare global {
  interface Window {
    folk: FolkAPI
  }
}

export {}
