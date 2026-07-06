import { SpatialHash } from '@/core/math/spatialHash'
import { columnSpanRect } from '@/core/grid/types'
import { uprightAngle, type GlyphContext, type PlacedGlyph } from './layout'
import type { GlyphFieldState } from '@/core/state/types'

// Craft rules shared by every mode (the dense-poster discipline):
//   - ink opacity quantizes to three print tints — never continuous alpha
//   - sizes quantize to discrete steps of the base scale — no size drift
//   - density response is bimodal: hot zones pack, quiet zones empty
//   - positions lock to the grid (columns, baselines, em advances)

export const INK_TINTS = [1, 0.58, 0.32] as const
export const SIZE_STEPS = { small: 0.62, base: 1, large: 1.7 } as const

// Continuous ink intent → one of three tints, or 0 (skip the glyph).
export function quantTint(intent: number): number {
  if (intent > 0.72) return INK_TINTS[0]
  if (intent > 0.42) return INK_TINTS[1]
  if (intent > 0.16) return INK_TINTS[2]
  return 0
}

// Density-driven size step. Levels: 1 = base only, 2 = +large in hot
// zones, 3 = +small in cold zones.
export function quantSize(state: GlyphFieldState, density: number): number {
  if (state.sizeLevels >= 2 && density > 0.55) return state.scale * SIZE_STEPS.large
  if (state.sizeLevels >= 3 && density < 0.2) return state.scale * SIZE_STEPS.small
  return state.scale
}

// Bimodal coverage shaping: at contrast 0 the response is linear; at 1 it
// is a hard S — probability drains from the middle into the extremes.
export function shapeCoverage(p: number, contrast: number): number {
  const clamped = Math.max(0, Math.min(1, p))
  const w = 0.5 - 0.38 * contrast
  const t = Math.max(0, Math.min(1, (clamped - (0.5 - w)) / (2 * w)))
  const s = t * t * (3 - 2 * t)
  return clamped * (1 - contrast) + s * contrast
}

// Pressure clears glyphs around type. Returns 0..1 keep-factor.
function pressureKeep(ctx: GlyphContext, x: number, y: number): number {
  const p = ctx.pressureAt(x, y)
  return Math.max(0, 1 - p * (0.6 + ctx.state.pressureResponse * 1.4))
}

// Sparse: encoded marks on a column-third × baseline lattice — even the
// "loose" mode sits on the grid.
export function placeSparse(ctx: GlyphContext): PlacedGlyph[] {
  const { state, grid, rng } = ctx
  const box = grid.contentBox

  const xs: number[] = []
  const bounds = grid.columnBoundaries
  for (let i = 0; i < bounds.length - 1; i++) {
    const a = bounds[i].pos
    const b = bounds[i + 1].pos
    xs.push(a, a + (b - a) / 3, a + (2 * (b - a)) / 3)
  }
  xs.push(bounds[bounds.length - 1].pos)
  const ys: number[] = []
  for (let y = box.y; y <= box.y + box.h; y += grid.baseline) ys.push(y)

  const out: PlacedGlyph[] = []
  const used = new Set<string>()
  const target = Math.round(30 + state.density * 200)
  const attempts = target * 14

  for (let i = 0; i < attempts && out.length < target; i++) {
    const xi = Math.floor(rng() * xs.length)
    const yi = Math.floor(rng() * ys.length)
    const key = `${xi}:${yi}`
    if (used.has(key)) continue
    // neighbour spacing on the lattice itself
    if (used.has(`${xi - 1}:${yi}`) || used.has(`${xi + 1}:${yi}`) ||
        used.has(`${xi}:${yi - 1}`) || used.has(`${xi}:${yi + 1}`)) continue

    const x = xs[xi]
    const y = ys[yi]
    const f = ctx.sampler.sample(x, y)
    const coverage = shapeCoverage((0.12 + 0.88 * f.density) * (1 - f.dist * 0.45), state.contrast)
    if (rng() > coverage) continue
    const keep = pressureKeep(ctx, x, y)
    if (keep < 0.35) continue
    const tint = quantTint(keep * (0.35 + f.density * 0.65))
    if (!tint) continue

    used.add(key)
    out.push({
      char: ctx.nextChar(),
      x, y,
      angle: ctx.glyphAngle(x, y),
      size: quantSize(state, f.density),
      alpha: tint,
    })
  }
  return out
}

