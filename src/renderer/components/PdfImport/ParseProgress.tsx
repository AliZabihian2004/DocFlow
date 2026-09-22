import { Button } from '@renderer/components/ui/button'
import { Progress } from '@renderer/components/ui/progress'
import { useStore, type ImportState } from '@renderer/state/store'

/**
 * The import panel, shown while a PDF is being parsed.
 *
 * The status line renders whatever the sidecar sent, verbatim. That matters
 * for the direction-fixing message in particular: the sidecar only emits it
 * when RTL content was actually found, so there is nothing for this component
 * to decide. Adding a condition here would risk showing it unconditionally,
 * which would be a lie on an English-only document.
 */
export function ParseProgress({
  importState,
  onCancel,
  onDismiss
}: {
  importState: ImportState
  onCancel: () => void
  onDismiss: () => void
}): React.JSX.Element {
  const { fileName, progress, error } = importState

  if (error) return <ImportFailed fileName={fileName} error={error} onDismiss={onDismiss} />

  const isStalled = progress?.phase === 'stalled'

  return (
    <div className="bg-surface border-border w-full max-w-lg rounded-lg border p-6 shadow-lg">
      <h2 className="text-foreground truncate text-base font-medium" title={fileName}>
        {fileName}
      </h2>

      {progress?.total ? (
        <p className="text-muted-foreground mt-1 text-sm">
          {progress.total} {progress.total === 1 ? 'page' : 'pages'}
        </p>
      ) : null}

      {/* A real percentage from the sidecar, never an indeterminate spinner. */}
      <Progress value={progress?.percent ?? 0} className="mt-5" />

      <div className="mt-3 flex items-baseline justify-between gap-4">
        <p
          aria-live="polite"
          className={isStalled ? 'text-destructive text-sm' : 'text-muted-foreground text-sm'}
        >
          {progress?.message ?? 'Starting…'}
        </p>
        <span className="text-muted-foreground shrink-0 font-mono text-xs tabular-nums">
          {Math.round(progress?.percent ?? 0)}%
        </span>
      </div>

      <div className="mt-6 flex justify-end">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

function ImportFailed({
  fileName,
  error,
  onDismiss
}: {
  fileName: string
  error: string
  onDismiss: () => void
}): React.JSX.Element {
  return (
    <div className="bg-surface border-border w-full max-w-lg rounded-lg border p-6 shadow-lg">
      <h2 className="text-foreground truncate text-base font-medium" title={fileName}>
        Could not import {fileName}
      </h2>
      <p role="alert" className="text-destructive mt-2 text-sm">
        {error}
      </p>
      <div className="mt-6 flex justify-end">
        <Button variant="secondary" onClick={onDismiss}>
          Close
        </Button>
      </div>
    </div>
  )
}

/** Full-screen scrim holding the import panel while a parse is running. */
export function ImportOverlay({
  onCancel,
  onDismiss
}: {
  onCancel: () => void
  onDismiss: () => void
}): React.JSX.Element | null {
  const activeImport = useStore((state) => state.activeImport)
  if (!activeImport) return null

  return (
    <div className="bg-background/80 fixed inset-0 z-50 flex items-center justify-center p-6 backdrop-blur-sm">
      <ParseProgress importState={activeImport} onCancel={onCancel} onDismiss={onDismiss} />
    </div>
  )
}
