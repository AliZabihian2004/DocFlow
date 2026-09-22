import { BrowserWindow, dialog, ipcMain } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { addRecentFile, clearRecentFiles, loadRecentFiles } from '../recent-files'
import { loadSettings, updateSettings } from '../settings'
import type { RecentFile, Settings } from '@shared/types'

/**
 * IPC handlers for filesystem access.
 *
 * All file I/O lives in the main process; the renderer is sandboxed and has no
 * Node.js at all. Every path that arrives here is checked for an expected
 * extension before it is touched - the renderer is not a trust boundary we
 * want to lean on, and a narrow guard costs nothing.
 */

export const FILE_CHANNELS = {
  openPdfDialog: 'file:open-pdf-dialog',
  readMarkdown: 'file:read-markdown',
  writeMarkdown: 'file:write-markdown',
  saveMarkdownDialog: 'file:save-markdown-dialog',
  getRecent: 'file:get-recent',
  addRecent: 'file:add-recent',
  clearRecent: 'file:clear-recent',
  chooseDirectory: 'file:choose-directory',
  getSettings: 'settings:get',
  updateSettings: 'settings:update'
} as const

const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown'])

function assertMarkdownPath(path: string): void {
  if (!MARKDOWN_EXTENSIONS.has(extname(path).toLowerCase())) {
    throw new Error('Only markdown files can be read or written.')
  }
}

export function registerFileHandlers(): void {
  ipcMain.handle(FILE_CHANNELS.openPdfDialog, async (event): Promise<string[]> => {
    const window = BrowserWindow.fromWebContents(event.sender)
    const options: Electron.OpenDialogOptions = {
      title: 'Import PDF',
      filters: [{ name: 'PDF documents', extensions: ['pdf'] }],
      properties: ['openFile', 'multiSelections']
    }

    // Presenting the dialog as a sheet on the owning window keeps it modal to
    // the document rather than the whole app.
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options)

    return result.canceled ? [] : result.filePaths
  })

  ipcMain.handle(FILE_CHANNELS.readMarkdown, async (_event, path: string): Promise<string> => {
    assertMarkdownPath(path)
    return readFile(path, 'utf-8')
  })

  ipcMain.handle(
    FILE_CHANNELS.writeMarkdown,
    async (_event, path: string, content: string): Promise<void> => {
      assertMarkdownPath(path)
      await writeFile(path, content, 'utf-8')
    }
  )

  ipcMain.handle(
    FILE_CHANNELS.saveMarkdownDialog,
    async (event, suggestedName: string): Promise<string | null> => {
      const window = BrowserWindow.fromWebContents(event.sender)
      const { defaultSaveDirectory } = loadSettings()
      const options: Electron.SaveDialogOptions = {
        title: 'Save markdown',
        // Honour the configured save location, falling back to the OS default
        // by passing just the file name.
        defaultPath: defaultSaveDirectory
          ? join(defaultSaveDirectory, suggestedName)
          : suggestedName,
        filters: [{ name: 'Markdown', extensions: ['md'] }]
      }

      const result = window
        ? await dialog.showSaveDialog(window, options)
        : await dialog.showSaveDialog(options)

      return result.canceled || !result.filePath ? null : result.filePath
    }
  )

  ipcMain.handle(FILE_CHANNELS.getRecent, (): RecentFile[] => loadRecentFiles())

  ipcMain.handle(
    FILE_CHANNELS.addRecent,
    (_event, path: string, kind: RecentFile['kind']): RecentFile[] =>
      addRecentFile(path, kind)
  )

  ipcMain.handle(FILE_CHANNELS.clearRecent, (): RecentFile[] => clearRecentFiles())

  ipcMain.handle(FILE_CHANNELS.chooseDirectory, async (event): Promise<string | null> => {
    const window = BrowserWindow.fromWebContents(event.sender)
    const options: Electron.OpenDialogOptions = {
      title: 'Choose a default save location',
      properties: ['openDirectory', 'createDirectory']
    }

    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options)

    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
  })

  ipcMain.handle(FILE_CHANNELS.getSettings, (): Settings => loadSettings())

  ipcMain.handle(
    FILE_CHANNELS.updateSettings,
    (_event, changes: Partial<Settings>): Settings => updateSettings(changes)
  )
}
