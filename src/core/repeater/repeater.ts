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
    out.push({
      x,
      y,
      r: Math.max(0.5, baseR * scale),
      rotate: spoke + rep.rotate * i,
      opacity: Math.max(0.05, 1 - rep.fade * u * 0.95),
      shape,
      stroked: shape === 'meta' ? true : rep.stroked,
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
