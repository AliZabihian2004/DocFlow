import { contextBridge, ipcRenderer } from 'electron'
import type { DocflowApi } from '@shared/types'

/**
 * The bridge between the sandboxed renderer and the main process.
 *
 * Everything the React app can do to the outside world passes through this
 * object. We deliberately expose hand-written methods rather than a generic
 * `invoke(channel, ...args)` passthrough: a generic escape hatch would let any
 * compromised renderer code reach every IPC handler in the app.
 */
const api: DocflowApi = {
  getHostInfo: () => ipcRenderer.invoke('host:get-info')
}

contextBridge.exposeInMainWorld('api', api)
