import { app } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Settings, ThemePreference } from '@shared/types'

/**
 * User preferences, stored as JSON in userData alongside window state and the
 * recent-files list.
 *
 * Values are validated field by field on read rather than trusted wholesale.
 * The file is plain JSON on disk that a user can edit, and a bad `theme`
 * string or a negative font size should degrade to the default rather than
 * break the app on launch.
 */

export const DEFAULT_SETTINGS: Settings = {
  // Both packs by default. "fas" alone is more accurate on Persian-only
  // documents, which is exactly why this is exposed rather than hardcoded.
  ocrLanguages: 'fas+eng',
  tesseractPath: null,
  editorFontSize: 16,
  theme: 'system',
  defaultSaveDirectory: null
}

const MIN_FONT_SIZE = 12
const MAX_FONT_SIZE = 28

const settingsFile = (): string => join(app.getPath('userData'), 'settings.json')

function isTheme(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark'
}

function coerce(raw: Partial<Settings>): Settings {
  const fontSize = Number(raw.editorFontSize)

  return {
    ocrLanguages:
      typeof raw.ocrLanguages === 'string' && raw.ocrLanguages.trim() !== ''
        ? raw.ocrLanguages
        : DEFAULT_SETTINGS.ocrLanguages,
    tesseractPath: typeof raw.tesseractPath === 'string' ? raw.tesseractPath : null,
    editorFontSize: Number.isFinite(fontSize)
      ? Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(fontSize)))
      : DEFAULT_SETTINGS.editorFontSize,
    theme: isTheme(raw.theme) ? raw.theme : DEFAULT_SETTINGS.theme,
    defaultSaveDirectory:
      typeof raw.defaultSaveDirectory === 'string' ? raw.defaultSaveDirectory : null
  }
}

export function loadSettings(): Settings {
  try {
    const parsed: unknown = JSON.parse(readFileSync(settingsFile(), 'utf-8'))
    if (typeof parsed !== 'object' || parsed === null) return { ...DEFAULT_SETTINGS }
    return coerce(parsed as Partial<Settings>)
  } catch {
    // First launch, or an unreadable file.
    return { ...DEFAULT_SETTINGS }
  }
}

/** Merge a partial change into the stored settings and return the result. */
export function updateSettings(changes: Partial<Settings>): Settings {
  const merged = coerce({ ...loadSettings(), ...changes })

  try {
    writeFileSync(settingsFile(), JSON.stringify(merged, null, 2))
  } catch (error) {
    // Report it, but still hand back the merged values so the current session
    // behaves as the user asked even if the write failed.
    console.error('[settings] could not save:', error)
  }

  return merged
}
