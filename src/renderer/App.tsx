import { useCallback, useEffect } from 'react'
import { ImportOverlay } from '@renderer/components/PdfImport/ParseProgress'
import { WelcomeScreen } from '@renderer/components/WelcomeScreen/WelcomeScreen'
import { usePdfParser } from '@renderer/hooks/usePdfParser'
import { useActiveDocument, useStore } from '@renderer/state/store'

export default function App(): React.JSX.Element {
  useSystemTheme()

  const { importPdf, cancelImport } = usePdfParser()
  const dismissImport = useStore((state) => state.dismissImport)
  const activeDocument = useActiveDocument()

  const handleImport = useCallback(
    (paths: string[]) => {
      // The sidecar handles one document at a time, so multiple files are
      // parsed in sequence rather than fired off together.
      void paths.reduce(
        (queue, path) => queue.then(() => importPdf(path)),
        Promise.resolve()
      )
    },
    [importPdf]
  )

  return (
    <div className="bg-background text-foreground h-full">
      {activeDocument ? (
        <DocumentPlaceholder />
      ) : (
        <WelcomeScreen onImport={handleImport} />
      )}

      <ImportOverlay onCancel={() => void cancelImport()} onDismiss={dismissImport} />
    </div>
  )
}

/**
 * Temporary read-only view of an imported document.
 *
 * Replaced by the Milkdown editor in the next phase; it exists so the import
 * flow can be exercised end to end before the editor lands.
 */
function DocumentPlaceholder(): React.JSX.Element {
  // Not named `document`: that would shadow the global one, which this file
  // also uses for the theme class.
  const doc = useActiveDocument()
  const setActiveDocument = useStore((state) => state.setActiveDocument)

  if (!doc) return <></>

  return (
    <div className="flex h-full flex-col">
      <header className="border-border flex items-baseline justify-between gap-4 border-b px-6 py-3">
        <h1 className="text-foreground truncate text-sm font-medium">{doc.title}</h1>
        <p className="text-muted-foreground shrink-0 font-mono text-xs">
          {doc.pageCount} {doc.pageCount === 1 ? 'page' : 'pages'} &middot;{' '}
          {doc.pathUsed === 'ocr' ? 'OCR' : 'text layer'}
        </p>
      </header>

      {/* dir="auto" lets the browser infer direction from the content itself,
          which is the same principle the editor's RTL handling will use. */}
      <pre
        dir="auto"
        className="text-foreground flex-1 overflow-auto px-8 py-6 text-sm leading-relaxed whitespace-pre-wrap"
      >
        {doc.content}
      </pre>

      <footer className="border-border text-muted-foreground flex items-center justify-between border-t px-6 py-2 text-xs">
        <span>
          {doc.hasRtl
            ? `RTL content detected · ${doc.wordsReversed} run(s) repaired`
            : 'No RTL content detected'}
        </span>
        <button
          onClick={() => setActiveDocument(null)}
          className="hover:text-foreground cursor-default"
        >
          Back to welcome
        </button>
      </footer>
    </div>
  )
}

/**
 * Follow the operating system's light/dark preference.
 *
 * Replaced by an explicit user setting once the settings screen exists; until
 * then the OS is the only signal available, and honouring it is better than
 * forcing everyone into light mode.
 */
function useSystemTheme(): void {
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)')

    const handleChange = (event: MediaQueryListEvent): void => {
      document.documentElement.classList.toggle('dark', event.matches)
    }

    document.documentElement.classList.toggle('dark', query.matches)
    query.addEventListener('change', handleChange)

    // Same function reference on both sides, or the listener is never removed.
    return () => query.removeEventListener('change', handleChange)
  }, [])
}
