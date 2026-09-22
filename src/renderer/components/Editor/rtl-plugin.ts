import { Plugin, PluginKey } from '@milkdown/kit/prose/state'
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view'
import { $prose } from '@milkdown/kit/utils'
import type { EditorState, Transaction } from '@milkdown/kit/prose/state'
import type { Node as ProseNode } from '@milkdown/kit/prose/model'

/**
 * Per-block text direction for the editor.
 *
 * Why not just `dir="auto"`
 * -------------------------
 * Two measured failures, both reproducible in Chromium:
 *
 *   1. `dir="auto"` on the editor root resolves once, from the first strong
 *      character in the *whole document*. A Persian paragraph below an English
 *      heading therefore renders left-to-right. Direction has to be decided on
 *      each block separately.
 *
 *   2. Even per-block, `auto` uses the first strong character in that block.
 *      A Persian sentence opening with a Latin word - "Docflow است یک برنامه" -
 *      resolves left-to-right, which is wrong for a sentence that is otherwise
 *      entirely Persian.
 *
 * So each block's direction is computed from which script actually dominates
 * its text, which handles both cases. Blocks with no strong characters at all
 * (a line of digits, an empty paragraph) fall back to `auto` rather than being
 * forced either way.
 *
 * Auto-detection will still be wrong sometimes, which is why the direction can
 * be overridden per block from the toolbar. Overrides live in plugin state and
 * are remapped as the document changes; they are deliberately not written into
 * the document, because markdown has nowhere to put them - see
 * `setBlockDirection` for what that means in practice.
 */

export type Direction = 'ltr' | 'rtl'
/** What the user can choose: a fixed direction, or hand it back to detection. */
export type DirectionSetting = Direction | 'auto'

/**
 * Strong right-to-left characters.
 *
 * Arabic block (covers all Persian letters), Arabic Supplement and Extended-A,
 * both presentation-form blocks, and Hebrew. A deliberately cheap test - this
 * runs over every block on every update, and a language-detection library
 * would be orders of magnitude more work for no better answer.
 */
const RTL_CHARS = /[֐-׿؀-ۿ܀-ݏݐ-ݿࢠ-ࣿיִ-﷽ﹰ-ﻼ]/g

/** Strong left-to-right characters: Latin, Greek and Cyrillic letters. */
const LTR_CHARS = /[A-Za-zÀ-ɏͰ-ϿЀ-ӿ]/g

function countMatches(text: string, pattern: RegExp): number {
  // The patterns are global, so lastIndex must not leak between calls.
  pattern.lastIndex = 0
  let count = 0
  while (pattern.exec(text) !== null) count += 1
  return count
}

/**
 * Decide a block's direction from its own text.
 *
 * Returns `auto` when there is nothing to go on, so the browser's own
 * behaviour applies rather than an arbitrary guess.
 */
export function detectDirection(text: string): DirectionSetting {
  const rtl = countMatches(text, RTL_CHARS)
  if (rtl === 0) return text.trim() === '' ? 'auto' : 'ltr'

  const ltr = countMatches(text, LTR_CHARS)
  // Ties go to RTL: a block containing any meaningful amount of Arabic script
  // reads better right-aligned than a mostly-Persian line forced to LTR.
  return rtl >= ltr ? 'rtl' : 'ltr'
}

/**
 * Node types that should carry their own direction.
 *
 * List *containers* are included alongside list items, not just the items.
 * The item decides which side its marker sits on, but the container owns the
 * `padding-inline-start` that indents the list - leave the container LTR and a
 * Persian list ends up with its markers on the right and its indent on the
 * left.
 */
const DIRECTIONAL_CONTAINERS = new Set(['list_item', 'bullet_list', 'ordered_list', 'blockquote'])

function needsDirection(node: ProseNode): boolean {
  // Code is never RTL regardless of surrounding text; the stylesheet pins it.
  if (node.type.name === 'code_block') return false
  return node.isTextblock || DIRECTIONAL_CONTAINERS.has(node.type.name)
}

interface OverrideEntry {
  /** Document position of the block this applies to. */
  pos: number
  dir: Direction
}

