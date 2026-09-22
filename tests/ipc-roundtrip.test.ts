import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ParsePdfRequest, ParseProgress, ParseResult } from '../src/shared/types'

/**
 * Integration test for the full parse round trip:
 *
 *   renderer -> preload channel -> main IPC handler -> sidecar protocol
 *            -> sidecar response -> mapped result -> back to the renderer
 *
 * The Python process is mocked, so what is actually under test is our own
 * plumbing: that the request reaches stdin as well-formed JSON, that progress
 * events are translated from the sidecar's snake_case into the camelCase the
 * React side is typed against, and that a result is matched to the promise
 * waiting on it by request id.
 *
 * Everything except the child process is real code.
 */

// --- Test doubles ----------------------------------------------------------

/** Stands in for the spawned Python process. */
class FakeSidecarProcess extends EventEmitter {
  stdout = new PassThrough()
  stderr = new PassThrough()
  /** Every line written to the sidecar's stdin, already parsed. */
  written: Array<Record<string, unknown>> = []
  killed = false

  stdin = {
    write: (chunk: string, callback?: (error?: Error | null) => void) => {
      this.written.push(JSON.parse(chunk))
      callback?.(null)
      return true
    }
  }

  kill = (): boolean => {
    this.killed = true
    this.emit('exit', null, 'SIGTERM')
    return true
  }

  /** Push one protocol message down stdout, as the real sidecar would. */
  send(message: unknown): void {
    this.stdout.write(`${JSON.stringify(message)}\n`)
  }
}

let fakeProcess: FakeSidecarProcess

vi.mock('node:child_process', () => ({
  spawn: () => fakeProcess
}))

/** Captures the handlers the app registers, so we can invoke them directly. */
const handlers = new Map<string, (...args: unknown[]) => unknown>()

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => 'E:/DocFlow',
    getVersion: () => '0.1.0'
  },
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler)
    }
  },
  BrowserWindow: { fromWebContents: () => null },
  dialog: {}
}))

/** Stands in for the renderer's webContents; collects pushed progress events. */
function makeSender(): { sender: { isDestroyed: () => boolean; send: (channel: string, payload: ParseProgress) => void }; progress: ParseProgress[] } {
  const progress: ParseProgress[] = []
  return {
    progress,
    sender: {
      isDestroyed: () => false,
      send: (_channel, payload) => {
        progress.push(payload)
      }
    }
  }
}

/** Waits for the mocked stdout line to be read and dispatched. */
const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve))

// --- Tests -----------------------------------------------------------------