// Dense: newspaper columns. Text runs down each grid column on the
// baseline rhythm; gutters stay empty; whole lines sit out where the
// field is quiet — skipped-line rhythm is the texture.
export function placeDense(ctx: GlyphContext): PlacedGlyph[] {
  const { state, grid, rng } = ctx
  const box = grid.contentBox
  const nCols = grid.columnBoundaries.length - 1
  const leading = Math.max(1, Math.round(state.lineRhythm)) * grid.baseline
  const out: PlacedGlyph[] = []

  for (let col = 0; col < nCols; col++) {
    const rect = columnSpanRect(grid, col, 1)
    for (let y = box.y + leading; y < box.y + box.h - 2; y += leading) {
      // line-level energy decides whether this line typesets at all
      let lineDensity = 0
      const probes = 5
      for (let i = 0; i < probes; i++) {
        lineDensity += ctx.sampler.sample(rect.x + ((i + 0.5) / probes) * rect.w, y).density
      }
      lineDensity /= probes
      const lineCoverage = shapeCoverage(0.1 + state.density * (0.2 + 0.8 * lineDensity), state.contrast)
      if (rng() > lineCoverage * 1.9) continue

      // size is per line ({small, base} only) so the leading stays intact
      const size =
        state.sizeLevels >= 3 && lineDensity < 0.18 ? state.scale * SIZE_STEPS.small : state.scale
      const advance = size * (0.62 + state.tracking)

      for (let x = rect.x + advance / 2; x < rect.x + rect.w - advance / 2; x += advance) {
        const ch = ctx.nextChar() // strict order — running text
        const f = ctx.sampler.sample(x, y)
        const keep = pressureKeep(ctx, x, y)
        if (keep < 0.3) continue
        const coverage = shapeCoverage(state.density * (0.3 + 0.7 * f.density), state.contrast)
        if (rng() > 0.3 + coverage) continue
        const tint = quantTint(keep * (0.35 + f.density * 0.65))
        if (!tint) continue
        out.push({ char: ch, x, y, angle: ctx.glyphAngle(x, y), size, alpha: tint })
      }
    }
  }
  return out
}

// Vertical Stream: top-down runs hanging from grid column boundaries,
// run length driven by the column's average field density. Hot columns
// (density > 0.7 setting) earn a paired echo stream.
export function placeVerticalStream(ctx: GlyphContext): PlacedGlyph[] {
  const { state, grid, rng } = ctx
  const box = grid.contentBox
  const out: PlacedGlyph[] = []
  const step = grid.baseline * Math.max(0.5, Math.round(state.lineRhythm * 2) / 2)

  const bounds = grid.columnBoundaries.map((g) => g.pos)
  const xs: number[] = [...bounds]
  if (state.density > 0.55) {
    for (let i = 0; i < bounds.length - 1; i++) xs.push((bounds[i] + bounds[i + 1]) / 2)
  }
  xs.sort((a, b) => a - b)

  for (const x of xs) {
    let energy = 0
    const probes = 24
    for (let i = 0; i < probes; i++) {
      energy += ctx.sampler.sample(x, box.y + ((i + 0.5) / probes) * box.h).density
    }
    energy /= probes

    const coverage = shapeCoverage(0.2 + energy * 1.2 + state.density * 0.3, state.contrast)
    if (rng() > coverage) continue

    const startY = box.y + Math.round((rng() * box.h * 0.35) / step) * step
    const len = box.h * (0.2 + energy * 0.9 + rng() * 0.25) * (0.4 + state.density * 0.8)
    const size = quantSize(state, energy)
    const echo = state.density > 0.7 && energy > 0.4

    for (let y = startY; y < Math.min(box.y + box.h - 2, startY + len); y += step) {
      const keep = pressureKeep(ctx, x, y)
      if (keep < 0.3) continue
      const f = ctx.sampler.sample(x, y)
      const tint = quantTint(keep * (0.35 + f.density * 0.6))
      if (!tint) continue
      out.push({ char: ctx.nextChar(), x, y, angle: 0, size, alpha: tint })
      if (echo) {
        out.push({
          char: ctx.nextChar(),
          x: x + size * 0.8, y, angle: 0,
          size: size * SIZE_STEPS.small,
          alpha: INK_TINTS[2],
        })
      }
    }
  }
  return out
}

// Field Contour: glyphs ride iso-bands of curve distance, oriented along
// the tangent channel — text as offset rings of the hidden curve.
export function placeFieldContour(ctx: GlyphContext): PlacedGlyph[] {
  const { state, grid, rng } = ctx
  const box = grid.contentBox
  const out: PlacedGlyph[] = []
  const bandStep = 0.16 - state.density * 0.1
  const bandWidth = 0.016
  const scan = state.scale * 0.55
  const minGap = state.scale * (0.62 + state.tracking)
  const placed = new SpatialHash<{ x: number; y: number }>(minGap)

  for (let y = box.y + scan / 2; y < box.y + box.h; y += scan) {
    for (let x = box.x + scan / 2; x < box.x + box.w; x += scan) {
      const f = ctx.sampler.sample(x, y)
      const band = f.dist / bandStep
      if (Math.abs(band - Math.round(band)) * bandStep > bandWidth) continue
      if (Math.round(band) === 0) continue // skip the curve line itself

      const keep = pressureKeep(ctx, x, y)
      if (keep < 0.3) continue
      const coverage = shapeCoverage(0.35 + 0.65 * f.density, state.contrast)
      if (rng() > 0.25 + coverage) continue

      let crowded = false
      for (const p of placed.queryPoint(x, y, minGap)) {
        const dx = p.x - x
        const dy = p.y - y
        if (dx * dx + dy * dy < minGap * minGap) { crowded = true; break }
      }
      if (crowded) continue

      const tint = quantTint(keep * (0.3 + (1 - f.dist) * 0.6))
      if (!tint) continue

      placed.insertPoint(x, y, { x, y })
      const tangent = uprightAngle(Math.atan2(f.tanY, f.tanX))
      out.push({
        char: ctx.nextChar(),
        x, y,
        angle: state.orientation === 'grid' ? tangent : ctx.glyphAngle(x, y),
        size: quantSize(state, f.density),
        alpha: tint,
      })
    }
  }
  return out
}
