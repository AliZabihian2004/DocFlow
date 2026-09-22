import { useCallback, useEffect } from 'react'
import { MilkdownProvider } from '@milkdown/react'
import { EditorToolbar } from './EditorToolbar'
import { MarkdownCanvas } from './MarkdownCanvas'
import { Button } from '@renderer/components/ui/button'
import { useFileSystem } from '@renderer/hooks/useFileSystem'
import { useStore, type DocflowDocument } from '@renderer/state/store'

/**
 * The editing screen: toolbar, canvas, status bar.
 *
 * The three-pane layout (file sidebar, canvas, inspector) lands in a later
 * phase; this is the centre column it will sit inside.
 */
export function EditorScreen({ document: doc }: { document: DocflowDocument }): React.JSX.Element {
  const updateDocumentContent = useStore((state) => state.updateDocumentContent)
  const setActiveDocument = useStore((state) => state.setActiveDocument)
  const { saveDocument } = useFileSystem()

  const handleChange = useCallback(
    (markdown: string) => updateDocumentContent(doc.id, markdown),
    [updateDocumentContent, doc.id]
  )

  const handleSave = useCallback(() => {
    void saveDocument(doc)
  }, [saveDocument, doc])

  // Ctrl/Cmd+S. Registered on the window because the caret is inside
  // ProseMirror, which would otherwise swallow the event.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleSave])

  return (
    // MilkdownProvider must wrap both the toolbar and the canvas: the toolbar
    // reaches the editor instance through the same context.
    <MilkdownProvider>
      <div className="flex h-full flex-col">
        <header className="border-border bg-surface flex items-center justify-between gap-4 border-b py-2 ps-4 pe-3">
          <h1 className="text-foreground truncate text-sm font-medium" title={doc.path ?? doc.title}>
            {doc.title}
          </h1>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setActiveDocument(null)}>
              Close
            </Button>
            <Button size="sm" onClick={handleSave} disabled={!doc.dirty}>
              Save
            </Button>
          </div>
        </header>

        <EditorToolbar />

        {/* Generous margins and a comfortable measure; the canvas scrolls, the
            chrome does not. */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl px-10 py-10">
            <MarkdownCanvas
              documentId={doc.id}
              initialMarkdown={doc.content}
              onChange={handleChange}
            />
          </div>
        </div>

        <StatusBar document={doc} />
      </div>
    </MilkdownProvider>
  )
}

function StatusBar({ document: doc }: { document: DocflowDocument }): React.JSX.Element {
  return (
    <footer className="border-border bg-surface text-muted-foreground flex items-center justify-between gap-4 border-t py-1.5 ps-4 pe-4 text-xs">
      <div className="flex items-center gap-4">
        <span>{countWords(doc.content).toLocaleString()} words</span>
        {doc.hasRtl && (
          <span title={`${doc.wordsReversed} reversed run(s) repaired during import`}>
            RTL content
          </span>
        )}
      </div>

      <span className={doc.dirty ? 'text-foreground' : undefined}>
        {doc.dirty ? 'Unsaved changes' : 'Saved'}
      </span>
    </footer>
  )
}

/**
 * Word count across scripts.
 *
 * Splitting on whitespace works for Persian as well as Latin, since Persian
 * separates words with spaces. The zero-width non-joiner sits *inside* words
 * and must not be treated as a boundary, which is why this splits on
 * whitespace explicitly rather than on a general non-letter pattern.
 */
function countWords(markdown: string): number {
  const stripped = markdown
    .replace(/```[\s\S]*?```/g, ' ') // fenced code
    // Deleted rather than replaced with a space. Emphasis markers sit *inside*
    // words, so substituting a space would split a partly-bolded word into two
    // and inflate the count. Block markers (#, >, -) are always followed by a
    // space of their own, so removing them loses no boundary.
    .replace(/[#>*_~`-]/g, '')
  const words = stripped.split(/\s+/).filter((token) => token.length > 0)
  return words.length
}
