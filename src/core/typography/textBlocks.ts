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
  const y = rows[row].pos + (block.anchor.baselineOffset ?? 0) * grid.baseline

  return { x, y, w, estH: estimateHeight(block, w) }
}

// Greedy word-wrap estimate — good enough for pressure-mask footprints.
// Words wrap whole in the DOM, so char-count division undershoots height.
export function estimateHeight(block: TypeBlockState, width: number): number {
  const avgChar = block.size * (0.52 + Math.max(0, block.width - 100) * 0.002 + block.tracking)
  const spaceW = avgChar * 0.55
  let lines = 1
  let lineW = 0
  for (const word of block.text.split(/\s+/)) {
    const wordW = Math.max(1, word.length) * avgChar
    if (lineW > 0 && lineW + spaceW + wordW > width) {
      lines++
      lineW = wordW
    } else {
      lineW += (lineW > 0 ? spaceW : 0) + wordW
    }
  }
  return lines * block.size * block.lineHeight
}
