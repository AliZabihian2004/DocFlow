import { useEffect } from 'react'
import { DropZone } from '@renderer/components/PdfImport/DropZone'
import { Button } from '@renderer/components/ui/button'
import { useStore } from '@renderer/state/store'

/**
 * Shown when nothing is open. The drop zone is the primary action; recent
 * files sit below it, empty on first launch.
 */
export function WelcomeScreen({
  onImport
}: {
  onImport: (paths: string[]) => void
}): React.JSX.Element {
  const recentFiles = useStore((state) => state.recentFiles)
  const setRecentFiles = useStore((state) => state.setRecentFiles)

  useEffect(() => {
    void window.api.getRecentFiles().then(setRecentFiles)
  }, [setRecentFiles])

  return (
    <div className="flex h-full flex-col items-center overflow-y-auto px-6 py-16">
      <div className="w-full max-w-xl">
        <header className="mb-10 text-center">
          <h1 className="text-foreground text-3xl font-semibold tracking-tight">Docflow</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Turn PDFs into clean, editable markdown &mdash; entirely offline.
          </p>
          <p className="text-muted-foreground mt-1 text-sm">
            Persian and other right-to-left languages are fully supported.
          </p>
        </header>

        <DropZone onFiles={onImport} />

        <section className="mt-10">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Recent
            </h2>
            {recentFiles.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void window.api.clearRecentFiles().then(setRecentFiles)}
              >
                Clear
              </Button>
            )}
          </div>

          {recentFiles.length === 0 ? (
            <p className="text-muted-foreground border-border rounded-md border border-dashed px-4 py-6 text-center text-sm">
              Nothing yet. Imported files will appear here.
            </p>
          ) : (
            <ul className="divide-border divide-y">
              {recentFiles.map((file) => (
                <li key={file.path}>
                  <button
                    onClick={() => onImport([file.path])}
                    className="hover:bg-muted flex w-full cursor-default items-baseline justify-between gap-4 rounded-md px-3 py-2.5 text-start"
                  >
                    <span className="text-foreground truncate text-sm" title={file.path}>
                      {file.name}
                    </span>
                    <span className="text-muted-foreground shrink-0 text-xs">
                      {formatWhen(file.openedAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

/** Coarse relative time. Precision past "days ago" is not useful here. */
function formatWhen(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''

  const minutes = Math.floor((Date.now() - then) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.floor(hours / 24)
  return days === 1 ? 'yesterday' : `${days}d ago`
}
