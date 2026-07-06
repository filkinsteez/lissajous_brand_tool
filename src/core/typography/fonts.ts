import type { FontFamilyId, TypeBlockState } from '@/core/state/types'

export const FONT_STACKS: Record<FontFamilyId, string> = {
  flex: 'var(--font-flex), sans-serif',
  fraunces: 'var(--font-fraunces), serif',
  mono: 'var(--font-mono), monospace',
}

export const FONT_LABELS: Record<FontFamilyId, string> = {
  flex: 'FLEX',
  fraunces: 'FRAUNCES',
  mono: 'MONO',
}

// Unsupported axes are ignored by the browser, so one settings string
// serves all three families (Fraunces has no wdth, Plex Mono is static).
export function variationSettings(block: TypeBlockState): string {
  return `'wght' ${Math.round(block.weight)}, 'wdth' ${Math.round(block.width)}, 'opsz' ${Math.round(block.opticalSize)}`
}

// Static-weight fallback for non-variable families.
export function nearestStaticWeight(weight: number): number {
  return Math.max(100, Math.min(900, Math.round(weight / 100) * 100))
}

export function applyCase(text: string, textCase: TypeBlockState['textCase']): string {
  if (textCase === 'upper') return text.toUpperCase()
  if (textCase === 'lower') return text.toLowerCase()
  return text
}
