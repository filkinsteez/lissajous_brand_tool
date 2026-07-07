import type { LissajousState } from '@/core/state/types'

export type RatioPreset = {
  id: string
  label: string
  frequencyX: number
  frequencyY: number
  phase: number
}

// Visible ratio presets per PRD §4 (Jasso reference): exact, instrument-like.
export const RATIO_PRESETS: RatioPreset[] = [
  { id: '1:2', label: '1:2', frequencyX: 1, frequencyY: 2, phase: Math.PI / 2 },
  { id: '3:2', label: '3:2', frequencyX: 3, frequencyY: 2, phase: Math.PI / 2 },
  { id: '4:3', label: '4:3', frequencyX: 4, frequencyY: 3, phase: Math.PI / 2 },
  { id: '5:4', label: '5:4', frequencyX: 5, frequencyY: 4, phase: Math.PI / 2 },
  { id: '8:5', label: '8:5', frequencyX: 8, frequencyY: 5, phase: Math.PI / 2 },
  { id: '7:5', label: '7:5', frequencyX: 7, frequencyY: 5, phase: Math.PI / 2 },
]

export function applyRatioPreset(preset: RatioPreset): Partial<LissajousState> {
  return {
    frequencyX: preset.frequencyX,
    frequencyY: preset.frequencyY,
    phase: preset.phase,
    presetId: preset.id,
  }
}