interface DirectionState {
  overrides: OverrideEntry[]
}

export const directionPluginKey = new PluginKey<DirectionState>('docflow-direction')

interface DirectionMeta {
  pos: number
  /** `auto` removes the override and returns the block to detection. */
  setting: DirectionSetting
}

/**
 * Build the decorations for one document state.
 *
 * Decorations are used rather than node attributes so that direction never
 * enters the document itself. A `dir` attribute in the schema would have to
 * survive markdown serialisation, and markdown has no syntax for it - the
 * attribute would be silently dropped on save and the document would come back
 * different from how it left.
 */
function buildDecorations(state: EditorState, overrides: OverrideEntry[]): DecorationSet {
  const decorations: Decoration[] = []
  const overrideAt = new Map(overrides.map((entry) => [entry.pos, entry.dir]))

  state.doc.descendants((node, pos) => {
    if (!needsDirection(node)) return true

    const override = overrideAt.get(pos)
    const direction = override ?? detectDirection(node.textContent)

    decorations.push(
      Decoration.node(pos, pos + node.nodeSize, {
        dir: direction,
        // Lets the toolbar and stylesheet distinguish a deliberate choice from
        // a detected one.
        'data-direction-source': override ? 'manual' : 'auto'
      })
    )

    return true
  })

  return DecorationSet.create(state.doc, decorations)
}

/**
 * The ProseMirror plugin. Registered with the editor in MarkdownCanvas.
 */
export const rtlPlugin = $prose(
  () =>
    new Plugin<DirectionState>({
      key: directionPluginKey,

      state: {
        init: () => ({ overrides: [] }),

        apply(tr: Transaction, value: DirectionState): DirectionState {
          let overrides = value.overrides

          // Keep overrides pointing at their blocks as the document changes.
          if (tr.docChanged) {
            overrides = overrides
              .map((entry) => {
                const mapped = tr.mapping.mapResult(entry.pos)
                return mapped.deleted ? null : { ...entry, pos: mapped.pos }
              })
              .filter((entry): entry is OverrideEntry => entry !== null)
          }

          const meta = tr.getMeta(directionPluginKey) as DirectionMeta | undefined
          if (meta) {
            const without = overrides.filter((entry) => entry.pos !== meta.pos)
            overrides =
              meta.setting === 'auto'
                ? without
                : [...without, { pos: meta.pos, dir: meta.setting }]
          }

          return { overrides }
        }
      },

      props: {
        decorations(state) {
          const pluginState = directionPluginKey.getState(state)
          return buildDecorations(state, pluginState?.overrides ?? [])
        }
      }
    })
)

// --- Helpers used by the toolbar -------------------------------------------

/** Find the position of the block containing the selection head. */
export function blockPositionAt(state: EditorState): number | null {
  const { $from } = state.selection

  // Walk out to the nearest ancestor we assign direction to.
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth)
    if (needsDirection(node)) return $from.before(depth)
  }

  return null
}

/** What the toolbar should show as active for the current block. */
export function currentDirectionSetting(state: EditorState): DirectionSetting {
  const pos = blockPositionAt(state)
  if (pos === null) return 'auto'

  const overrides = directionPluginKey.getState(state)?.overrides ?? []
  const override = overrides.find((entry) => entry.pos === pos)
  return override ? override.dir : 'auto'
}

/**
 * Override (or release) the direction of the block holding the selection.
 *
 * Note the limitation this carries: the choice lives in editor state, not in
 * the document, so it is lost when the file is saved and reopened. Markdown
 * cannot express it, and writing raw HTML into the document to work around
 * that would be a worse trade than losing a per-block override.
 */
export function setBlockDirection(
  state: EditorState,
  dispatch: ((tr: Transaction) => void) | undefined,
  setting: DirectionSetting
): boolean {
  const pos = blockPositionAt(state)
  if (pos === null) return false

  if (dispatch) {
    dispatch(state.tr.setMeta(directionPluginKey, { pos, setting } satisfies DirectionMeta))
  }

  return true
}
