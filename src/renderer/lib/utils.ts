import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merge Tailwind class names, with later classes winning conflicts.
 *
 * `clsx` handles the conditional syntax; `twMerge` resolves collisions, so
 * `cn('p-2', 'p-4')` yields `p-4` rather than leaving both in the class list
 * and relying on stylesheet order. Standard shadcn/ui helper.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
