import { useCallback, useEffect } from 'react'
import { useStore } from '@renderer/state/store'

/**
 * Drives a PDF import: starts the parse, funnels progress into the store, and
 * records the file in the recent list once it succeeds.
 *
 * The progress subscription is deliberately mounted once for the whole app
 * rather than set up per import. Subscribing inside `importPdf` would open a
 * window where the sidecar has already been asked to parse but nothing is
 * listening yet, and the first "Opening PDF" event would be lost.
 */
export function usePdfParser(): {
  importPdf: (path: string) => Promise<void>
  cancelImport: () => Promise<void>
} {
  const beginImport = useStore((state) => state.beginImport)
  const applyImportProgress = useStore((state) => state.applyImportProgress)
  const completeImport = useStore((state) => state.completeImport)
  const failImport = useStore((state) => state.failImport)
  const dismissImport = useStore((state) => state.dismissImport)
  const setRecentFiles = useStore((state) => state.setRecentFiles)

  useEffect(() => {
    const unsubscribe = window.api.onParseProgress(applyImportProgress)
    return unsubscribe
  }, [applyImportProgress])

  const importPdf = useCallback(
    async (path: string): Promise<void> => {
      const requestId = crypto.randomUUID()
      const fileName = path.split(/[\\/]/).pop() ?? path

      beginImport(requestId, path, fileName)

      try {
        const result = await window.api.parsePdf({ requestId, path })
        completeImport(result)

        // Only record files that actually parsed. A recent list full of
        // documents that fail every time they are opened is worse than empty.
        setRecentFiles(await window.api.addRecentFile(path, 'pdf'))
      } catch (error) {
        failImport(messageFrom(error))
      }
    },
    [beginImport, completeImport, failImport, setRecentFiles]
  )

  const cancelImport = useCallback(async (): Promise<void> => {
    const active = useStore.getState().activeImport
    if (!active) return

    // Clear the panel immediately. The parse promise will reject shortly after
    // the sidecar restarts, and `failImport` will find no active import to
    // attach the error to - which is what we want, since the user asked for
    // this and does not need to be told it happened.
    dismissImport()
    await window.api.cancelParse(active.requestId)
  }, [dismissImport])

  return { importPdf, cancelImport }
}

/**
 * Pull a readable message out of whatever crossed the IPC boundary.
 *
 * Electron prefixes rejected handler errors with "Error invoking remote method
 * '<channel>': ", which is noise to a user looking at an import that failed.
 */
function messageFrom(error: unknown): string {
  const raw =
    error instanceof Error ? error.message : typeof error === 'string' ? error : String(error)

  return raw.replace(/^Error invoking remote method '[^']+':\s*/, '').replace(/^\w*Error:\s*/, '')
}
