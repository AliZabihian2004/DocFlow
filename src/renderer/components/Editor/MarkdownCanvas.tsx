import { useEffect } from 'react'
import { defaultValueCtx, Editor, editorViewOptionsCtx, rootCtx } from '@milkdown/kit/core'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import { gfm } from '@milkdown/kit/preset/gfm'
import { history } from '@milkdown/kit/plugin/history'
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener'
import { clipboard } from '@milkdown/kit/plugin/clipboard'
import { cursor } from '@milkdown/kit/plugin/cursor'
import { trailing } from '@milkdown/kit/plugin/trailing'
import { Milkdown, useEditor } from '@milkdown/react'
import '@milkdown/kit/prose/view/style/prosemirror.css'
import '@milkdown/kit/prose/tables/style/tables.css'

/**
 * The WYSIWYG markdown canvas.
 *
 * Milkdown sits on ProseMirror and round-trips through remark, so what the
 * user edits is a real document tree and what we store is ordinary markdown -
 * no HTML intermediate and no lossy conversion on the way back out.
 *
 * Content flows one way only. The editor is created once per document with
 * that document's markdown as its initial value, and reports changes outward
 * through the listener plugin. Pushing store updates back in would fight the
 * user's cursor on every keystroke.
 */
export function MarkdownCanvas({
  documentId,
  initialMarkdown,
  onChange
}: {
  /** Recreates the editor when a different document is opened. */
  documentId: string
  initialMarkdown: string
  onChange: (markdown: string) => void
}): React.JSX.Element {
  const { get } = useEditor(
    (root) =>
      Editor.make()
        .config((ctx) => {
          ctx.set(rootCtx, root)
          ctx.set(defaultValueCtx, initialMarkdown)

          ctx.update(editorViewOptionsCtx, (previous) => ({
            ...previous,
            attributes: {
              class: 'docflow-prose outline-none',
              // Direction is inferred per block from the block's own content,
              // which is what lets one document mix Persian and English
              // paragraphs. The editor shell itself stays LTR.
              dir: 'auto'
            }
          }))

          ctx.get(listenerCtx).markdownUpdated((_ctx, markdown, previousMarkdown) => {
            // Milkdown fires this once on load with no previous value; that is
            // not a user edit and must not mark the document dirty.
            if (previousMarkdown === undefined || markdown === previousMarkdown) return
            onChange(markdown)
          })
        })
        .use(commonmark)
        .use(gfm)
        .use(history)
        .use(listener)
        .use(clipboard)
        .use(cursor)
        // Guarantees a trailing paragraph, so there is always somewhere to
        // click below a table or code block at the end of a document.
        .use(trailing),
    // Deliberately keyed on the document, not the content: a new editor per
    // keystroke would be catastrophic.
    [documentId]
  )

  // Put the caret in the document on open so typing works without a click.
  useEffect(() => {
    const editor = get()
    if (!editor) return
    const timer = setTimeout(() => {
      const view = document.querySelector<HTMLElement>('.docflow-prose')
      view?.focus()
    }, 0)
    return () => clearTimeout(timer)
  }, [get, documentId])

  return <Milkdown />
}
