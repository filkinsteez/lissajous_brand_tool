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

// Largest rect of the given aspect that fits INSIDE `outer`, centred.
// Image blocks cover-fit, so a block whose shape does not match its
// image crops it; inscribing shrinks the BLOCK instead, which keeps a
// fixed-shape artwork whole wherever the grid puts it.
export function inscribeAspect(
  outer: { x: number; y: number; w: number; h: number },
  aspect: number,
): { x: number; y: number; w: number; h: number } {
  const a = Math.max(0.01, aspect)
  const outerAspect = outer.w / Math.max(1, outer.h)
  const w = outerAspect > a ? outer.h * a : outer.w
  const h = outerAspect > a ? outer.h : outer.w / a
  return { x: outer.x + (outer.w - w) / 2, y: outer.y + (outer.h - h) / 2, w, h }
}

// An image block's rect: the free rect verbatim when the image has been
// positioned with snap OFF, else the anchor-derived cell rect (half-
// gutter inset at interior boundaries). `aspect` marks an image that
// must never be cropped — a lab composition, whose edges ARE the work —
// and inscribes that shape in the cell, so the guarantee survives every
// later grid change (curve, columns, rows, margin, gutter, shuffle)
// instead of holding only at the moment it landed. The live layer and
// the PNG export both call THIS so their rects cannot drift apart.
export function imageRect(
  grid: EditorialGrid,
  anchor: { col: number; row: number; colSpan: number; rowSpan: number },
  free?: { x: number; y: number; w: number; h: number },
  aspect?: number,
): { x: number; y: number; w: number; h: number } {
  if (free) return free
  const { x, w } = columnSpanRect(grid, anchor.col, anchor.colSpan, true)
  const { y, h } = rowSpanRect(grid, anchor.row, anchor.rowSpan, true)
  const cell = { x, y, w, h }
  return aspect && aspect > 0 ? inscribeAspect(cell, aspect) : cell
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
