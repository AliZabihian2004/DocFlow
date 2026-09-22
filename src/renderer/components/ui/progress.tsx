import * as ProgressPrimitive from '@radix-ui/react-progress'
import { cn } from '@renderer/lib/utils'

/**
 * Determinate progress bar, in the shadcn/ui style.
 *
 * Radix supplies the ARIA roles and value attributes, so a screen reader
 * announces real percentages - which only works because the sidecar sends real
 * progress rather than leaving us to fake a spinner.
 *
 * The fill is sized rather than translated. A normal-flow block starts at its
 * container's inline-start edge, so a width-based fill grows left-to-right in
 * LTR and right-to-left in RTL on its own. The transform approach Radix's
 * example uses is hardcoded to one direction.
 */
export function Progress({
  value,
  className
}: {
  value: number
  className?: string
}): React.JSX.Element {
  const clamped = Math.max(0, Math.min(100, value))

  return (
    <ProgressPrimitive.Root
      value={clamped}
      className={cn('bg-muted relative h-2 w-full overflow-hidden rounded-full', className)}
    >
      <ProgressPrimitive.Indicator
        className="bg-primary h-full transition-[width] duration-300 ease-out"
        style={{ width: `${clamped}%` }}
      />
    </ProgressPrimitive.Root>
  )
}
