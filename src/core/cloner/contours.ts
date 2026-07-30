import type { CurveSample } from '@/core/lissajous/sampler'

// The cloner register: the curve duplicated as nested hairline offsets —
// field lines around the mark. Implemented as ISO-CONTOURS of the
// distance-to-curve field, because level sets do exactly what the
// reference does: tight rings hugging each lobe near the curve that
// merge into one big envelope as the offset grows.
//
// All of it is deterministic geometry from the same curve that drives
// layout, motion and the background — no randomness, no time.

export type ContourLevel = {
  d: string // SVG path data (many open subpaths)
  offset: number // the level's distance in artboard px
}

type Grid = {
  cols: number
  rows: number
  cellW: number
  cellH: number
  values: Float32Array
}

// distance-to-polyline sampled on a coarse lattice; marching squares
// interpolates the crisp contour back out of it
export function buildDistanceGrid(
  points: { x: number; y: number }[],
  width: number,
  height: number,
  cols = 144,
): Grid {
  const rows = Math.max(8, Math.round((cols * height) / Math.max(width, 1)))
  const cellW = width / cols
  const cellH = height / rows
  const values = new Float32Array((cols + 1) * (rows + 1))

  // coarse spatial reject: segment bounding circles
  const segs: { ax: number; ay: number; bx: number; by: number }[] = []
  for (let i = 1; i < points.length; i++) {
    segs.push({ ax: points[i - 1].x, ay: points[i - 1].y, bx: points[i].x, by: points[i].y })
  }

  for (let r = 0; r <= rows; r++) {
    const py = r * cellH
    for (let c = 0; c <= cols; c++) {
      const px = c * cellW
      let best = Infinity
      for (const s of segs) {
        const dx = s.bx - s.ax
        const dy = s.by - s.ay
        const len2 = dx * dx + dy * dy || 1e-9
        let t = ((px - s.ax) * dx + (py - s.ay) * dy) / len2
        t = t < 0 ? 0 : t > 1 ? 1 : t
        const ex = px - (s.ax + dx * t)
        const ey = py - (s.ay + dy * t)
        const d2 = ex * ex + ey * ey
        if (d2 < best) best = d2
      }
      values[r * (cols + 1) + c] = Math.sqrt(best)
    }
  }
  return { cols, rows, cellW, cellH, values }
}

// standard marching squares, emitting open segments straight into one
// path string per level — rendering does not need joined loops
export function contourAtLevel(grid: Grid, level: number): string {
  const { cols, rows, cellW, cellH, values } = grid
  const at = (c: number, r: number) => values[r * (cols + 1) + c]
  const parts: string[] = []

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v0 = at(c, r) - level // top-left
      const v1 = at(c + 1, r) - level // top-right
      const v2 = at(c + 1, r + 1) - level // bottom-right
      const v3 = at(c, r + 1) - level // bottom-left
      let mask = 0
      if (v0 < 0) mask |= 1
      if (v1 < 0) mask |= 2
      if (v2 < 0) mask |= 4
      if (v3 < 0) mask |= 8
      if (mask === 0 || mask === 15) continue

      const x0 = c * cellW
      const y0 = r * cellH
      // edge interpolators: top, right, bottom, left
      const top = () => ({ x: x0 + (v0 / (v0 - v1)) * cellW, y: y0 })
      const right = () => ({ x: x0 + cellW, y: y0 + (v1 / (v1 - v2)) * cellH })
      const bottom = () => ({ x: x0 + (v3 / (v3 - v2)) * cellW, y: y0 + cellH })
      const left = () => ({ x: x0, y: y0 + (v0 / (v0 - v3)) * cellH })

      const seg = (a: { x: number; y: number }, b: { x: number; y: number }) => {
        parts.push(`M${a.x.toFixed(1)} ${a.y.toFixed(1)}L${b.x.toFixed(1)} ${b.y.toFixed(1)}`)
      }

      switch (mask) {
        case 1: case 14: seg(left(), top()); break
        case 2: case 13: seg(top(), right()); break
        case 3: case 12: seg(left(), right()); break
        case 4: case 11: seg(right(), bottom()); break
        case 6: case 9: seg(top(), bottom()); break
        case 7: case 8: seg(left(), bottom()); break
        case 5: seg(left(), top()); seg(right(), bottom()); break
        case 10: seg(top(), right()); seg(left(), bottom()); break
      }
    }
  }
  return parts.join('')
}

// the clone family: COUNT offsets from the curve, SPACING apart, with
// GROWTH bending the progression from even rings toward accelerating ones
export function buildContourLevels(
  samples: CurveSample[],
  width: number,
  height: number,
  opts: { count: number; spacing: number; growth: number },
  transform?: { scale: number; offsetX: number; offsetY: number },
): ContourLevel[] {
  const scale = transform?.scale ?? 1
  const cx = width * 0.5
  const cy = height * 0.5
  const ox = (transform?.offsetX ?? 0) * width
  const oy = (transform?.offsetY ?? 0) * height
  const pts: { x: number; y: number }[] = []
  const stride = Math.max(1, Math.floor(samples.length / 320))
  for (let i = 0; i < samples.length; i += stride) {
    const s = samples[i]
    pts.push({ x: cx + (s.x - cx) * scale + ox, y: cy + (s.y - cy) * scale + oy })
  }
  if (pts.length > 1) pts.push(pts[0]) // close the loop

  const grid = buildDistanceGrid(pts, width, height)
  const minDim = Math.min(width, height)
  const out: ContourLevel[] = []
  for (let i = 0; i < opts.count; i++) {
    const offset = opts.spacing * minDim * Math.pow(i + 1, opts.growth)
    const d = contourAtLevel(grid, offset)
    if (d) out.push({ d, offset })
  }
  return out
}
