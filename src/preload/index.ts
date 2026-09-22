import { contextBridge, ipcRenderer } from 'electron'
import type {
  DocflowApi,
  OcrInfo,
  ParsePdfRequest,
  ParseProgress,
  ParseResult
} from '@shared/types'

/**
 * The bridge between the sandboxed renderer and the main process.
 *
 * Everything the React app can do to the outside world passes through this
 * object. We deliberately expose hand-written methods rather than a generic
 * `invoke(channel, ...args)` passthrough: a generic escape hatch would let any
 * compromised renderer code reach every IPC handler in the app.
 */
const api: DocflowApi = {
  getHostInfo: () => ipcRenderer.invoke('host:get-info'),

  parsePdf: (request: ParsePdfRequest): Promise<ParseResult> =>
    ipcRenderer.invoke('pdf:parse', request),

  cancelParse: (requestId: string): Promise<void> =>
    ipcRenderer.invoke('pdf:cancel', requestId),

  onParseProgress: (listener: (progress: ParseProgress) => void) => {
    // The raw IpcRendererEvent is deliberately not passed through - it exposes
    // `sender`, which would hand the renderer a way back into the IPC layer.
    const subscription = (_event: Electron.IpcRendererEvent, progress: ParseProgress): void =>
      listener(progress)

    ipcRenderer.on('pdf:progress', subscription)
    return () => {
      ipcRenderer.removeListener('pdf:progress', subscription)
    }
  },

  getOcrInfo: (tesseractPath?: string): Promise<OcrInfo> =>
    ipcRenderer.invoke('pdf:ocr-info', tesseractPath),

  openPdfDialog: (): Promise<string[]> => ipcRenderer.invoke('file:open-pdf-dialog'),

  readMarkdown: (path: string): Promise<string> =>
    ipcRenderer.invoke('file:read-markdown', path),

  writeMarkdown: (path: string, content: string): Promise<void> =>
    ipcRenderer.invoke('file:write-markdown', path, content),

  saveMarkdownDialog: (suggestedName: string): Promise<string | null> =>
    ipcRenderer.invoke('file:save-markdown-dialog', suggestedName)
}

contextBridge.exposeInMainWorld('api', api)
