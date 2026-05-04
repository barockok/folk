/// <reference types="vite/client" />
import type { FolkAPI } from '@shared/preload-api'

declare global {
  interface Window {
    folk: FolkAPI
  }

  interface ImportMetaEnv {
    readonly VITE_POSTHOG_KEY?: string
    readonly VITE_POSTHOG_HOST?: string
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv
  }
}

export {}
