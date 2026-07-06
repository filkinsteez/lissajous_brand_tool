export type GridGuide = {
  id: string
  axis: 'x' | 'y'
  pos: number // artboard px
  sources: number[] // ids of the curve nodes this guide derives from
}

export type EditorialGrid = {
  margins: { top: number; right: number; bottom: number; left: number }
  contentBox: { x: number; y: number; w: number; h: number }
  // Column/row BOUNDARIES including both content-box edges,
  // sorted ascending. N columns → N+1 x-boundaries.
  columnBoundaries: GridGuide[]
  rowBoundaries: GridGuide[]
  gutter: number // px, centered on interior boundaries
  baseline: number // px rhythm unit
  anchors: { x: number; y: number; kind: 'node' | 'lattice' }[]
  // Suggested placement zones so a fresh document already reads editorial.
  headlineBand: { y: number; h: number }
  captionCell: { x: number; y: number; w: number; h: number }
}

export function columnCount(grid: EditorialGrid): number {
  return grid.columnBoundaries.length - 1
}

// Rect spanning columns [col, col+span) minus gutters.
export function columnSpanRect(
  grid: EditorialGrid,
  col: number,
  span: number,
): { x: number; w: number } {
  const bounds = grid.columnBoundaries
  const nCols = bounds.length - 1
  const c0 = Math.max(0, Math.min(nCols - 1, col))
  const c1 = Math.max(c0 + 1, Math.min(nCols, c0 + span))
  const half = grid.gutter / 2
  const x0 = bounds[c0].pos + (c0 > 0 ? half : 0)
  const x1 = bounds[c1].pos - (c1 < nCols ? half : 0)
  return { x: x0, w: Math.max(8, x1 - x0) }
}
