import { useCallback } from 'react'
import { useStore, type DocflowDocument } from '@renderer/state/store'

/**
 * Saving documents to disk.
 *
 * Documents live in memory until the user asks for this, so every write here
 * is something they explicitly requested.
 */
export function useFileSystem(): {
  saveDocument: (doc: DocflowDocument) => Promise<boolean>
  saveDocumentAs: (doc: DocflowDocument) => Promise<boolean>
} {
  const markDocumentSaved = useStore((state) => state.markDocumentSaved)
  const setRecentFiles = useStore((state) => state.setRecentFiles)

  const write = useCallback(
    async (doc: DocflowDocument, path: string): Promise<boolean> => {
      await window.api.writeMarkdown(path, doc.content)
      markDocumentSaved(doc.id, path)
      setRecentFiles(await window.api.addRecentFile(path, 'markdown'))
      return true
    },
    [markDocumentSaved, setRecentFiles]
  )

  /** Save in place, or prompt for a location the first time. */
  const saveDocument = useCallback(
    async (doc: DocflowDocument): Promise<boolean> => {
      if (doc.path) return write(doc, doc.path)

      const chosen = await window.api.saveMarkdownDialog(`${doc.title}.md`)
      // Cancelling the dialog is a normal outcome, not a failure to report.
      if (!chosen) return false

      return write(doc, chosen)
    },
    [write]
  )

  const saveDocumentAs = useCallback(
    async (doc: DocflowDocument): Promise<boolean> => {
      const chosen = await window.api.saveMarkdownDialog(`${doc.title}.md`)
      if (!chosen) return false
      return write(doc, chosen)
    },
    [write]
  )

  return { saveDocument, saveDocumentAs }
}
