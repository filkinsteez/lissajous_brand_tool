import { SpatialHash } from '@/core/math/spatialHash'
import { uprightAngle, type GlyphContext, type PlacedGlyph } from './layout'

// Every mode reads the same curve-derived field (distance / tangent /
// intersection density) and the text pressure mask. Glyphs must feel
// typeset: baseline discipline, real tracking, restrained jitter.

// Pressure clears glyphs around type. Returns 0..1 keep-factor.
function pressureKeep(ctx: GlyphContext, x: number, y: number): number {
  const p = ctx.pressureAt(x, y)
  return Math.max(0, 1 - p * (0.6 + ctx.state.pressureResponse * 1.4))
}

// Sparse: rejection-sampled encoded marks, denser near intersections.
export function placeSparse(ctx: GlyphContext): PlacedGlyph[] {
  const { state, grid, rng, artW, artH } = ctx
  const box = grid.contentBox
  const out: PlacedGlyph[] = []
  const target = Math.round(40 + state.density * 260)
  const attempts = target * 14
  const minGap = state.scale * (1.6 - state.density * 0.6)
  const placed = new SpatialHash<{ x: number; y: number }>(minGap)

  for (let i = 0; i < attempts && out.length < target; i++) {
    const x = box.x + rng() * box.w
    const y = box.y + rng() * box.h
    const f = ctx.sampler.sample(x, y)
    const affinity = Math.pow(0.15 + 0.85 * f.density, 1.3) * (1 - f.dist * 0.5)
    if (rng() > affinity) continue
    const keep = pressureKeep(ctx, x, y)
    if (keep < 0.35) continue

    let crowded = false
    for (const p of placed.queryPoint(x, y, minGap)) {
      const dx = p.x - x
      const dy = p.y - y
      if (dx * dx + dy * dy < minGap * minGap) { crowded = true; break }
    }
    if (crowded) continue

    placed.insertPoint(x, y, { x, y })
    out.push({
      char: ctx.nextChar(),
      x, y,
      angle: ctx.glyphAngle(x, y),
      size: state.scale * (0.75 + f.density * 0.6),
      alpha: keep * (0.5 + f.density * 0.45),
    })
  }
  void artW; void artH
  return out
}

// Dense: baseline-aligned lattice typesetting the source text row by row,
// voids carved by type pressure, thinning where the field is quiet.
export function placeDense(ctx: GlyphContext): PlacedGlyph[] {
  const { state, grid, rng } = ctx
  const box = grid.contentBox
  const out: PlacedGlyph[] = []
  const leading = state.scale * state.lineRhythm * 1.35
  const advance = state.scale * (0.62 + state.tracking)

  for (let y = box.y + leading; y < box.y + box.h - 2; y += leading) {
    for (let x = box.x + advance / 2; x < box.x + box.w - advance / 2; x += advance) {
      const ch = ctx.nextChar() // consume in strict order — running text
      const f = ctx.sampler.sample(x, y)
      const keep = pressureKeep(ctx, x, y)
      if (keep < 0.3) continue
      const coverage = 0.1 + state.density * 0.9 * (0.35 + 0.65 * f.density + 0.25 * (1 - f.dist))
      if (rng() > coverage) continue
      out.push({
        char: ch,
        x, y,
        angle: ctx.glyphAngle(x, y),
        size: state.scale,
        alpha: keep * (0.42 + f.density * 0.5),
      })
    }
  }
  return out
}

// Vertical Stream: top-down runs hanging from grid column boundaries,
// run length driven by the column's average field density.
export function placeVerticalStream(ctx: GlyphContext): PlacedGlyph[] {
  const { state, grid, rng } = ctx
  const box = grid.contentBox
  const out: PlacedGlyph[] = []
  const step = state.scale * state.lineRhythm * 0.95

  // streams at column boundaries; density adds midpoint streams
  const bounds = grid.columnBoundaries.map((g) => g.pos)
  const xs: number[] = [...bounds]
  if (state.density > 0.55) {
    for (let i = 0; i < bounds.length - 1; i++) xs.push((bounds[i] + bounds[i + 1]) / 2)
  }
  xs.sort((a, b) => a - b)

  for (const x of xs) {
    // column energy = mean density along it
    let energy = 0
    const probes = 24
    for (let i = 0; i < probes; i++) {
      energy += ctx.sampler.sample(x, box.y + ((i + 0.5) / probes) * box.h).density
    }
    energy /= probes

    if (rng() > 0.25 + energy * 1.6 + state.density * 0.35) continue

    const startY = box.y + rng() * box.h * 0.35
    const len = box.h * (0.2 + energy * 0.9 + rng() * 0.25) * (0.4 + state.density * 0.8)
    for (let y = startY; y < Math.min(box.y + box.h - 2, startY + len); y += step) {
      const keep = pressureKeep(ctx, x, y)
      if (keep < 0.3) continue
      const f = ctx.sampler.sample(x, y)
      out.push({
        char: ctx.nextChar(),
        x, y,
        angle: 0, // upright stacked — reads as a stream, not rotated text
        size: state.scale,
        alpha: keep * (0.4 + f.density * 0.5),
      })
    }
  }
  return out
}

// Field Contour: glyphs ride iso-bands of curve distance, oriented along
// the tangent channel — text as offset rings of the hidden curve.
export function placeFieldContour(ctx: GlyphContext): PlacedGlyph[] {
  const { state, grid } = ctx
  const box = grid.contentBox
  const out: PlacedGlyph[] = []
  const bandStep = 0.16 - state.density * 0.1 // dist-units between rings
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

      let crowded = false
      for (const p of placed.queryPoint(x, y, minGap)) {
        const dx = p.x - x
        const dy = p.y - y
        if (dx * dx + dy * dy < minGap * minGap) { crowded = true; break }
      }
      if (crowded) continue

      placed.insertPoint(x, y, { x, y })
      const tangent = uprightAngle(Math.atan2(f.tanY, f.tanX))
      out.push({
        char: ctx.nextChar(),
        x, y,
        angle: state.orientation === 'grid' ? tangent : ctx.glyphAngle(x, y),
        size: state.scale * (0.85 + f.density * 0.35),
        alpha: keep * (0.35 + (1 - f.dist) * 0.5),
      })
    }
  }
  return out
}
