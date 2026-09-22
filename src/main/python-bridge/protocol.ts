/**
 * Wire format for the Python sidecar.
 *
 * One JSON object per line in each direction. These types mirror the shapes
 * produced by python-sidecar/main.py exactly; if one side changes, both must.
 *
 * Note the casing split: request params and result payloads use camelCase
 * because the Python side already speaks the renderer's dialect, but the
 * envelope fields (`id`, `type`, `error.phase`) are snake-free by convention on
 * both sides.
 */

/** Sent from the main process to the sidecar's stdin. */
export interface SidecarRequest {
  id: string
  method: 'parse_pdf' | 'ping' | 'ocr_info'
  params: Record<string, unknown>
}

/** Intermediate status update. Several of these arrive per request. */
export interface SidecarProgressMessage {
  id: string
  type: 'progress'
  data: {
    phase: string
    message: string
    percent: number
    has_rtl_content: boolean
    current?: number
    total?: number
  }
}

/** Terminal success. Exactly one per request. */
export interface SidecarResultMessage {
  id: string
  type: 'result'
  data: Record<string, unknown>
}

/** Terminal failure. Exactly one per request. */
export interface SidecarErrorMessage {
  id: string
  type: 'error'
  error: {
    message: string
    phase: string
  }
}

export type SidecarMessage =
  | SidecarProgressMessage
  | SidecarResultMessage
  | SidecarErrorMessage

/**
 * Narrow an arbitrary parsed JSON value to a SidecarMessage.
 *
 * The sidecar is our own code, but it is still a separate process whose stdout
 * could carry a stray print from a dependency. Anything that does not look
 * like a message is discarded rather than trusted.
 */
export function isSidecarMessage(value: unknown): value is SidecarMessage {
  if (typeof value !== 'object' || value === null) return false

  const candidate = value as Partial<SidecarMessage>
  if (typeof candidate.id !== 'string') return false

  return (
    candidate.type === 'progress' ||
    candidate.type === 'result' ||
    candidate.type === 'error'
  )
}
