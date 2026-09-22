import { useEffect, useState } from 'react'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'
import { useStore } from '@renderer/state/store'
import type { OcrInfo, Settings, ThemePreference } from '@shared/types'

/**
 * Settings, shown as a modal over the workspace.
 *
 * Changes save immediately rather than behind an OK button. There is nothing
 * here that needs staging, and a preferences dialog that silently discards
 * what you typed because you closed it is a small betrayal.
 */
export function SettingsScreen(): React.JSX.Element {
  const settings = useStore((state) => state.settings)
  const setSettings = useStore((state) => state.setSettings)
  const setSettingsOpen = useStore((state) => state.setSettingsOpen)

  const [ocr, setOcr] = useState<OcrInfo | null>(null)

  useEffect(() => {
    // Ask the sidecar what Tesseract can actually do on this machine, so the
    // language choices are real rather than a hardcoded list.
    void window.api
      .getOcrInfo(settings?.tesseractPath ?? undefined)
      .then(setOcr)
      .catch(() => setOcr({ available: false, languages: [], reason: 'Could not reach the parser.' }))
  }, [settings?.tesseractPath])

  if (!settings) return <></>

  const update = (changes: Partial<Settings>): void => {
    void window.api.updateSettings(changes).then(setSettings)
  }

  return (
    <div
      className="bg-background/80 fixed inset-0 z-40 flex items-start justify-center overflow-y-auto p-8 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) setSettingsOpen(false)
      }}
    >
      <div
        role="dialog"
        aria-label="Settings"
        className="bg-surface border-border w-full max-w-lg rounded-lg border shadow-lg"
      >
        <header className="border-border flex items-center justify-between border-b py-3 ps-5 pe-3">
          <h2 className="text-foreground text-base font-medium">Settings</h2>
          <Button variant="ghost" size="sm" onClick={() => setSettingsOpen(false)}>
            Done
          </Button>
        </header>

        <div className="px-5 py-4">
          <Field
            label="Theme"
            hint="System follows your operating system's light or dark setting."
          >
            <SegmentedControl<ThemePreference>
              value={settings.theme}
              options={[
                { value: 'system', label: 'System' },
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' }
              ]}
              onChange={(theme) => update({ theme })}
            />
          </Field>

          <Field label="Editor font size" hint={`${settings.editorFontSize}px`}>
            <input
              type="range"
              min={12}
              max={28}
              step={1}
              value={settings.editorFontSize}
              aria-label="Editor font size"
              onChange={(event) => update({ editorFontSize: Number(event.target.value) })}
              className="w-56"
            />
          </Field>

          <Field
            label="OCR languages"
            hint={
              ocr?.available
                ? 'Used for scanned PDFs. Persian-only documents are more accurate with Persian alone — with English also loaded, Tesseract sometimes reads Persian words as Latin.'
                : (ocr?.reason ?? 'Checking for Tesseract…')
            }
          >
            {ocr?.available ? (
              <SegmentedControl<string>
                value={settings.ocrLanguages}
                options={[
                  { value: 'fas+eng', label: 'Persian + English' },
                  { value: 'fas', label: 'Persian only' },
                  { value: 'eng', label: 'English only' }
                ].filter((option) =>
                  // Only offer combinations this install can actually load.
                  option.value.split('+').every((code) => ocr.languages.includes(code))
                )}
                onChange={(ocrLanguages) => update({ ocrLanguages })}
              />
            ) : (
              <p className="text-destructive text-sm">OCR is unavailable.</p>
            )}
          </Field>

          <Field
            label="Tesseract location"
            hint={
              ocr?.available && ocr.path
                ? `Found at ${ocr.path}`
                : 'Set this if Tesseract is installed somewhere unusual.'
            }
          >
            <div className="flex w-full gap-2">
              <input
                type="text"
                value={settings.tesseractPath ?? ''}
                placeholder="Auto-detect"
                aria-label="Tesseract binary path"
                onChange={(event) =>
                  update({ tesseractPath: event.target.value.trim() || null })
                }
                className={cn(
                  'bg-background border-border text-foreground placeholder:text-muted-foreground',
                  'focus-visible:ring-ring min-w-0 flex-1 rounded-md border px-2.5 py-1.5',
                  'font-mono text-xs focus-visible:ring-2 focus-visible:outline-none'
                )}
              />
              {settings.tesseractPath && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => update({ tesseractPath: null })}
                >
                  Reset
                </Button>
              )}
            </div>
          </Field>

          <Field
            label="Default save location"
            hint={settings.defaultSaveDirectory ?? 'The save dialog opens wherever your system last was.'}
          >
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  void window.api.chooseDirectory().then((directory) => {
                    if (directory) update({ defaultSaveDirectory: directory })
                  })
                }}
              >
                {'Choose…'}
              </Button>
              {settings.defaultSaveDirectory && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => update({ defaultSaveDirectory: null })}
                >
                  Clear
                </Button>
              )}
            </div>
          </Field>
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  hint,
  children
}: {
  label: string
  hint?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="border-border border-b py-4 first:pt-0 last:border-b-0 last:pb-0">
      <div className="mb-2 flex items-baseline justify-between gap-4">
        <span className="text-foreground text-sm font-medium">{label}</span>
      </div>
      {children}
      {hint && <p className="text-muted-foreground mt-2 text-xs">{hint}</p>}
    </div>
  )
}

function SegmentedControl<T extends string>({
  value,
  options,
  onChange
}: {
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (value: T) => void
}): React.JSX.Element {
  return (
    <div role="group" className="border-border inline-flex rounded-md border p-0.5">
      {options.map((option) => (
        <Button
          key={option.value}
          variant="ghost"
          size="sm"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'h-7 text-xs',
            value === option.value && 'bg-accent text-accent-foreground'
          )}
        >
          {option.label}
        </Button>
      ))}
    </div>
  )
}
