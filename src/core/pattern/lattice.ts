import type { CurveSample } from '@/core/lissajous/sampler'

// The lattice register: a uniform grid of primitives whose STATE is a
// function of distance to the curve. The grid never breaks — the figure
// appears because cells near it SWAP primitive (dot -> circle -> ring ->
// square), exactly how the reference plates draw form by substitution.
//
// Output is batched: one SVG path string per primitive tier, so a
// 64-column lattice renders as four <path> elements, not thousands of
// nodes.

export type LatticeTiers = {
  dots: string // far cells: the baseline lattice
  circles: string // approaching cells
  rings: string // near cells
  squares: string // cells ON the curve
}

type Options = {
  cells: number
  size: number // primitive size relative to the cell
  range: number // influence reach, in cell widths
  mode: 'lattice' | 'trace'
}

type Transform = { scale: number; offsetX: number; offsetY: number }

export function buildLattice(
  samples: CurveSample[],
  width: number,
  height: number,
  opts: Options,
  transform?: Transform,
): LatticeTiers {
  const cols = Math.max(4, Math.round(opts.cells))
  const cellW = width / cols
  const rows = Math.max(4, Math.round(height / cellW))
  const cellH = height / rows

  // transformed curve polyline (same zoom + pan as the background figure)
  const scale = transform?.scale ?? 1
  const cx = width * 0.5
  const cy = height * 0.5
  const ox = (transform?.offsetX ?? 0) * width
  const oy = (transform?.offsetY ?? 0) * height
  const pts: { x: number; y: number }[] = []
  const stride = Math.max(1, Math.floor(samples.length / 256))
  for (let i = 0; i < samples.length; i += stride) {
    const s = samples[i]
    pts.push({ x: cx + (s.x - cx) * scale + ox, y: cy + (s.y - cy) * scale + oy })
  }
  if (pts.length > 1) pts.push(pts[0])

  const distTo = (px: number, py: number): number => {
    let best = Infinity
    for (let i = 1; i < pts.length; i++) {
      const ax = pts[i - 1].x
      const ay = pts[i - 1].y
      const dx = pts[i].x - ax
      const dy = pts[i].y - ay
      const len2 = dx * dx + dy * dy || 1e-9
      let t = ((px - ax) * dx + (py - ay) * dy) / len2
      t = t < 0 ? 0 : t > 1 ? 1 : t
      const ex = px - (ax + dx * t)
      const ey = py - (ay + dy * t)
      const d2 = ex * ex + ey * ey
      if (d2 < best) best = d2
    }
    return Math.sqrt(best)
  }

  const reach = opts.range * cellW
  const r = (opts.size * Math.min(cellW, cellH)) / 2
  const tiers = { dots: [] as string[], circles: [] as string[], rings: [] as string[], squares: [] as string[] }

  const circleAt = (x: number, y: number, radius: number) =>
    `M${(x - radius).toFixed(1)} ${y.toFixed(1)}` +
    `a${radius.toFixed(1)} ${radius.toFixed(1)} 0 1 0 ${(radius * 2).toFixed(1)} 0` +
    `a${radius.toFixed(1)} ${radius.toFixed(1)} 0 1 0 ${(-radius * 2).toFixed(1)} 0`

  const squareAt = (x: number, y: number, half: number) =>
    `M${(x - half).toFixed(1)} ${(y - half).toFixed(1)}` +
    `h${(half * 2).toFixed(1)}v${(half * 2).toFixed(1)}h${(-half * 2).toFixed(1)}Z`

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = (col + 0.5) * cellW
      const y = (row + 0.5) * cellH
      const d = distTo(x, y)
      const band = d / Math.max(reach, 1e-6)
      if (band < 0.45) {
        tiers.squares.push(squareAt(x, y, r * 0.9))
      } else if (band < 1) {
        tiers.rings.push(circleAt(x, y, r * 0.85))
      } else if (band < 1.9) {
        tiers.circles.push(circleAt(x, y, r * 0.55))
      } else if (opts.mode === 'lattice') {
        tiers.dots.push(circleAt(x, y, r * 0.2))
      }
    }
  }

  return {
    dots: tiers.dots.join(''),
    circles: tiers.circles.join(''),
    rings: tiers.rings.join(''),
    squares: tiers.squares.join(''),
  }
}
