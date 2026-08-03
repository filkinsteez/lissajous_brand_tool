import type { EditorialGrid } from '@/core/grid/types'

// Grid magnetism for free-position canvas objects (drawn shapes). Type
// and images snap by their data model (col/row anchors); drawn shapes
// are free px, so they snap softly instead: an edge within THRESHOLD
// artboard px of a grid line lands exactly on it, everything further
// moves untouched.
export const SNAP_THRESHOLD = 10

export type SnapLines = { xs: number[]; ys: number[] }

export function gridSnapLines(grid: EditorialGrid, artW: number, artH: number): SnapLines {
  return {
    xs: [0, ...grid.columnBoundaries.map((g) => g.pos), artW],
    ys: [0, ...grid.rowBoundaries.map((g) => g.pos), artH],
  }
}

// The strongest correction that lands any of `values` on any line.
// Returns the correction AND the line it landed on, so the gesture can
// flash a smart guide there; null = nothing within reach.
export type AxisSnap = { delta: number; line: number }

export function snapAxis(
  values: number[],
  lines: number[],
  threshold = SNAP_THRESHOLD,
): AxisSnap | null {
  let best: AxisSnap | null = null
  let bestDist = threshold
  for (const v of values) {
    for (const line of lines) {
      const d = Math.abs(line - v)
      if (d < bestDist) {
        bestDist = d
        best = { delta: line - v, line }
      }
    }
  }
  return best
}
