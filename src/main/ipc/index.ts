import { app, ipcMain } from 'electron'
import type { HostInfo } from '@shared/types'

/**
 * Registers every IPC handler the app exposes.
 *
 * Called once, after `app.whenReady()`. Handlers are grouped by domain into
 * sibling modules (pdf-handlers, file-handlers) and wired up from here, so
 * there is exactly one place to look for the full list of IPC channels.
 */
export function registerIpcHandlers(): void {
  ipcMain.handle(
    'host:get-info',
    (): HostInfo => ({
      platform: process.platform,
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron
    })
  )
}
