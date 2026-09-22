import { ipcMain } from 'electron'
import { extname } from 'node:path'
import { sidecar, SidecarError } from '../python-bridge/sidecar'
import type {
  OcrInfo,
  ParsePdfRequest,
  ParseProgress,
  ParseResult
} from '@shared/types'

/**
 * IPC handlers for everything that involves the Python sidecar.
 *
 * These are the only place the renderer's parsing requests turn into sidecar
 * calls. Progress arrives here as snake_case from Python and leaves as the
 * camelCase `ParseProgress` the React side is typed against.
 */

/** Channel names, kept together so the preload script cannot drift from them. */
export const PDF_CHANNELS = {
  parse: 'pdf:parse',
  cancel: 'pdf:cancel',
  ocrInfo: 'pdf:ocr-info',
  /** main -> renderer, pushed during a parse. */
  progress: 'pdf:progress'
} as const

export function registerPdfHandlers(): void {
  ipcMain.handle(
    PDF_CHANNELS.parse,
    async (event, request: ParsePdfRequest): Promise<ParseResult> => {
      if (extname(request.path).toLowerCase() !== '.pdf') {
        throw new SidecarError('Only PDF files can be imported.', 'opening')
      }

      const data = await sidecar.call(
        'parse_pdf',
        {
          path: request.path,
          tesseractPath: request.tesseractPath,
          ocrLanguages: request.ocrLanguages
        },
        {
          id: request.requestId,
          onProgress: (progress) => {
            // The window can be closed mid-parse; sending to a destroyed
            // webContents throws.
            if (event.sender.isDestroyed()) return

            const payload: ParseProgress = {
              requestId: request.requestId,
              phase: progress.phase as ParseProgress['phase'],
              message: progress.message,
              percent: progress.percent,
              hasRtlContent: progress.has_rtl_content,
              current: progress.current,
              total: progress.total
            }
            event.sender.send(PDF_CHANNELS.progress, payload)
          }
        }
      )

      return {
        markdown: String(data.markdown ?? ''),
        pageCount: Number(data.pageCount ?? 0),
        hasRtl: Boolean(data.hasRtl),
        pathUsed: data.pathUsed === 'ocr' ? 'ocr' : 'text',
        wordsReversed: Number(data.wordsReversed ?? 0)
      }
    }
  )

  ipcMain.handle(PDF_CHANNELS.cancel, (_event, requestId: string): void => {
    sidecar.cancel(requestId)
  })

  ipcMain.handle(
    PDF_CHANNELS.ocrInfo,
    async (_event, tesseractPath?: string): Promise<OcrInfo> => {
      const data = await sidecar.call('ocr_info', { tesseractPath })

      return {
        available: Boolean(data.available),
        path: typeof data.path === 'string' ? data.path : undefined,
        languages: Array.isArray(data.languages) ? (data.languages as string[]) : [],
        reason: typeof data.reason === 'string' ? data.reason : undefined
      }
    }
  )
}
