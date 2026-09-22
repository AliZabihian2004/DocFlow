/**
 * Types shared across all three processes (main, preload, renderer).
 *
 * This file is the contract. If a shape crosses a process boundary it belongs
 * here, so that the main process and the React app can never drift apart on
 * what a message looks like.
 */

/** Read-only facts about the host, resolved once at startup. */
export interface HostInfo {
  platform: NodeJS.Platform
  appVersion: string
  electronVersion: string
}

/**
 * The complete surface the renderer can reach, exposed on `window.api` by the
 * preload script. Nothing else in Electron or Node is reachable from React.
 */
export interface DocflowApi {
  getHostInfo: () => Promise<HostInfo>
}
