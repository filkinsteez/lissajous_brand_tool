import { mulberry32, rngPick, rngRange } from '@/core/math/random'
import { INK, PAPER } from '@/core/state/defaults'
import type { LabPatch } from './labStore'
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
    if (rng() < 0.25) {
      patch.colors = { ink: INK, paper: PAPER }
    } else {
      const hue = rng() * 360
      if (rng() < 0.2) {
        // inverted ground: light shapes on a deep field
        patch.colors = {
          ink: hslToHex(hue, rngRange(rng, 0.25, 0.6), rngRange(rng, 0.82, 0.94)),
          paper: hslToHex(hue + rngRange(rng, -30, 30), rngRange(rng, 0.2, 0.5), rngRange(rng, 0.1, 0.18)),
        }
      } else {
        patch.colors = {
          ink: hslToHex(hue, rngRange(rng, 0.5, 0.9), rngRange(rng, 0.22, 0.42)),
          paper: hslToHex(
            rng() < 0.5 ? hue : hue + 180,
            rngRange(rng, 0.04, 0.14),
            rngRange(rng, 0.9, 0.96),
          ),
        }
      }
    }
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

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const hp = (((h % 360) + 360) % 360) / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  const m = l - c / 2
  const [r, g, b] =
    hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x]
  const to = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`
}

// minted per click, stored nowhere — the RESULTING state is what
// reproduces, same as every generate-once decision in the editor
let shuffleCounter = 0

export function mintShuffleSeed(): number {
  return (Date.now() ^ (shuffleCounter++ * 0x9e3779b9)) >>> 0
}
