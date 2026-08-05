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
  padding: number // px, content inset within a spanned cell (all sides)
  baseline: number // px rhythm unit
  anchors: { x: number; y: number; kind: 'node' | 'lattice' }[]
  // Suggested placement zones so a fresh document already reads editorial.
  headlineBand: { y: number; h: number }
  captionCell: { x: number; y: number; w: number; h: number }
}

export function columnCount(grid: EditorialGrid): number {
  return grid.columnBoundaries.length - 1
}

// Rect spanning columns [col, col+span). FLUSH by default: edges sit
// exactly on the drawn boundary lines — snapped type must land ON the
// line, not a half-gutter beside it. gutterInset=true insets interior
// edges by half a gutter (images, texture runs). grid.padding insets
// BOTH edges of every span — the cell-to-content counterpart of the
// page margin; 0 keeps the flush contract intact.
export function columnSpanRect(
  grid: EditorialGrid,
  col: number,
  span: number,
  gutterInset = false,
): { x: number; w: number } {
  const bounds = grid.columnBoundaries
  const nCols = bounds.length - 1
  const c0 = Math.max(0, Math.min(nCols - 1, col))
  const c1 = Math.max(c0 + 1, Math.min(nCols, c0 + span))
  const half = gutterInset ? grid.gutter / 2 : 0
  const pad = grid.padding ?? 0
  const x0 = bounds[c0].pos + (c0 > 0 ? half : 0) + pad
  const x1 = bounds[c1].pos - (c1 < nCols ? half : 0) - pad
  return { x: x0, w: Math.max(8, x1 - x0) }
}

// An image block's rect: the free rect verbatim when the image has been
// positioned with snap OFF, else the anchor-derived cell rect (half-
// gutter inset at interior boundaries). EVERY image obeys the same
// contract — fill the rect, cover-crop the overflow — including images
// that came back from the lab: a special never-crop mode for those made
// them behave differently from every other block, which read as a bug.
// The live layer and the PNG export both call THIS so their rects
// cannot drift apart.
export function imageRect(
  grid: EditorialGrid,
  anchor: { col: number; row: number; colSpan: number; rowSpan: number },
  free?: { x: number; y: number; w: number; h: number },
): { x: number; y: number; w: number; h: number } {
  if (free) return free
  const { x, w } = columnSpanRect(grid, anchor.col, anchor.colSpan, true)
  const { y, h } = rowSpanRect(grid, anchor.row, anchor.rowSpan, true)
  return { x, y, w, h }
}

// Vertical twin of columnSpanRect, same gutter/padding contract, so
// grid tenants (images) get breathing room on all four sides — the
// live layer and the PNG export must call the SAME function or their
// rects drift apart.
export function rowSpanRect(
  grid: EditorialGrid,
  row: number,
  span: number,
  gutterInset = false,
): { y: number; h: number } {
  const bounds = grid.rowBoundaries
  const nRows = bounds.length - 1
  const r0 = Math.max(0, Math.min(nRows - 1, row))
  const r1 = Math.max(r0 + 1, Math.min(nRows, r0 + span))
  const half = gutterInset ? grid.gutter / 2 : 0
  const pad = grid.padding ?? 0
  const y0 = bounds[r0].pos + (r0 > 0 ? half : 0) + pad
  const y1 = bounds[r1].pos - (r1 < nRows ? half : 0) - pad
  return { y: y0, h: Math.max(8, y1 - y0) }
}
