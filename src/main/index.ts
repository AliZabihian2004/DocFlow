import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { loadWindowState, trackWindowState } from './window-state'
import { registerIpcHandlers } from './ipc'
import { sidecar } from './python-bridge/sidecar'

/**
 * Main process entry point.
 *
 * Responsibilities that live here (and nowhere else):
 *   - owning the application window lifecycle
 *   - all filesystem access
 *   - the Python sidecar's lifecycle
 *
 * The renderer is fully sandboxed and reaches any of this only through the
 * narrow API surface defined in src/preload/index.ts.
 */

/** electron-vite sets this in dev so we can load from the Vite dev server. */
const rendererDevServerUrl = process.env['ELECTRON_RENDERER_URL']
const isDev = !app.isPackaged

function createWindow(): BrowserWindow {
  const state = loadWindowState()

  const window = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 900,
    minHeight: 600,
    // Don't flash an empty white frame before React has painted.
    show: false,
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // These three are the security baseline: the renderer gets no Node.js
      // globals, no direct access to Electron internals, and runs in its own
      // isolated context. Do not relax them.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  trackWindowState(window)

  if (state.isMaximized) window.maximize()

  window.once('ready-to-show', () => window.show())

  // External links open in the user's real browser, never inside the app shell.
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev && rendererDevServerUrl) {
    void window.loadURL(rendererDevServerUrl)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return window
}

// Docflow is a single-window app; a second launch should focus the existing
// window rather than starting a competing instance (and a competing sidecar).
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const [existing] = BrowserWindow.getAllWindows()
    if (existing) {
      if (existing.isMinimized()) existing.restore()
      existing.focus()
    }
  })

  void app.whenReady().then(() => {
    registerIpcHandlers()

    // Start the parser up front. Loading PyMuPDF takes a second or two, and
    // paying that at launch means the first import feels instant.
    sidecar.start()

    createWindow()

    // macOS convention: clicking the dock icon with no windows open reopens one.
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  // Kill the sidecar before we go, or it outlives the app as an orphan.
  app.on('will-quit', () => {
    sidecar.dispose()
  })

  app.on('window-all-closed', () => {
    // macOS apps normally stay running with no windows; every other platform quits.
    if (process.platform !== 'darwin') app.quit()
  })
}
