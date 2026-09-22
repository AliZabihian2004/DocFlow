import { useMemo } from 'react'
import { useStore, type DocflowDocument } from '@renderer/state/store'

/**
 * Right-hand inspector: where the document came from, and what is in it.
 *
 * Collapsed by default and closed from its own header - it is a thing you open
 * to answer a question, not a permanent third column.
 *
 * The conversion facts matter more here than they might look. When a Persian
 * import reads oddly, the first questions are always which pipeline ran and
 * whether the RTL repair did anything, and those answers are otherwise
 * invisible once the import panel has gone.
 */
export function Inspector({ document: doc }: { document: DocflowDocument }): React.JSX.Element {
  const toggleInspector = useStore((state) => state.toggleInspector)
  const outline = useMemo(() => extractOutline(doc.content), [doc.content])

  return (
    <aside className="border-border bg-surface flex w-72 shrink-0 flex-col border-s">
      <div className="flex items-center justify-between gap-2 py-2 ps-3 pe-2">
        <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Inspector
        </span>
        <button
          onClick={toggleInspector}
          aria-label="Close inspector"
          title="Close inspector"
          className="text-muted-foreground hover:bg-muted hover:text-foreground cursor-default rounded px-1.5 py-0.5 text-sm"
        >
          &times;
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-4">
        <Section title="Document">
          <Row label="Source">
            {doc.origin === 'pdf' ? 'Imported from PDF' : 'Created in Docflow'}
          </Row>
          {doc.sourcePdfPath && (
            <Row label="File" mono>
              <span className="break-all" title={doc.sourcePdfPath}>
                {doc.sourcePdfPath.split(/[\\/]/).pop()}
              </span>
            </Row>
          )}
          {doc.pageCount !== undefined && <Row label="Pages">{doc.pageCount}</Row>}
          {doc.pathUsed && (
            <Row label="Extraction">
              {doc.pathUsed === 'ocr' ? 'OCR (scanned)' : 'Text layer'}
            </Row>
          )}
          <Row label="Saved to" mono>
            {doc.path ? (
              <span className="break-all" title={doc.path}>
                {doc.path}
              </span>
            ) : (
              <span className="text-muted-foreground">Not saved yet</span>
            )}
          </Row>
        </Section>

        {doc.origin === 'pdf' && (
          <Section title="Right-to-left">
            <Row label="Detected">{doc.hasRtl ? 'Yes' : 'No'}</Row>
            {doc.hasRtl && (
              <Row label="Runs repaired">
                {doc.wordsReversed}
                {doc.wordsReversed === 0 && (
                  <span className="text-muted-foreground"> (none needed)</span>
                )}
              </Row>
            )}
          </Section>
        )}

        <Section title="Outline">
          {outline.length === 0 ? (
            <p className="text-muted-foreground py-1 text-sm">No headings.</p>
          ) : (
            <ul className="space-y-0.5">
              {outline.map((heading, index) => (
                <li
                  key={`${heading.text}-${index}`}
                  // Heading text may be Persian; let each line find its own way.
                  dir="auto"
                  className="text-foreground truncate text-sm"
                  style={{ paddingInlineStart: `${(heading.level - 1) * 0.75}rem` }}
                  title={heading.text}
                >
                  {heading.text}
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </aside>
  )
}

function Section({
  title,
  children
}: {
  title: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className="border-border border-b py-3 last:border-b-0">
      <h3 className="text-muted-foreground mb-2 text-[11px] font-medium tracking-wide uppercase">
        {title}
      </h3>
      {children}
    </section>
  )
}

function Row({
  label,
  mono,
  children
}: {
  label: string
  mono?: boolean
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex gap-2 py-0.5 text-sm">
      <span className="text-muted-foreground w-24 shrink-0">{label}</span>
      <span className={mono ? 'font-mono text-xs' : undefined}>{children}</span>
    </div>
  )
}

interface Heading {
  level: number
  text: string
}

/**
 * Pull ATX headings out of the markdown source.
 *
 * Reading the source rather than the rendered document keeps the inspector
 * independent of the editor instance. Fenced code is skipped, since a comment
 * starting with `#` inside a code block is not a heading.
 */
function extractOutline(markdown: string): Heading[] {
  const headings: Heading[] = []
  let insideFence = false

  for (const line of markdown.split('\n')) {
    if (line.trimStart().startsWith('```')) {
      insideFence = !insideFence
      continue
    }
    if (insideFence) continue

    const match = /^(#{1,6})\s+(.*\S)\s*$/.exec(line)
    if (match) {
      headings.push({ level: match[1].length, text: match[2] })
    }
  }

  return headings
}
