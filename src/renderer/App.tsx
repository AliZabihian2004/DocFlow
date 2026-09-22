import { useEffect, useState } from 'react'
import type { HostInfo } from '@shared/types'

/**
 * Placeholder shell for the scaffold.
 *
 * Its only job right now is to prove the renderer -> preload -> main round trip
 * works: if the version line below renders, contextBridge is wired correctly.
 * This gets replaced by the real screens in a later phase.
 */
export default function App(): React.JSX.Element {
  const [host, setHost] = useState<HostInfo | null>(null)

  useEffect(() => {
    void window.api.getHostInfo().then(setHost)
  }, [])

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-background text-foreground">
      <h1 className="text-3xl font-semibold tracking-tight">Docflow</h1>
      <p className="text-muted-foreground text-sm">
        PDF to markdown, offline. Persian and RTL supported.
      </p>
      <p className="text-muted-foreground font-mono text-xs">
        {host ? `v${host.appVersion} · Electron ${host.electronVersion} · ${host.platform}` : 'connecting to main process…'}
      </p>
    </div>
  )
}
