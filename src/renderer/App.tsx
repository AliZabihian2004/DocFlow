import { useCallback, useEffect } from 'react'
import { EditorScreen } from '@renderer/components/Editor/EditorScreen'
import { FileSidebar } from '@renderer/components/FileSidebar/FileSidebar'
import { Inspector } from '@renderer/components/Inspector/Inspector'
import { ImportOverlay } from '@renderer/components/PdfImport/ParseProgress'
import { SettingsScreen } from '@renderer/components/Settings/SettingsScreen'
import { WelcomeScreen } from '@renderer/components/WelcomeScreen/WelcomeScreen'
import { usePdfParser } from '@renderer/hooks/usePdfParser'
import { useActiveDocument, useStore } from '@renderer/state/store'

export default function App(): React.JSX.Element {
  useSettings()
  useTheme()
  useEditorFontSize()

  const { importPdf, cancelImport } = usePdfParser()
  const dismissImport = useStore((state) => state.dismissImport)
  const documents = useStore((state) => state.documents)
  const inspectorOpen = useStore((state) => state.inspectorOpen)
  const settingsOpen = useStore((state) => state.settingsOpen)
  const activeDocument = useActiveDocument()

  const handleImport = useCallback(
    (paths: string[]) => {
      // The sidecar handles one document at a time, so multiple files are
      // parsed in sequence rather than fired off together.
      void paths.reduce((queue, path) => queue.then(() => importPdf(path)), Promise.resolve())
    },
    [importPdf]
  )

  const handleImportClick = useCallback(() => {
    void window.api.openPdfDialog().then((paths) => {
      if (paths.length > 0) handleImport(paths)
    })
  }, [handleImport])

  // Nothing open at all: the welcome screen owns the whole window rather than
  // sitting in an empty three-pane frame.
  const showWorkspace = documents.length > 0

  return (
    <div className="bg-background text-foreground h-full">
      {showWorkspace ? (
        <div className="flex h-full">
          <FileSidebar onImport={handleImportClick} />

          <main className="min-w-0 flex-1">
            {activeDocument ? (
              <EditorScreen document={activeDocument} />
            ) : (
              <NoDocumentSelected />
            )}
          </main>

          {inspectorOpen && activeDocument && <Inspector document={activeDocument} />}
        </div>
      ) : (
        <WelcomeScreen onImport={handleImport} />
      )}

      <ImportOverlay onCancel={() => void cancelImport()} onDismiss={dismissImport} />
      {settingsOpen && <SettingsScreen />}
    </div>
  )
}

function NoDocumentSelected(): React.JSX.Element {
  return (
    <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
      Select a file from the sidebar.
    </div>
  )
}

/** Load persisted settings once at startup. */
function useSettings(): void {
  const setSettings = useStore((state) => state.setSettings)

  useEffect(() => {
    void window.api.getSettings().then(setSettings)
  }, [setSettings])
}

/**
 * Apply the theme preference.
 *
 * "system" follows the OS and keeps following it, so the app changes with a
 * scheduled dark mode rather than freezing at whatever it was on launch.
 */
function useTheme(): void {
  const theme = useStore((state) => state.settings?.theme ?? 'system')

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)')

    const apply = (): void => {
      const dark = theme === 'dark' || (theme === 'system' && query.matches)
      document.documentElement.classList.toggle('dark', dark)
    }

    apply()
    if (theme !== 'system') return

    // Same function reference on both sides, or the listener is never removed.
    query.addEventListener('change', apply)
    return () => query.removeEventListener('change', apply)
  }, [theme])
}

/**
 * Publish the editor font size as a CSS variable.
 *
 * The stylesheet consumes it, so the size applies to the canvas without any
 * component needing to thread it through props.
 */
function useEditorFontSize(): void {
  const fontSize = useStore((state) => state.settings?.editorFontSize)

  useEffect(() => {
    if (fontSize === undefined) return
    document.documentElement.style.setProperty('--editor-font-size', `${fontSize}px`)
  }, [fontSize])
}
