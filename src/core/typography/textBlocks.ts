import type { TypeBlockState } from '@/core/state/types'
import { columnSpanRect, type EditorialGrid } from '@/core/grid/types'

export type BlockLayout = {
  x: number
  y: number
  w: number
  estH: number // estimated height, used by the pressure mask
}

// Blocks anchor to grid geometry: x/width from a column span, y from a row
// boundary. Everything is artboard px; the DOM/text engine does the rest.
export function layoutTypeBlock(block: TypeBlockState, grid: EditorialGrid): BlockLayout {
  const nCols = grid.columnBoundaries.length - 1
  const col = Math.max(0, Math.min(nCols - 1, block.anchor.col))
  const span = Math.max(1, Math.min(nCols - col, block.anchor.colSpan))
  const { x, w } = columnSpanRect(grid, col, span)

  const rows = grid.rowBoundaries
  const row = Math.max(0, Math.min(rows.length - 1, block.anchor.row))
  const y = rows[row].pos

  return { x, y, w, estH: estimateHeight(block, w) }
}

// Rough wrap estimate — good enough for pressure-mask footprints.
export function estimateHeight(block: TypeBlockState, width: number): number {
  const avgChar = block.size * (0.5 + Math.max(0, block.width - 100) * 0.002 + block.tracking)
  const charsPerLine = Math.max(1, Math.floor(width / Math.max(1, avgChar)))
  const lines = Math.max(1, Math.ceil(block.text.length / charsPerLine))
  return lines * block.size * block.lineHeight
}
