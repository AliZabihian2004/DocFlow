import { app } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import type { RecentFile } from '@shared/types'

/**
 * The recent-files list shown on the welcome screen.
 *
 * Kept in a small JSON file in userData, the same way window state is. This is
 * the one piece of state that deliberately outlives a session: documents
 * themselves live in memory until the user saves them, but a list of what they
 * opened last is cheap to keep and useless if it does not persist.
 */

const MAX_ENTRIES = 12

const storeFile = (): string => join(app.getPath('userData'), 'recent-files.json')

function isRecentFile(value: unknown): value is RecentFile {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<RecentFile>
  return (
    typeof candidate.path === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.openedAt === 'string' &&
    (candidate.kind === 'pdf' || candidate.kind === 'markdown')
  )
}

export function loadRecentFiles(): RecentFile[] {
  try {
    const parsed: unknown = JSON.parse(readFileSync(storeFile(), 'utf-8'))
    if (!Array.isArray(parsed)) return []
    // Drop anything malformed rather than trusting the file wholesale - it is
    // plain JSON on disk that a user could have edited.
    return parsed.filter(isRecentFile).slice(0, MAX_ENTRIES)
  } catch {
    // First launch, or an unreadable file. An empty list is the right answer.
    return []
  }
}

/**
 * Record a file as recently opened and return the updated list.
 *
 * Re-opening a file moves it to the top rather than duplicating it.
 */
export function addRecentFile(path: string, kind: RecentFile['kind']): RecentFile[] {
  const existing = loadRecentFiles().filter((entry) => entry.path !== path)

  const updated: RecentFile[] = [
    { path, name: basename(path), kind, openedAt: new Date().toISOString() },
    ...existing
  ].slice(0, MAX_ENTRIES)

  try {
    writeFileSync(storeFile(), JSON.stringify(updated, null, 2))
  } catch {
    // Losing the recent list is not worth interrupting an import over.
  }

  return updated
}

export function clearRecentFiles(): RecentFile[] {
  try {
    writeFileSync(storeFile(), '[]')
  } catch {
    // Same reasoning as above.
  }
  return []
}
