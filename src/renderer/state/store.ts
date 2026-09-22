import { create } from 'zustand'
import type {
  ExtractionPath,
  ParseProgress,
  ParseResult,
  RecentFile,
  Settings
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
  settings: Settings | null

  // --- Interface state ---
  /** Sidebar starts open; the inspector does not - it is not a fixture. */
  sidebarCollapsed: boolean
  inspectorOpen: boolean
  settingsOpen: boolean
  /** Filter text for the sidebar's file list. */
  fileFilter: string

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
  /** Start a blank document. Returns its id. */
  createDocument: () => string
  closeDocument: (id: string) => void

  // --- Interface state ---
  toggleSidebar: () => void
  toggleInspector: () => void
  setSettingsOpen: (open: boolean) => void
  setFileFilter: (filter: string) => void

  // --- Settings ---
  setSettings: (settings: Settings) => void

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
  settings: null,

  sidebarCollapsed: false,
  inspectorOpen: false,
  settingsOpen: false,
  fileFilter: '',

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

  createDocument: () => {
    const id = crypto.randomUUID()

    set((state) => ({
      documents: [
        ...state.documents,
        {
          id,
          title: nextUntitledName(state.documents),
          path: null,
          content: '',
          origin: 'new',
          hasRtl: false,
          wordsReversed: 0,
          // Empty and unsaved, but nothing has been written yet, so there is
          // no work at risk until the user types.
          dirty: false
        }
      ],
      activeDocumentId: id
    }))

    return id
  },

  closeDocument: (id) =>
    set((state) => {
      const documents = state.documents.filter((doc) => doc.id !== id)
      return {
        documents,
        activeDocumentId:
          state.activeDocumentId === id
            ? (documents[documents.length - 1]?.id ?? null)
            : state.activeDocumentId
      }
    }),

  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

  toggleInspector: () => set((state) => ({ inspectorOpen: !state.inspectorOpen })),

  setSettingsOpen: (open) => set({ settingsOpen: open }),

  setFileFilter: (filter) => set({ fileFilter: filter }),

  setSettings: (settings) => set({ settings }),

  setRecentFiles: (files) => set({ recentFiles: files })
}))

/** "Untitled", then "Untitled 2", and so on. */
function nextUntitledName(documents: DocflowDocument[]): string {
  const taken = new Set(documents.map((doc) => doc.title))
  if (!taken.has('Untitled')) return 'Untitled'

  let index = 2
  while (taken.has(`Untitled ${index}`)) index += 1
  return `Untitled ${index}`
}

/** The document currently shown in the editor, if any. */
export function useActiveDocument(): DocflowDocument | null {
  return useStore(
    (state) => state.documents.find((doc) => doc.id === state.activeDocumentId) ?? null
  )
}
