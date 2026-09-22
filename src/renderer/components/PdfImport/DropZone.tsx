import { useCallback, useState } from 'react'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'

/**
 * The primary import affordance: a drop target that also opens the native
 * file picker when clicked.
 */
export function DropZone({
  onFiles,
  className
}: {
  onFiles: (paths: string[]) => void
  className?: string
}): React.JSX.Element {
  const [isDragging, setIsDragging] = useState(false)
  const [rejected, setRejected] = useState<string | null>(null)

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      setIsDragging(false)
      setRejected(null)

      const dropped = Array.from(event.dataTransfer.files)

      // File.path was removed from Electron, so the real path has to come from
      // webUtils by way of the preload bridge.
      const paths = dropped.map((file) => window.api.getPathForFile(file))
      const pdfs = paths.filter((path) => path.toLowerCase().endsWith('.pdf'))

      if (pdfs.length === 0) {
        setRejected(
          dropped.length === 1
            ? 'That file is not a PDF.'
            : 'None of those files are PDFs.'
        )
        return
      }

      onFiles(pdfs)
    },
    [onFiles]
  )

  const handleBrowse = useCallback(async () => {
    setRejected(null)
    const paths = await window.api.openPdfDialog()
    if (paths.length > 0) onFiles(paths)
  }, [onFiles])

  return (
    <div
      onDragOver={(event) => {
        // Without preventDefault the browser navigates to the dropped file.
        event.preventDefault()
        setIsDragging(true)
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className={cn(
        'flex flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed p-12 transition-colors',
        isDragging ? 'border-primary bg-accent' : 'border-border bg-surface',
        className
      )}
    >
      <div className="text-center">
        <p className="text-foreground text-lg font-medium">Drop a PDF here</p>
        <p className="text-muted-foreground mt-1 text-sm">
          Text documents and scanned pages both work
        </p>
      </div>

      <Button onClick={handleBrowse} size="lg">
        Import PDF
      </Button>

      {rejected && (
        <p role="alert" className="text-destructive text-sm">
          {rejected}
        </p>
      )}
    </div>
  )
}
