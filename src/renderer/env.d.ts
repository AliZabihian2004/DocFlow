/// <reference types="vite/client" />

import type { DocflowApi } from '@shared/types'

declare global {
  interface Window {
    /** Injected by src/preload/index.ts via contextBridge. */
    api: DocflowApi
  }
}

export {}
