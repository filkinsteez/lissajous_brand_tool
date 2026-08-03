import type { RepeaterState, SheetShape } from '@/core/state/types'
import type { SheetClone } from '@/core/sheet/sheet'

// The repeater engine: one seed shape echoed with an ACCUMULATING
// transform — the C4D/Cavalry move. Pure data, shared by the SVG layer
// and the PNG export.
//
//   LINEAR — copy i sits at origin + step*i, rotated rotate*i, scaled
//            scaleStep^i: cascades, staircases, echo trails
//   RADIAL — copies ride an arc around the origin, each oriented along
//            its spoke (plus the per-step rotate on top): fans, rosettes
//   GRID   — countX×countY copies centered on the origin, step as cell
//            spacing; the accumulation sweeps in reading order, so turn,
//            scale and fade travel diagonally across the lattice
//
// FADE is the classic opacity ramp across the family. 'mixed' shape
// deals the vocabulary in a fixed cycle — deterministic, no seed needed:
// a repeater is a rhythm, not a field.

const MIX: Exclude<SheetShape, 'mixed'>[] = [
  'circle',
  'square',
  'triangle',
  'half',
  'quarter',
  'cross',
  'meta',
]

export function buildRepeats(
  rep: RepeaterState,
  width: number,
  height: number,
  drawnCount?: number,
): SheetClone[] {
  const minDim = Math.min(width, height)
  const baseR = Math.max(1, rep.size * minDim)
  const ox = rep.originX * width
  const oy = rep.originY * height

  const out: SheetClone[] = []
  // one accumulation rule for every mode: copy i carries rotate*i,
  // scaleStep^i and the fade ramp at u = i/(total-1)
  const place = (i: number, total: number, x: number, y: number, spoke = 0, dealI = i) => {
    const u = total > 1 ? i / (total - 1) : 0
    const scale = Math.pow(rep.scaleStep, i)
    const shape: Exclude<SheetShape, 'mixed'> =
      rep.shape === 'mixed' ? MIX[dealI % MIX.length] : (rep.shape as Exclude<SheetShape, 'mixed'>)
    // bound drawn protos cycle the way MIX cycles (diagonal dealI in grid
    // mode) and carry their own fill — never stroked
    const drawnIndex = drawnCount && drawnCount > 0 ? dealI % drawnCount : undefined
    out.push({
      x,
      y,
      r: Math.max(0.5, baseR * scale),
      rotate: spoke + rep.rotate * i,
      opacity: Math.max(0.05, 1 - rep.fade * u * 0.95),
      shape,
      stroked: drawnIndex !== undefined ? false : shape === 'meta' ? true : rep.stroked,
      drawnIndex,
      z: 0,
    })
  }

  if (rep.mode === 'grid') {
    const nx = Math.min(12, Math.max(2, Math.round(rep.countX)))
    const ny = Math.min(12, Math.max(2, Math.round(rep.countY)))
    const total = nx * ny
    for (let row = 0; row < ny; row++) {
      for (let col = 0; col < nx; col++) {
        const x = ox + (col - (nx - 1) / 2) * rep.stepX * width
        const y = oy + (row - (ny - 1) / 2) * rep.stepY * height
        // deal the mix on diagonals (col+row) so columns cannot lock to
        // one shape when countX lands on a multiple of the vocabulary
        place(row * nx + col, total, x, y, 0, col + row)
      }
    }
    return out
  }

  const n = Math.max(2, Math.round(rep.count))
  for (let i = 0; i < n; i++) {
    if (rep.mode === 'radial') {
      // full-circle spans distribute i/n so the last copy does not land
      // on the first; partial arcs use i/(n-1) so both ends are reached
      const full = rep.span >= Math.PI * 2 - 1e-6
      const t = full ? i / n : n > 1 ? i / (n - 1) : 0
      const angle = -Math.PI / 2 + rep.span * t
      const radius = rep.radius * minDim
      place(i, n, ox + Math.cos(angle) * radius, oy + Math.sin(angle) * radius, angle + Math.PI / 2)
    } else {
      place(i, n, ox + rep.stepX * width * i, oy + rep.stepY * height * i)
    }
  }
  return out
}

// CURVE mode: copies ride the figure itself at equal arc spacing, each
// oriented along the local tangent, with the same accumulation rule
// (rotate*i, scaleStep^i, fade ramp) sweeping around the loop. The
// curve is closed, so i/n spacing never doubles the seam point.
export function buildCurveClones(
  rep: RepeaterState,
  width: number,
  height: number,
  pts: { x: number; y: number }[],
  drawnCount?: number,
): SheetClone[] {
  if (pts.length < 2) return []
  const minDim = Math.min(width, height)
  const baseR = Math.max(1, rep.size * minDim)
  const loop = [...pts, pts[0]]
  const cums: number[] = [0]
  for (let i = 1; i < loop.length; i++) {
    cums.push(cums[i - 1] + Math.hypot(loop[i].x - loop[i - 1].x, loop[i].y - loop[i - 1].y))
  }
  const total = cums[cums.length - 1]
  if (total <= 0) return []

  const out: SheetClone[] = []
  const n = Math.max(2, Math.round(rep.count))
  let seg = 0
  for (let i = 0; i < n; i++) {
    const s = (i / n) * total
    while (seg < loop.length - 2 && cums[seg + 1] < s) seg++
    const a = loop[seg]
    const b = loop[seg + 1]
    const segLen = cums[seg + 1] - cums[seg]
    const t = segLen > 0 ? (s - cums[seg]) / segLen : 0
    const u = n > 1 ? i / (n - 1) : 0
    const shape: Exclude<SheetShape, 'mixed'> =
      rep.shape === 'mixed' ? MIX[i % MIX.length] : (rep.shape as Exclude<SheetShape, 'mixed'>)
    const drawnIndex = drawnCount && drawnCount > 0 ? i % drawnCount : undefined
    out.push({
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      r: Math.max(0.5, baseR * Math.pow(rep.scaleStep, i)),
      rotate: Math.atan2(b.y - a.y, b.x - a.x) + rep.rotate * i,
      opacity: Math.max(0.05, 1 - rep.fade * u * 0.95),
      shape,
      stroked: drawnIndex !== undefined ? false : shape === 'meta' ? true : rep.stroked,
      drawnIndex,
      z: 0,
    })
  }
  return out
}
