import { callCommand } from '@milkdown/kit/utils'
import {
  createCodeBlockCommand,
  toggleEmphasisCommand,
  toggleStrongCommand,
  wrapInBulletListCommand,
  wrapInHeadingCommand,
  wrapInOrderedListCommand
} from '@milkdown/kit/preset/commonmark'
import { useInstance } from '@milkdown/react'
import type { CmdKey } from '@milkdown/kit/core'
import { Button } from '@renderer/components/ui/button'

/**
 * Formatting controls for the canvas.
 *
 * Commands are dispatched through Milkdown's command registry rather than by
 * manipulating the document directly, so each one goes through ProseMirror's
 * transaction pipeline and lands in the undo history as a single step.
 */
export function EditorToolbar(): React.JSX.Element {
  const [loading, get] = useInstance()

  /** Run a Milkdown command, keeping focus in the document. */
  function run<T>(command: CmdKey<T>, payload?: T): void {
    if (loading) return
    get()?.action(callCommand(command, payload))
  }

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      // Logical padding so the bar mirrors correctly if the shell is ever RTL.
      className="border-border bg-surface flex flex-wrap items-center gap-1 border-b py-2 ps-4 pe-4"
    >
      <ToolbarButton label="Bold" shortcut="Ctrl+B" onClick={() => run(toggleStrongCommand.key)}>
        <span className="font-bold">B</span>
      </ToolbarButton>

      <ToolbarButton
        label="Italic"
        shortcut="Ctrl+I"
        onClick={() => run(toggleEmphasisCommand.key)}
      >
        <span className="italic">I</span>
      </ToolbarButton>

      <Separator />

      {([1, 2, 3] as const).map((level) => (
        <ToolbarButton
          key={level}
          label={`Heading ${level}`}
          onClick={() => run(wrapInHeadingCommand.key, level)}
        >
          H{level}
        </ToolbarButton>
      ))}

      <ToolbarButton label="Body text" onClick={() => run(wrapInHeadingCommand.key, 0)}>
        Body
      </ToolbarButton>

      <Separator />

      <ToolbarButton label="Bullet list" onClick={() => run(wrapInBulletListCommand.key)}>
        &bull; List
      </ToolbarButton>

      <ToolbarButton label="Numbered list" onClick={() => run(wrapInOrderedListCommand.key)}>
        1. List
      </ToolbarButton>

      <ToolbarButton label="Code block" onClick={() => run(createCodeBlockCommand.key)}>
        &lt;/&gt;
      </ToolbarButton>
    </div>
  )
}

function ToolbarButton({
  label,
  shortcut,
  onClick,
  children
}: {
  label: string
  shortcut?: string
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label={label}
      title={shortcut ? `${label} (${shortcut})` : label}
      // The canvas must keep focus, or the command has no selection to act on.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className="min-w-9"
    >
      {children}
    </Button>
  )
}

function Separator(): React.JSX.Element {
  return <div aria-hidden className="bg-border mx-1 h-5 w-px" />
}
