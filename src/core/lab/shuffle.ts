import { mulberry32, rngPick, rngRange } from '@/core/math/random'
import type { LabPatch } from './labStore'
import { PALETTES } from './colorField'
import type { FieldSourceState, LabState, TreatmentId } from './types'

// The shuffle controller: one click = one new variant = ONE undo entry,
// so Back walks the options you've seen. Scopes decide what varies —
// lock the parts you like, shuffle the rest. Ranges are curated, not
// full-range (the editor's shuffle lesson: extremes are mud), and the
// painted mask is authored state — a shuffle never touches it.

export type ShuffleScopes = {
  seed: boolean
  fields: boolean
  bands: boolean
  marks: boolean
  colors: boolean
}

export const DEFAULT_SCOPES: ShuffleScopes = {
  seed: true,
  fields: true,
  bands: true,
  marks: true,
  colors: false, // colors change the read the most — opt in
}

export function shuffleLab(lab: LabState, shuffleSeed: number, scopes: ShuffleScopes): LabPatch {
  const rng = mulberry32(shuffleSeed >>> 0)
  const patch: LabPatch = {}

  if (scopes.seed) patch.seed = Math.floor(rng() * 100000)

  if (scopes.fields) {
    patch.territory = {
      ...patch.territory,
      sources: lab.territory.sources.map((s) => shuffleSource(s, rng)),
    }
    patch.flow = {
      basis: rngPick(rng, ['curve', 'curve', 'noise', 'contour'] as const),
      angle: rng() * Math.PI * 2,
      curl: rngRange(rng, 0, 0.7),
      scale: rngRange(rng, 0.15, 0.8),
      warp: rngRange(rng, 0.2, 0.9),
    }
  }

  if (scopes.bands) {
    const hasSource = !!lab.source
    const count = 3 + (rng() < 0.4 ? 1 : 0)
    const near = rngPick(
      rng,
      hasSource
        ? (['photo', 'photo', 'mosaic', 'flat'] as TreatmentId[])
        : (['flat', 'marks', 'contours', 'dabs'] as TreatmentId[]),
    )
    const far = rngPick(rng, ['empty', 'empty', 'marks', 'scan', 'streams'] as TreatmentId[])
    const middlePool = hasSource
      ? (['marks', 'marks', 'contours', 'mosaic', 'scan', 'dabs', 'streams', 'empty'] as TreatmentId[])
      : (['marks', 'marks', 'contours', 'scan', 'dabs', 'streams', 'empty'] as TreatmentId[])
    const bands: TreatmentId[] = [far]
    for (let i = 1; i < count - 1; i++) bands.push(rngPick(rng, middlePool))
    bands.push(near)
    patch.territory = {
      ...patch.territory,
      bands,
      boundary: rngPick(rng, ['hard', 'hard', 'dither', 'porous'] as const),
    }
    patch.structure = {
      baseCell: Math.round(rngRange(rng, 16, 44)),
      subdivide: rngRange(rng, 0.3, 0.9),
      maxLevels: rngPick(rng, [1, 2, 2] as const),
    }
  }

  if (scopes.marks) {
    patch.mark = {
      bank: rngPick(rng, ['dots', 'geo', 'brand', 'brand'] as const),
      evidenceMix: rngRange(rng, 0.1, 0.7),
      occupancy: rngRange(rng, 0.55, 1),
      minScale: rngRange(rng, 0.15, 0.4),
      maxScale: rngRange(rng, 0.7, 1.3),
      rotationInfluence: rngRange(rng, 0.2, 1),
      flow: lab.territory.sources.some((s) => s.kind === 'curve' && s.enabled)
        ? rngRange(rng, 0, 1)
        : 0,
      coherenceScale: rngRange(rng, 0.2, 0.8),
      colorMode: rngPick(rng, ['ink', 'ink', 'tint', 'source'] as const),
      echo: rngPick(rng, [0, 0, 0, 2, 3, 4] as const),
    }
  }

  if (scopes.colors) {
    // deal a curated palette; sometimes rotate its order so the
    // territory affinity lands on different colors, sometimes retint
    // the ink for accent
    const p = rngPick(rng, PALETTES)
    let palette = [...p.colors]
    if (rng() < 0.4) {
      const shift = 1 + Math.floor(rng() * (palette.length - 1))
      palette = [...palette.slice(shift), ...palette.slice(0, shift)]
    }
    patch.colors = { palette, ink: p.ink, paper: p.ground }
    patch.finish = { grain: rngPick(rng, [0, 0.1, 0.15, 0.25]) }
  }

  return patch
}

// authored things survive: kind, order, enabled, invert, combine, and
// the painted mask entirely — a shuffle re-poses the fields it was
// given, it does not redesign the stack
function shuffleSource(s: FieldSourceState, rng: () => number): FieldSourceState {
  switch (s.kind) {
    case 'curve':
      return { ...s, weight: rngRange(rng, 0.5, 1), softness: rngRange(rng, 0.18, 0.55) }
    case 'linear':
      return {
        ...s,
        weight: rngRange(rng, 0.3, 0.9),
        angle: rng() * Math.PI * 2,
        offset: rngRange(rng, 0.3, 0.7),
        softness: rngRange(rng, 0.15, 0.6),
      }
    case 'radial':
      return {
        ...s,
        weight: rngRange(rng, 0.3, 0.9),
        centerX: rngRange(rng, 0.25, 0.75),
        centerY: rngRange(rng, 0.25, 0.75),
        radius: rngRange(rng, 0.2, 0.5),
        softness: rngRange(rng, 0.2, 0.7),
      }
    case 'tone':
    case 'detail':
      return { ...s, weight: rngRange(rng, 0.2, 0.7) }
    case 'paint':
      return s
  }
}

// minted per click, stored nowhere — the RESULTING state is what
// reproduces, same as every generate-once decision in the editor
let shuffleCounter = 0

export function mintShuffleSeed(): number {
  return (Date.now() ^ (shuffleCounter++ * 0x9e3779b9)) >>> 0
}
