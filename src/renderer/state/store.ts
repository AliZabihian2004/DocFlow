import { create } from 'zustand'
import type {
  ExtractionPath,
  ParseProgress,
  ParseResult,
  RecentFile
} from '@shared/types'

/**
 * Application state.
 *
 * Documents live here in memory and are only written to disk when the user
 * explicitly saves. That is a deliberate choice: an import is a conversion the
 * user may well reject, and silently scattering .md files around their disk on
 * every dropped PDF would be worse than losing an unsaved draft.
 */

export type DocumentOrigin = 'pdf' | 'new'

export interface DocflowDocument {
  id: string
  /** Display name. Derived from the source file, editable later. */
  title: string
  /** Where it saves to, or null if it has never been saved. */
  path: string | null
  content: string
  /** Drives the sidebar's "imported from PDF" / "created new" grouping. */
  origin: DocumentOrigin
  sourcePdfPath?: string
  pageCount?: number
  /** Which pipeline produced this document, shown in the inspector. */
  pathUsed?: ExtractionPath
  /** Whether the source document actually contained RTL text. */
  hasRtl: boolean
  /** How many reversed runs the parser repaired, for the inspector panel. */
  wordsReversed: number
  /** Whether it has unsaved changes, shown in the status bar. */
  dirty: boolean
}

/** An import in flight, or the error left behind by one that failed. */
export interface ImportState {
  requestId: string
  fileName: string
  sourcePath: string
  progress: ParseProgress | null
  error: string | null
}

interface DocflowState {
  documents: DocflowDocument[]
  activeDocumentId: string | null
  activeImport: ImportState | null
  recentFiles: RecentFile[]

  // --- Import lifecycle ---
  beginImport: (requestId: string, sourcePath: string, fileName: string) => void
  applyImportProgress: (progress: ParseProgress) => void
  completeImport: (result: ParseResult) => string
  failImport: (message: string) => void
  /** Clear the import panel, whether it finished, failed, or was cancelled. */
  dismissImport: () => void

  // --- Documents ---
  setActiveDocument: (id: string | null) => void
  /** Called as the user types; marks the document dirty. */
  updateDocumentContent: (id: string, content: string) => void
  /** Called after a successful write, to clear the dirty flag. */
  markDocumentSaved: (id: string, path: string) => void

  // --- Recent files ---
  setRecentFiles: (files: RecentFile[]) => void
}

/** Strip the directory and extension for a readable document title. */
function titleFromPath(path: string): string {
  const base = path.split(/[\\/]/).pop() ?? path
  return base.replace(/\.[^.]+$/, '')
}

export const useStore = create<DocflowState>((set, get) => ({
  documents: [],
  activeDocumentId: null,
  activeImport: null,
  recentFiles: [],

  beginImport: (requestId, sourcePath, fileName) =>
    set({
      activeImport: { requestId, sourcePath, fileName, progress: null, error: null }
    }),

  applyImportProgress: (progress) =>
    set((state) => {
      // Progress for a parse we are no longer showing - a cancelled one, or a
      // late event arriving after completion. Ignore it rather than reviving
      // the panel.
      if (state.activeImport?.requestId !== progress.requestId) return state
      return { activeImport: { ...state.activeImport, progress } }
    }),

  completeImport: (result) => {
    const active = get().activeImport
    const id = crypto.randomUUID()

    const document: DocflowDocument = {
      id,
      title: active ? titleFromPath(active.sourcePath) : 'Untitled',
      path: null,
      content: result.markdown,
      origin: 'pdf',
      sourcePdfPath: active?.sourcePath,
      pageCount: result.pageCount,
      pathUsed: result.pathUsed,
      hasRtl: result.hasRtl,
      wordsReversed: result.wordsReversed,
      // Freshly imported and never saved, so there is unsaved work from the
      // moment it appears.
      dirty: true
    }

    set((state) => ({
      documents: [...state.documents, document],
      activeDocumentId: id,
      activeImport: null
    }))

    return id
  },

  failImport: (message) =>
    set((state) =>
      state.activeImport
        ? { activeImport: { ...state.activeImport, error: message } }
        : state
    ),

  dismissImport: () => set({ activeImport: null }),

  setActiveDocument: (id) => set({ activeDocumentId: id }),

  updateDocumentContent: (id, content) =>
    set((state) => ({
      documents: state.documents.map((doc) =>
        doc.id === id ? { ...doc, content, dirty: true } : doc
      )
    })),

  markDocumentSaved: (id, path) =>
    set((state) => ({
      documents: state.documents.map((doc) =>
        doc.id === id ? { ...doc, path, dirty: false } : doc
      )
    })),

  setRecentFiles: (files) => set({ recentFiles: files })
}))

/** The document currently shown in the editor, if any. */
export function useActiveDocument(): DocflowDocument | null {
  return useStore(
    (state) => state.documents.find((doc) => doc.id === state.activeDocumentId) ?? null
  )
}
