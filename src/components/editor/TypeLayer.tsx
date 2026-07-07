'use client'

import { useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { useStore } from '@/core/state/store'
import { getDerived } from '@/core/pipeline'
import { layoutTypeBlock, type BlockLayout } from '@/core/typography/textBlocks'
import { applyCase, FONT_STACKS, nearestStaticWeight, variationSettings } from '@/core/typography/fonts'
import { getPressureMask } from '@/core/typography/pressureMask'
import { lbsDebug } from '@/core/state/debug'
import { INK } from '@/core/state/defaults'
import type { EditorialGrid } from '@/core/grid/types'
import type { TypeBlockState } from '@/core/state/types'

type DragState = {
  id: string
  pointerId: number
  startClientX: number
  startClientY: number
  boxX: number
  boxY: number
  moved: boolean
}

// Snap a dragged block's top-left to the grid: columns snap to column
// boundaries, y snaps to the baseline rhythm expressed as row + offset.
function snapAnchor(
  grid: EditorialGrid,
  block: TypeBlockState,
  x: number,
  y: number,
): TypeBlockState['anchor'] {
  const nCols = grid.columnBoundaries.length - 1
  let col = 0
  let best = Infinity
  for (let i = 0; i <= nCols; i++) {
    const d = Math.abs(grid.columnBoundaries[i].pos - x)
    if (d < best) {
      best = d
      col = i
    }
  }
  col = Math.max(0, Math.min(nCols - 1, col))

  const box = grid.contentBox
  const ySnapped = box.y + Math.round((y - box.y) / grid.baseline) * grid.baseline
  const rows = grid.rowBoundaries
  let row = 0
  best = Infinity
  for (let i = 0; i < rows.length; i++) {
    const d = Math.abs(rows[i].pos - ySnapped)
    if (d < best) {
      best = d
      row = i
    }
  }
  const baselineOffset = Math.round((ySnapped - rows[row].pos) / grid.baseline)

  return { ...block.anchor, col, row, baselineOffset }
}

// L4: primary typography as DOM — crisp, selectable, never baked into GL.
// Blocks are draggable in the artboard; drags snap to the grid and commit
// as a single history entry on release.
export function TypeLayer() {
  const project = useStore((s) => s.project)
  const selectedBlockId = useStore((s) => s.ui.selectedBlockId)
  const setUi = useStore((s) => s.setUi)
  const derived = getDerived(project)
  const layerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)

  // keep the pressure mask warm + inspectable as type changes
  const mask = getPressureMask(project, derived.grid)
  lbsDebug('pressureMaskSum', Math.round(mask.data.reduce((a, v) => a + v, 0)))

  const artboardScale = (): number => {
    const el = layerRef.current
    if (!el) return 1
    const rect = el.getBoundingClientRect()
    return rect.width > 0 ? rect.width / project.artboard.width : 1
  }

  const onPointerDown = (e: ReactPointerEvent, block: TypeBlockState, box: BlockLayout) => {
    if (e.button !== 0) return
    e.preventDefault() // keeps text selection from hijacking the drag
    dragRef.current = {
      id: block.id,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      boxX: box.x,
      boxY: box.y,
      moved: false,
    }
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // synthetic pointers (tests, automation) have no active pointer to capture
    }
  }

  const onPointerMove = (e: ReactPointerEvent, block: TypeBlockState) => {
    const drag = dragRef.current
    if (!drag || drag.id !== block.id || e.pointerId !== drag.pointerId) return
    const scale = artboardScale()
    const dxPx = e.clientX - drag.startClientX
    const dyPx = e.clientY - drag.startClientY
    if (!drag.moved) {
      if (Math.hypot(dxPx, dyPx) < 4) return
      drag.moved = true
      useStore.getState().setUi({ dragging: true, selectedBlockId: block.id, activePanel: 'compose' })
    }
    const state = useStore.getState()
    const grid = getDerived(state.project).grid
    const anchor = snapAnchor(grid, block, drag.boxX + dxPx / scale, drag.boxY + dyPx / scale)
    state.setTransient({
      typeBlocks: state.project.typeBlocks.map((b) =>
        b.id === block.id ? { ...b, anchor } : b,
      ),
    })
  }

  const onPointerUp = (e: ReactPointerEvent, block: TypeBlockState) => {
    const drag = dragRef.current
    if (!drag || drag.id !== block.id) return
    dragRef.current = null
    if (drag.moved) {
      useStore.getState().commitTransient()
      useStore.getState().setUi({ dragging: false })
    }
  }

  return (
    <div className="artboard-layer type-layer" ref={layerRef}>
      {project.typeBlocks.map((block) => {
        const box = layoutTypeBlock(block, derived.grid)
        return (
          <div
            key={block.id}
            data-block-id={block.id}
            className={selectedBlockId === block.id ? 'type-block selected' : 'type-block'}
            onClick={() => setUi({ selectedBlockId: block.id, activePanel: 'compose' })}
            onPointerDown={(e) => onPointerDown(e, block, box)}
            onPointerMove={(e) => onPointerMove(e, block)}
            onPointerUp={(e) => onPointerUp(e, block)}
            onPointerCancel={(e) => onPointerUp(e, block)}
            style={{
              left: box.x,
              top: box.y,
              width: box.w,
              fontFamily: FONT_STACKS[block.fontFamily],
              fontSize: block.size,
              fontWeight: nearestStaticWeight(block.weight),
              fontVariationSettings: variationSettings(block),
              lineHeight: block.lineHeight,
              letterSpacing: `${block.tracking}em`,
              textAlign: block.align,
              color: INK,
            }}
          >
            {applyCase(block.text, block.textCase)}
          </div>
        )
      })}
    </div>
  )
}