describe('PDF parse IPC round trip', () => {
  beforeEach(async () => {
    fakeProcess = new FakeSidecarProcess()
    handlers.clear()
    vi.resetModules()

    const { registerPdfHandlers } = await import('../src/main/ipc/pdf-handlers')
    registerPdfHandlers()
  })

  const request: ParsePdfRequest = {
    requestId: 'req-1',
    path: 'C:/docs/persian.pdf'
  }

  it('sends a well-formed request to the sidecar and resolves with the result', async () => {
    const { sender } = makeSender()
    const handler = handlers.get('pdf:parse')!

    const pending = handler({ sender }, request) as Promise<ParseResult>
    await flush()

    // What actually reached the sidecar's stdin.
    expect(fakeProcess.written).toHaveLength(1)
    expect(fakeProcess.written[0]).toMatchObject({
      id: 'req-1',
      method: 'parse_pdf',
      params: { path: 'C:/docs/persian.pdf' }
    })

    fakeProcess.send({
      id: 'req-1',
      type: 'result',
      data: {
        markdown: '# \u06af\u0632\u0627\u0631\u0634 \u0641\u0646\u06cc',
        pageCount: 3,
        hasRtl: true,
        pathUsed: 'text',
        wordsReversed: 2
      }
    })

    await expect(pending).resolves.toEqual({
      markdown: '# \u06af\u0632\u0627\u0631\u0634 \u0641\u0646\u06cc',
      pageCount: 3,
      hasRtl: true,
      pathUsed: 'text',
      wordsReversed: 2
    })
  })

  it('translates progress events into the renderer-facing shape', async () => {
    const { sender, progress } = makeSender()
    const handler = handlers.get('pdf:parse')!

    const pending = handler({ sender }, request) as Promise<ParseResult>
    await flush()

    fakeProcess.send({
      id: 'req-1',
      type: 'progress',
      data: {
        phase: 'reading',
        message: 'Reading page 2 of 3',
        percent: 55.5,
        has_rtl_content: true,
        current: 2,
        total: 3
      }
    })
    await flush()

    expect(progress).toEqual([
      {
        requestId: 'req-1',
        phase: 'reading',
        message: 'Reading page 2 of 3',
        percent: 55.5,
        // The snake_case flag from Python must arrive camelCased.
        hasRtlContent: true,
        current: 2,
        total: 3
      }
    ])

    fakeProcess.send({ id: 'req-1', type: 'result', data: { markdown: '', pageCount: 3 } })
    await pending
  })

  it('rejects with the sidecar phase when parsing fails', async () => {
    const { sender } = makeSender()
    const handler = handlers.get('pdf:parse')!

    const pending = handler({ sender }, request) as Promise<ParseResult>
    await flush()

    fakeProcess.send({
      id: 'req-1',
      type: 'error',
      error: { message: 'This file is not a readable PDF', phase: 'opening' }
    })

    await expect(pending).rejects.toMatchObject({
      message: 'This file is not a readable PDF',
      phase: 'opening'
    })
  })

  it('rejects non-PDF files before troubling the sidecar', async () => {
    const { sender } = makeSender()
    const handler = handlers.get('pdf:parse')!

    await expect(
      handler({ sender }, { ...request, path: 'C:/docs/notes.txt' })
    ).rejects.toThrow(/Only PDF files/)

    expect(fakeProcess.written).toHaveLength(0)
  })

  it('ignores responses whose id matches nothing in flight', async () => {
    const { sender } = makeSender()
    const handler = handlers.get('pdf:parse')!

    const pending = handler({ sender }, request) as Promise<ParseResult>
    await flush()

    // A late message from a cancelled parse must not settle the live one.
    fakeProcess.send({ id: 'some-old-request', type: 'result', data: { markdown: 'stale' } })
    await flush()

    fakeProcess.send({ id: 'req-1', type: 'result', data: { markdown: 'correct' } })

    await expect(pending).resolves.toMatchObject({ markdown: 'correct' })
  })

  it('survives non-JSON noise on stdout', async () => {
    const { sender } = makeSender()
    const handler = handlers.get('pdf:parse')!

    const pending = handler({ sender }, request) as Promise<ParseResult>
    await flush()

    // A dependency printing a warning must not break the protocol.
    fakeProcess.stdout.write('UserWarning: something from a library\n')
    await flush()

    fakeProcess.send({ id: 'req-1', type: 'result', data: { markdown: 'fine' } })

    await expect(pending).resolves.toMatchObject({ markdown: 'fine' })
  })

  it('rejects everything in flight when the sidecar dies', async () => {
    const { sender } = makeSender()
    const handler = handlers.get('pdf:parse')!

    const pending = handler({ sender }, request) as Promise<ParseResult>
    await flush()

    // A crash must not leave the import screen waiting on a promise that can
    // never settle.
    fakeProcess.emit('exit', 1, null)

    await expect(pending).rejects.toThrow(/stopped unexpectedly/)
  })

  it('stops respawning after repeated immediate failures', async () => {
    const { sender } = makeSender()
    const handler = handlers.get('pdf:parse')!

    // A sidecar that dies the instant it starts - a missing interpreter, or a
    // broken PyInstaller bundle. Without a guard, every exit triggers another
    // spawn and the app burns a core respawning forever.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const pending = handler({ sender }, request) as Promise<ParseResult>
      // Attach the expectation before triggering the failure, so the
      // rejection is never momentarily unhandled.
      const settled = expect(pending).rejects.toThrow()
      await flush()
      fakeProcess.emit('exit', 1, null)
      await settled
    }

    await expect(() => handler({ sender }, request) as Promise<ParseResult>).rejects.toThrow(
      /could not be started/i
    )
  })

  it('cancelling rejects the pending parse', async () => {
    const { sender } = makeSender()
    const parse = handlers.get('pdf:parse')!
    const cancel = handlers.get('pdf:cancel')!

    const pending = parse({ sender }, request) as Promise<ParseResult>
    await flush()

    cancel({ sender }, 'req-1')

    await expect(pending).rejects.toThrow(/cancelled/)
    expect(fakeProcess.killed).toBe(true)
  })
})
