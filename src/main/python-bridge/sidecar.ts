import { app } from 'electron'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface, type Interface } from 'node:readline'
import { randomUUID } from 'node:crypto'
import {
  isSidecarMessage,
  type SidecarProgressMessage,
  type SidecarRequest
} from './protocol'

/**
 * Owns the Python parsing sidecar.
 *
 * The sidecar is long-lived: importing PyMuPDF and its dependencies costs far
 * more than any single parse, so we pay that once at startup rather than per
 * request. It speaks newline-delimited JSON over stdin/stdout, and every
 * response carries the id of the request that caused it.
 */

/** How a progress event is handed back to whoever made the call. */
export type ProgressListener = (progress: SidecarProgressMessage['data']) => void

interface PendingRequest {
  resolve: (data: Record<string, unknown>) => void
  reject: (error: Error) => void
  onProgress?: ProgressListener
}

/** An error carrying the parser phase it happened in, for a better UI message. */
export class SidecarError extends Error {
  constructor(
    message: string,
    public readonly phase: string
  ) {
    super(message)
    this.name = 'SidecarError'
  }
}

/**
 * Resolve the sidecar executable and its arguments.
 *
 * This is the single most common thing to break between `npm run dev` and a
 * packaged build, because the two layouts share nothing:
 *
 *   dev         a Python interpreter runs python-sidecar/main.py from source,
 *               preferring the project virtualenv so the pinned dependency
 *               versions are the ones actually exercised
 *   packaged    a PyInstaller binary sits in resources/python-dist, copied
 *               there by electron-builder's extraResources rule
 *
 * Test the packaged build early. A dev-only path bug is invisible until the
 * first time someone installs the app.
 */
export function getSidecarPath(): { command: string; args: string[]; cwd?: string } {
  if (app.isPackaged) {
    // The folder PyInstaller creates is named without the extension; only the
    // executable inside it carries one.
    const folderName = 'docflow-sidecar'
    const binaryName = process.platform === 'win32' ? `${folderName}.exe` : folderName
    const distRoot = join(process.resourcesPath, 'python-dist')

    // Both PyInstaller layouts are accepted, so switching between them is a
    // build decision rather than a code change:
    //   --onedir   python-dist/docflow-sidecar/docflow-sidecar.exe
    //   --onefile  python-dist/docflow-sidecar.exe
    const candidates = [join(distRoot, folderName, binaryName), join(distRoot, binaryName)]
    const found = candidates.find((candidate) => existsSync(candidate))

    return { command: found ?? candidates[0], args: [] }
  }

  // Development: run from source, out of the project virtualenv when present.
  const sidecarDir = join(app.getAppPath(), 'python-sidecar')
  const venvPython =
    process.platform === 'win32'
      ? join(sidecarDir, '.venv', 'Scripts', 'python.exe')
      : join(sidecarDir, '.venv', 'bin', 'python')

  const interpreter = existsSync(venvPython)
    ? venvPython
    : process.platform === 'win32'
      ? 'python'
      : 'python3'

  return {
    command: interpreter,
    args: [join(sidecarDir, 'main.py')],
    // main.py imports the `parser` package relative to its own directory.
    cwd: sidecarDir
  }
}

export class PythonSidecar {
  private process: ChildProcessWithoutNullStreams | null = null
  private reader: Interface | null = null
  private readonly pending = new Map<string, PendingRequest>()

  /** Set while we are deliberately killing the process, to suppress respawn noise. */
  private restarting = false

  /**
   * Guard against a crash loop.
   *
   * If the sidecar dies on startup - a missing interpreter, a broken
   * PyInstaller bundle - then respawning on exit means respawning instantly,
   * forever, spawning processes as fast as the OS will allow. After a few
   * rapid failures we stop trying and report the problem instead.
   */
  private consecutiveFailures = 0
  private startedAt = 0
  private giveUpReason: string | null = null

  private static readonly MAX_CONSECUTIVE_FAILURES = 3
  /** An exit sooner than this after starting counts as a failure to start. */
  private static readonly HEALTHY_UPTIME_MS = 3_000

  /**
   * Start the sidecar. Safe to call repeatedly; a running process is left alone.
   */
  start(): void {
    if (this.process) return
    if (this.giveUpReason) return

    const { command, args, cwd } = getSidecarPath()

    if (app.isPackaged && !existsSync(command)) {
      // Fail loudly here rather than letting every later parse time out.
      console.error(`[sidecar] executable missing at ${command}`)
    }

    this.startedAt = Date.now()

    const child = spawn(command, args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      // The sidecar is a console application - it has to be, the protocol is
      // stdin/stdout - so Windows would flash a console window every launch
      // without this.
      windowsHide: true,
      env: {
        ...process.env,
        // Unbuffered, so progress events arrive while a parse is running
        // instead of all at once when it finishes.
        PYTHONUNBUFFERED: '1',
        // The sidecar pins UTF-8 on its own streams too, but a legacy code
        // page inherited from the OS can still corrupt Persian before that
        // runs. Belt and braces: this machine's console reports cp1256.
        PYTHONIOENCODING: 'utf-8'
      }
    })

    this.process = child

    // stdout is the protocol channel: one JSON message per line.
    this.reader = createInterface({ input: child.stdout })
    this.reader.on('line', (line) => this.handleLine(line))

