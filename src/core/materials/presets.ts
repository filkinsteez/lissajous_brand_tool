import type { MaterialState } from '@/core/state/types'
import { INK, PAPER } from '@/core/state/defaults'

export type MaterialPreset = {
  id: string
  label: string
  values: Omit<MaterialState, 'enabled' | 'preset'>
}

// Three curated monochrome presets — the quality bar is judged against
// these, not against slider extremes.
export const MATERIAL_PRESETS: MaterialPreset[] = [
  {
    id: 'grain-01',
    label: 'FIELD GRAIN',
    values: {
      pressure: 0.7, density: 0.5, grainSize: 0.35, drift: 0.25,
      fold: 0.25, ring: 0.35, contrast: 0.6, voidStrength: 0.55,
      motion: 0, ink: INK, paper: PAPER,
    },
  },
  {
    id: 'grain-02',
    label: 'INK RINGS',
    values: {
      pressure: 0.75, density: 0.42, grainSize: 0.22, drift: 0.15,
      fold: 0.1, ring: 0.85, contrast: 0.8, voidStrength: 0.4,
      motion: 0, ink: INK, paper: PAPER,
    },
  },
  {
    id: 'grain-03',
    label: 'DUST',
    values: {
      pressure: 0.6, density: 0.3, grainSize: 0.5, drift: 0.45,
      fold: 0.35, ring: 0.12, contrast: 0.45, voidStrength: 0.75,
      motion: 0, ink: INK, paper: PAPER,
    },
  },
]
