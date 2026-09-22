import { app } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { BrowserWindow } from 'electron'

/**
 * Remembers window size/position between launches.
 *
 * Electron gives us no built-in persistence for this, so we keep a small JSON
 * file in the app's userData directory. Everything here is best-effort: a
 * missing or corrupt file just means the window opens at its default size.
 */

interface WindowState {
  width: number
  height: number
  x?: number
  y?: number
  isMaximized: boolean
}

const DEFAULT_STATE: WindowState = {
  width: 1280,
  height: 820,
  isMaximized: false
}

const stateFile = (): string => join(app.getPath('userData'), 'window-state.json')

export function loadWindowState(): WindowState {
  try {
    const parsed = JSON.parse(readFileSync(stateFile(), 'utf-8')) as Partial<WindowState>
    return {
      width: parsed.width ?? DEFAULT_STATE.width,
      height: parsed.height ?? DEFAULT_STATE.height,
      x: parsed.x,
      y: parsed.y,
      isMaximized: parsed.isMaximized ?? false
    }
  } catch {
    // First launch, or the file was hand-edited into something invalid.
    return { ...DEFAULT_STATE }
  }
}

/**
 * Saves bounds whenever the user finishes resizing or moving the window.
 * `resize`/`move` fire continuously while dragging, so we debounce the writes.
 */
export function trackWindowState(window: BrowserWindow): void {
  let timer: NodeJS.Timeout | undefined

  const persist = (): void => {
    if (window.isDestroyed()) return
    // getNormalBounds() reports the pre-maximize size, which is what we want to
    // restore to when the user un-maximizes on the next launch.
    const bounds = window.getNormalBounds()
    const state: WindowState = {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      isMaximized: window.isMaximized()
    }
    try {
      writeFileSync(stateFile(), JSON.stringify(state, null, 2))
    } catch {
      // Losing window position is not worth interrupting the user over.
    }
  }

  const schedulePersist = (): void => {
    clearTimeout(timer)
    timer = setTimeout(persist, 400)
  }

  window.on('resize', schedulePersist)
  window.on('move', schedulePersist)
  window.on('maximize', schedulePersist)
  window.on('unmaximize', schedulePersist)
  window.on('close', () => {
    clearTimeout(timer)
    persist()
  })
}
