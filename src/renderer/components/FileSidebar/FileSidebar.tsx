import { useMemo } from 'react'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'
import { useStore, type DocflowDocument } from '@renderer/state/store'

/**
 * Left sidebar: open documents, grouped by where they came from.
 *
 * The grouping is not cosmetic. A converted PDF and a document typed from
 * scratch behave differently - one has a source file, page count and an
 * extraction path behind it, the other does not - and mixing them in one flat
 * list makes it harder to find the conversion you were checking.
 */
export function FileSidebar({ onImport }: { onImport: () => void }): React.JSX.Element {
  const documents = useStore((state) => state.documents)
  const activeDocumentId = useStore((state) => state.activeDocumentId)
  const collapsed = useStore((state) => state.sidebarCollapsed)
  const filter = useStore((state) => state.fileFilter)
  const setFileFilter = useStore((state) => state.setFileFilter)
  const setActiveDocument = useStore((state) => state.setActiveDocument)
  const closeDocument = useStore((state) => state.closeDocument)
  const createDocument = useStore((state) => state.createDocument)
  const toggleSidebar = useStore((state) => state.toggleSidebar)
  const setSettingsOpen = useStore((state) => state.setSettingsOpen)

  const { imported, created } = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    const matches = needle
      ? documents.filter((doc) => doc.title.toLowerCase().includes(needle))
      : documents

    return {
      imported: matches.filter((doc) => doc.origin === 'pdf'),
      created: matches.filter((doc) => doc.origin === 'new')
    }
  }, [documents, filter])

  if (collapsed) {
    return (
      <aside className="border-border bg-surface flex w-11 shrink-0 flex-col items-center gap-2 border-e py-3">
        <IconButton label="Expand sidebar" onClick={toggleSidebar}>
          &raquo;
        </IconButton>
      </aside>
    )
  }

  return (
    <aside className="border-border bg-surface flex w-64 shrink-0 flex-col border-e">
      <div className="flex items-center justify-between gap-2 py-2 ps-3 pe-2">
        <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Files
        </span>
        <IconButton label="Collapse sidebar" onClick={toggleSidebar}>
          &laquo;
        </IconButton>
      </div>

      <div className="px-3 pb-2">
        <input
          type="search"
          value={filter}
          onChange={(event) => setFileFilter(event.target.value)}
          placeholder="Filter files"
          aria-label="Filter files"
          // dir="auto" so a Persian filename typed here reads correctly.
          dir="auto"
          className={cn(
            'bg-background border-border text-foreground placeholder:text-muted-foreground',
            'focus-visible:ring-ring w-full rounded-md border px-2.5 py-1.5 text-sm',
            'text-start focus-visible:ring-2 focus-visible:outline-none'
          )}
        />
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {documents.length === 0 ? (
          <p className="text-muted-foreground px-2 py-6 text-center text-sm">
            No files open yet.
          </p>
        ) : (
          <>
            <FileGroup
              label="Imported from PDF"
              documents={imported}
              activeId={activeDocumentId}
              onSelect={setActiveDocument}
              onClose={closeDocument}
            />
            <FileGroup
              label="Created new"
              documents={created}
              activeId={activeDocumentId}
              onSelect={setActiveDocument}
              onClose={closeDocument}
            />
            {imported.length === 0 && created.length === 0 && (
              <p className="text-muted-foreground px-2 py-6 text-center text-sm">
                Nothing matches that filter.
              </p>
            )}
          </>
        )}
      </div>

      <div className="border-border flex flex-col gap-1 border-t p-2">
        <Button variant="secondary" size="sm" onClick={onImport} className="w-full">
          Import PDF
        </Button>
        <Button variant="ghost" size="sm" onClick={() => createDocument()} className="w-full">
          New document
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSettingsOpen(true)}
          className="w-full"
        >
          Settings
        </Button>
      </div>
    </aside>
  )
}

function FileGroup({
  label,
  documents,
  activeId,
  onSelect,
  onClose
}: {
  label: string
  documents: DocflowDocument[]
  activeId: string | null
  onSelect: (id: string) => void
  onClose: (id: string) => void
}): React.JSX.Element | null {
  if (documents.length === 0) return null

  return (
    <section className="mb-3">
      <h2 className="text-muted-foreground px-2 py-1 text-[11px] font-medium tracking-wide uppercase">
        {label}
      </h2>
      <ul>
        {documents.map((doc) => (
          <li key={doc.id} className="group/item relative">
            <button
              onClick={() => onSelect(doc.id)}
              title={doc.path ?? doc.sourcePdfPath ?? doc.title}
              className={cn(
                'flex w-full cursor-default items-center gap-1.5 rounded-md py-1.5 ps-2 pe-7 text-start text-sm',
                doc.id === activeId
                  ? 'bg-accent text-accent-foreground'
                  : 'text-foreground hover:bg-muted'
              )}
            >
              {/* Filenames can be Persian, so the label infers its own
                  direction rather than inheriting the chrome's. */}
              <span dir="auto" className="min-w-0 flex-1 truncate">
                {doc.title}
              </span>
              {doc.dirty && (
                <span
                  aria-label="Unsaved changes"
                  title="Unsaved changes"
                  className="bg-primary size-1.5 shrink-0 rounded-full"
                />
              )}
            </button>

            <button
              onClick={() => onClose(doc.id)}
              aria-label={`Close ${doc.title}`}
              title="Close"
              className={cn(
                'text-muted-foreground hover:text-foreground absolute end-1 top-1/2',
                '-translate-y-1/2 cursor-default rounded px-1 opacity-0',
                'group-hover/item:opacity-100 focus-visible:opacity-100'
              )}
            >
              &times;
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

function IconButton({
  label,
  onClick,
  children
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="text-muted-foreground hover:bg-muted hover:text-foreground cursor-default rounded px-1.5 py-0.5 text-sm"
    >
      {children}
    </button>
  )
}
