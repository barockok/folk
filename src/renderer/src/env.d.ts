/// <reference types="vite/client" />
import type { FolkAPI } from '@shared/preload-api'

declare global {
  interface Window {
    folk: FolkAPI
  }
}

export {}