    // stderr is diagnostics only - Python tracebacks land here.
    child.stderr.on('data', (chunk: Buffer) => {
      console.error(`[sidecar] ${chunk.toString().trimEnd()}`)
    })

    child.on('error', (error) => {
      // A spawn failure (ENOENT and friends) leaves a child object whose
      // streams are already destroyed. Drop it now, or the next call writes
      // to a dead pipe.
      if (this.process === child) this.process = null
      this.failAllPending(`Could not start the PDF parser: ${error.message}`)
    })

    child.on('exit', (code, signal) => this.handleExit(code, signal))
  }

  /** Parse one line of sidecar stdout. */
  private handleLine(line: string): void {
    const trimmed = line.trim()
    if (!trimmed) return

    let parsed: unknown
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      // A dependency printing to stdout would land here. Log and move on
      // rather than killing an otherwise healthy parse.
      console.warn(`[sidecar] non-JSON output: ${trimmed.slice(0, 200)}`)
      return
    }

    if (!isSidecarMessage(parsed)) {
      console.warn('[sidecar] unrecognised message shape')
      return
    }

    // A well-formed message is proof the process is healthy, so the crash-loop
    // counter starts again from zero.
    this.consecutiveFailures = 0

    const request = this.pending.get(parsed.id)
    if (!request) {
      // Late messages from a cancelled request. Expected, not an error.
      return
    }

    switch (parsed.type) {
      case 'progress':
        request.onProgress?.(parsed.data)
        break

      case 'result':
        this.pending.delete(parsed.id)
        request.resolve(parsed.data)
        break

      case 'error':
        this.pending.delete(parsed.id)
        request.reject(new SidecarError(parsed.error.message, parsed.error.phase))
        break
    }
  }

  /**
   * Handle the process going away.
   *
   * Anything still in flight can never be answered now, so it is rejected
   * rather than left hanging - a promise that never settles would freeze the
   * import screen with no error and no way out.
   */
  private handleExit(code: number | null, signal: string | null): void {
    const uptime = Date.now() - this.startedAt

    this.process = null
    this.reader?.close()
    this.reader = null

    // A deliberate kill (cancel or shutdown) is not a failure.
    if (this.restarting) {
      this.restarting = false
      this.consecutiveFailures = 0
      this.failAllPending('The parse was cancelled.')
      this.start()
      return
    }

    console.error(`[sidecar] exited unexpectedly (code=${code} signal=${signal})`)

    // Dying almost immediately means it never got going - a missing
    // interpreter or a broken bundle. Dying after real work is a crash on some
    // particular document, and retrying is reasonable.
    if (uptime < PythonSidecar.HEALTHY_UPTIME_MS) {
      this.consecutiveFailures += 1
    } else {
      this.consecutiveFailures = 0
    }

    if (this.consecutiveFailures >= PythonSidecar.MAX_CONSECUTIVE_FAILURES) {
      this.giveUpReason =
        'The PDF parser could not be started. Check that the sidecar is installed correctly.'
      console.error(`[sidecar] giving up after ${this.consecutiveFailures} failed starts`)
      this.failAllPending(this.giveUpReason)
      return
    }

    this.failAllPending(
      'The PDF parser stopped unexpectedly. It has been restarted - please try again.'
    )

    // Come back up so the next import works without restarting the app.
    this.start()
  }

  private failAllPending(message: string): void {
    for (const [, request] of this.pending) {
      request.reject(new SidecarError(message, 'sidecar'))
    }
    this.pending.clear()
  }

  /**
   * Send a request and resolve with its result.
   *
   * `id` is accepted from the caller so that progress events and cancellation
   * can address a specific in-flight parse.
   */
  call(
    method: SidecarRequest['method'],
    params: Record<string, unknown> = {},
    options: { id?: string; onProgress?: ProgressListener } = {}
  ): Promise<Record<string, unknown>> {
    this.start()

    if (this.giveUpReason) {
      return Promise.reject(new SidecarError(this.giveUpReason, 'sidecar'))
    }

    const child = this.process
    if (!child) {
      return Promise.reject(new SidecarError('The PDF parser is not running.', 'sidecar'))
    }

    const id = options.id ?? randomUUID()

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, onProgress: options.onProgress })

      const request: SidecarRequest = { id, method, params }
      child.stdin.write(`${JSON.stringify(request)}\n`, (error) => {
        if (error) {
          this.pending.delete(id)
          reject(new SidecarError(`Could not reach the PDF parser: ${error.message}`, 'sidecar'))
        }
      })
    })
  }

  /**
   * Abandon an in-flight request.
   *
   * The sidecar handles one request synchronously, so there is no point at
   * which it could read a "stop" message mid-parse. Killing and respawning is
   * the honest implementation; `handleExit` rejects the pending promise and
   * brings the process straight back up.
   */
  cancel(id: string): void {
    if (!this.pending.has(id)) return

    this.restarting = true
    this.process?.kill()
  }

  /** Shut down for good. Called when the app quits. */
  dispose(): void {
    this.failAllPending('The application is closing.')
    this.restarting = true
    this.process?.kill()
    this.process = null
  }
}

/** One sidecar per application run. */
export const sidecar = new PythonSidecar()
