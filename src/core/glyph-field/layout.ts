import type { GlyphFieldState, ProjectState } from '@/core/state/types'
import type { EditorialGrid } from '@/core/grid/types'
import { FieldSampler } from '@/core/lissajous/fields'
import { samplePressure, type PressureMask } from '@/core/typography/pressureMask'
import { mulberry32, type Rng } from '@/core/math/random'
import { placeSparse, placeDense, placeVerticalStream, placeFieldContour } from './modes'

export type PlacedGlyph = {
  char: string
  x: number
  y: number
  angle: number // radians
  size: number
  alpha: number
}

export type GlyphContext = {
  state: GlyphFieldState
  grid: EditorialGrid
  sampler: FieldSampler
  mask: PressureMask
  artW: number
  artH: number
  rng: Rng
  chars: string[]
  nextChar: () => string
  pressureAt: (x: number, y: number) => number
  glyphAngle: (x: number, y: number) => number
}

// Fold an angle into (-90°, 90°] so no glyph ever renders upside down —
// the difference between "typeset along the curve" and rotated noise.
export function uprightAngle(angle: number): number {
  let a = angle % (Math.PI * 2)
  if (a > Math.PI) a -= Math.PI * 2
  if (a < -Math.PI) a += Math.PI * 2
  if (a > Math.PI / 2) a -= Math.PI
  if (a < -Math.PI / 2) a += Math.PI
  return a
}

// Chars come from the brand language, in order — running text, not noise.
function charStream(state: GlyphFieldState, rng: Rng): { chars: string[]; nextChar: () => string } {
  const source = (state.charset.trim() || state.sourceText).replace(/\s+/g, '')
  const chars = source.length ? [...source] : ['•']
  let i = Math.floor(rng() * chars.length)
  return {
    chars,
    nextChar: () => chars[i++ % chars.length],
  }
}

export function layoutGlyphField(
  project: ProjectState,
  grid: EditorialGrid,
  sampler: FieldSampler,
  mask: PressureMask,
): PlacedGlyph[] {
  const state = project.glyphField
  if (!state.enabled) return []

  const rng = mulberry32((project.seed ^ 0x9e3779b9) + state.seedOffset * 7919)
  const { chars, nextChar } = charStream(state, rng)
  const artW = project.artboard.width
  const artH = project.artboard.height

  const ctx: GlyphContext = {
    state,
    grid,
    sampler,
    mask,
    artW,
    artH,
    rng,
    chars,
    nextChar,
    pressureAt: (x, y) => samplePressure(mask, x, y, artW, artH),
    glyphAngle: (x, y) => {
      let angle: number
      switch (state.orientation) {
        case 'tangent': angle = sampler.tangentAngle(x, y); break
        case 'normal': angle = sampler.tangentAngle(x, y) + Math.PI / 2; break
        case 'vertical': angle = Math.PI / 2; break
        case 'mixed': {
          const r = rng()
          angle = r < 0.45 ? sampler.tangentAngle(x, y) : r < 0.75 ? 0 : Math.PI / 2
          break
        }
        default: angle = 0
      }
      if (state.randomness > 0) angle += (rng() - 0.5) * state.randomness * 0.7
      return uprightAngle(angle)
    },
  }

  switch (state.mode) {
    case 'sparse': return placeSparse(ctx)
    case 'dense': return placeDense(ctx)
    case 'verticalStream': return placeVerticalStream(ctx)
    case 'fieldContour': return placeFieldContour(ctx)
  }
}

let cacheKey = ''
let cacheVal: PlacedGlyph[] | null = null

export function getGlyphLayout(
  project: ProjectState,
  grid: EditorialGrid,
  sampler: FieldSampler,
  mask: PressureMask,
): PlacedGlyph[] {
  const key = JSON.stringify([
    project.glyphField, project.seed, project.lissajous,
    project.artboard.width, project.artboard.height,
    project.grid, project.typeBlocks,
  ])
  if (cacheVal && key === cacheKey) return cacheVal
  cacheVal = layoutGlyphField(project, grid, sampler, mask)
  cacheKey = key
  return cacheVal
}
