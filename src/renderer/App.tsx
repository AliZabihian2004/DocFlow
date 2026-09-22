import { useCallback, useEffect } from 'react'
import { EditorScreen } from '@renderer/components/Editor/EditorScreen'
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
        <EditorScreen document={activeDocument} />
      ) : (
        <WelcomeScreen onImport={handleImport} />
      )}

      <ImportOverlay onCancel={() => void cancelImport()} onDismiss={dismissImport} />
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
