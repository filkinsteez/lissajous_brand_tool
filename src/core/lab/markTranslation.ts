import { chan } from '@/core/organic/random'
import type { AnalysisMaps } from './analysis'
import { sampleMap } from './analysis'
import type { FitRect } from './field'
import { coherenceField } from './field'
import type { MarkTranslationParams } from './types'

// Study 1 build: uniform cell grid -> per-cell evidence -> mark
// placement. Pure and deterministic: the same maps, params, and seed
// produce byte-identical stamps. Every random decision reads
// chan(seed, cellId, channel) so the channels stay independent — the
// color mode can change without a single mark moving.
//
// Division of labor between the two evidence kinds (a deliberate call,
// to be judged in FINDINGS): TONE is coverage — it drives presence
// weight and mark size, the halftone contract. STRUCTURE (edges +
// detail) drives WHICH mark is chosen and how it rotates. EVIDENCE MIX
// slides selection between the two.

export type MarkStamp = {
  x: number // output px, cell center
  y: number
  size: number // diameter in output px
  rot: number // radians
  protoIndex: number
  tone: number // 0..1 darkness, for paint-time color/tint decisions
  // analysis-space coords for paint-time color sampling
  mx: number
  my: number
}

export const MARK_DEFAULTS: MarkTranslationParams = {
  cellSize: 26,
  bank: 'brand',
  evidenceMix: 0.35,
  occupancy: 0.85,
  minScale: 0.25,
  maxScale: 0.95,
  rotationInfluence: 0.6,
  coherenceScale: 0.45,
  sourceVisibility: 0,
  colorMode: 'ink',
}

export function buildMarkStamps(opts: {
  params: MarkTranslationParams
  maps: AnalysisMaps
  rect: FitRect
  outW: number
  outH: number
  seed: number
  bankSize: number
}): MarkStamp[] {
  const { params: p, maps, rect, outW, outH, seed, bankSize } = opts
  const cell = Math.max(4, p.cellSize)
  const cols = Math.max(1, Math.round(outW / cell))
  const rows = Math.max(1, Math.round(outH / cell))
  const cw = outW / cols
  const ch = outH / rows

  // regional coherence: a broad seeded field every cell reads, so
  // neighborhoods favor one behavior instead of independent noise.
  // coherenceScale 0 -> lattice near cell size (no correlation),
  // 1 -> a handful of broad regions across the image.
  const latticeCells = Math.round(3 + (1 - p.coherenceScale) * 17)
  const region = coherenceField(seed, rect, latticeCells, 'lab.region')

  const out: MarkStamp[] = []
  for (let iy = 0; iy < rows; iy++) {
    for (let ix = 0; ix < cols; ix++) {
      const id = iy * 8192 + ix
      const x = (ix + 0.5) * cw
      const y = (iy + 0.5) * ch

      // cell center -> analysis coords; outside the fitted source there
      // is no evidence and no mark
      const u = (x - rect.x) / rect.w
      const v = (y - rect.y) / rect.h
      if (u < 0 || u > 1 || v < 0 || v > 1) continue
      const mx = u * maps.w - 0.5
      const my = v * maps.h - 0.5

      const a = sampleMap(maps.alpha, maps.w, maps.h, mx, my)
      if (a < 0.04) continue
      const tone = (1 - sampleMap(maps.lum, maps.w, maps.h, mx, my)) * a
      const edge = sampleMap(maps.edge, maps.w, maps.h, mx, my)
      const detail = sampleMap(maps.detailFine, maps.w, maps.h, mx, my)
      const structure = Math.min(1, edge * 0.7 + detail * 0.65)
      const value = tone * (1 - p.evidenceMix) + structure * p.evidenceMix

      // presence: a budget weighted by evidence, resolved per cell by
      // its own channel — empty areas thin out instead of tiling
      const presence = Math.min(1, p.occupancy * (0.15 + 0.85 * value) * 1.35)
      if (chan(seed, id, 'lab.cull') >= presence) continue

      const coh = region(x, y)

      // selection: the value walks the density-ordered ramp; the
      // regional field shifts the pick so areas commit to a subset; a
      // whisper of per-cell jitter breaks ties
      let protoIndex = 0
      if (bankSize > 1) {
        const shift = (coh - 0.5) * 0.55 * (bankSize - 1)
        const jit = (chan(seed, id, 'lab.pick') - 0.5) * 0.9
        protoIndex = Math.round(value * (bankSize - 1) + shift + jit)
        protoIndex = Math.max(0, Math.min(bankSize - 1, protoIndex))
      }

      // size carries tone (the halftone contract), scaled to the cell
      const size = cell * (p.minScale + (p.maxScale - p.minScale) * Math.pow(tone, 0.85))
      if (size < 0.75) continue

      // rotation: edge orientation where edges are confident, the
      // region's shared tilt where they are not
      const ox = sampleMap(maps.orientX, maps.w, maps.h, mx, my)
      const oy = sampleMap(maps.orientY, maps.w, maps.h, mx, my)
      const confidence = Math.min(1, Math.hypot(ox, oy) * 6)
      const edgeAngle = 0.5 * Math.atan2(oy, ox)
      const regionAngle = (coh - 0.5) * (Math.PI / 2)
      const rot =
        p.rotationInfluence *
        (edgeAngle * confidence + regionAngle * (1 - confidence))

      // `|| 0` collapses -0 (influence 0 times a negative angle) so
      // serialized stamps stay byte-identical across formulations
      out.push({ x, y, size, rot: rot || 0, protoIndex, tone, mx, my })
    }
  }
  return out
}

// quantized print tints for the 'tint' color mode — three inks, no
// continuous alpha (the poster-reference lesson: limited states read as
// typeset, continuous ones read as a filter)
export const TINT_LEVELS = [0.32, 0.58, 1] as const

export function tintFor(tone: number): number {
  return tone > 0.62 ? TINT_LEVELS[2] : tone > 0.28 ? TINT_LEVELS[1] : TINT_LEVELS[0]
}
