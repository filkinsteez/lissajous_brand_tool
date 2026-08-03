import type { FontFamilyId, TypeBlockState } from '@/core/state/types'

// Optimistic is THE typeface — one family, no picker. It is a variable
// font with wght 300..800, wdth 80..100, ital 0..1 and DRKM 0..1 (a
// dark-mode optical compensation). There is no optical-size axis, so
// nothing here emits 'opsz'.
export const FONT_STACKS: Record<FontFamilyId, string> = {
  optimistic: 'var(--font-optimistic), sans-serif',
}

export const FONT_LABELS: Record<FontFamilyId, string> = {
  optimistic: 'Optimistic',
}

export const WEIGHT_RANGE = { min: 300, max: 800 } as const
export const WIDTH_RANGE = { min: 80, max: 100 } as const

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)

// Values are clamped to the axes the font actually has — asking for
// wght 1000 on a 300..800 font silently pins to 800 and makes the
// slider lie about what it is doing.
export function variationSettings(block: TypeBlockState): string {
  const wght = Math.round(clamp(block.weight, WEIGHT_RANGE.min, WEIGHT_RANGE.max))
  const wdth = Math.round(clamp(block.width, WIDTH_RANGE.min, WIDTH_RANGE.max))
  return `'wght' ${wght}, 'wdth' ${wdth}`
}

// Static-weight fallback while the variable face loads.
export function nearestStaticWeight(weight: number): number {
  return Math.max(300, Math.min(800, Math.round(weight / 100) * 100))
}
