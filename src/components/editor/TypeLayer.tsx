'use client'

import { useEffect, useRef, useState } from 'react'
import type { FocusEvent, KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import { useStore } from '@/core/state/store'
import { getDerived } from '@/core/pipeline'
import { layoutTypeBlock, type BlockLayout } from '@/core/typography/textBlocks'
import { FONT_STACKS, nearestStaticWeight, variationSettings } from '@/core/typography/fonts'
import { INK, PAPER } from '@/core/state/defaults'
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

// Snap a dragged block's top-left to the grid, symmetrically: x snaps to
// column boundaries, y snaps to row boundaries — the block lands ON the
// grid lines both ways.
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

  const rows = grid.rowBoundaries
  let row = 0
  best = Infinity
  for (let i = 0; i < rows.length; i++) {
    const d = Math.abs(rows[i].pos - y)
    if (d < best) {
      best = d
      row = i
    }
  }

  return { ...block.anchor, col, row, baselineOffset: 0 }
}

// L4: primary typography as DOM — crisp, selectable, never baked into GL.
// Blocks are draggable in the artboard; drags snap to the grid and commit
// as a single history entry on release.
export function TypeLayer() {
  const project = useStore((s) => s.project)
  const selectedBlockId = useStore((s) => s.ui.selectedBlockId)
  const setUi = useStore((s) => s.setUi)
  const derived = getDerived(project)
  const fallbackTypeColor =
    project.background.mode === 'field' && project.background.ground !== 'neutral' ? PAPER : INK
  const layerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const resizeRef = useRef<{ id: string; pointerId: number } | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  // Delete/Backspace removes the selected block — unless the user is
  // typing somewhere (inputs, or a block in inline-edit mode)
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      const st = useStore.getState()
      const id = st.ui.selectedBlockId
      if (!id) return
      const ae = document.activeElement as HTMLElement | null
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) return
      e.preventDefault()
      st.apply({ typeBlocks: st.project.typeBlocks.filter((b) => b.id !== id) })
      st.setUi({ selectedBlockId: undefined })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // proximity selection: a click NEAR a block selects it, canvas-editor
  // style — tiny blocks (small type at poster scale) stay reachable even
  // though their rendered box is a few pixels tall
  useEffect(() => {
    const layer = layerRef.current
    const artboard = layer?.parentElement
    if (!artboard) return
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('.type-block')) return // direct hits already handled
      const blocksEls = layer.querySelectorAll<HTMLElement>('.type-block')
      let bestId: string | null = null
      let bestD = 16 // px reach
      blocksEls.forEach((el) => {
        const r = el.getBoundingClientRect()
        const dx = Math.max(r.left - e.clientX, 0, e.clientX - r.right)
        const dy = Math.max(r.top - e.clientY, 0, e.clientY - r.bottom)
        const d = Math.hypot(dx, dy)
        if (d < bestD) {
          bestD = d
          bestId = el.getAttribute('data-block-id')
        }
      })
      if (bestId) {
        useStore.getState().setUi({ selectedBlockId: bestId, activePanel: 'compose' })
      }
    }
    artboard.addEventListener('click', onClick)
    return () => artboard.removeEventListener('click', onClick)
  }, [])

  // double-click on empty canvas = a new text block right there, already
  // in edit mode — the canvas-editor behavior, no panel round-trip
  useEffect(() => {
    const layer = layerRef.current
    const artboard = layer?.parentElement
    if (!artboard) return
    const onDbl = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('.type-block')) return // block double-clicks edit
      const st = useStore.getState()
      const rect = layer.getBoundingClientRect()
      const scale = rect.width > 0 ? rect.width / st.project.artboard.width : 1
      const x = (e.clientX - rect.left) / scale
      const y = (e.clientY - rect.top) / scale
      const grid = getDerived(st.project).grid
      const id = `text-${Date.now().toString(36)}`
      const draft: TypeBlockState = {
        id,
        role: 'caption',
        text: 'TEXT',
        fontFamily: 'flex',
        size: 40,
        weight: 520,
        width: 100,
        opticalSize: 14,
        lineHeight: 1.25,
        tracking: 0,
        textCase: 'none',
        align: 'left',
        anchor: { col: 0, row: 0, colSpan: 2, baselineOffset: 0 },
        materialInfluence: 0.6,
      }
      draft.anchor = snapAnchor(grid, draft, x, y)
      st.apply({ typeBlocks: [...st.project.typeBlocks, draft] })
      st.setUi({ selectedBlockId: id, activePanel: 'compose' })
      setEditingId(id)
    }
    artboard.addEventListener('dblclick', onDbl)
    return () => artboard.removeEventListener('dblclick', onDbl)
  }, [])

  // entering edit mode: focus the block and select its text, the way any
  // modern page editor greets a double-click
  useEffect(() => {
    if (!editingId) return
    const el = layerRef.current?.querySelector<HTMLElement>(`[data-block-id="${editingId}"]`)
    if (!el) return
    el.focus()
    const range = document.createRange()
    range.selectNodeContents(el)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
  }, [editingId])

  const commitEdit = (block: TypeBlockState, el: HTMLElement) => {
    const text = (el.innerText ?? '').replace(/ /g, ' ').trimEnd()
    setEditingId(null)
    if (text && text !== block.text) {
      useStore.getState().apply({
        typeBlocks: useStore
          .getState()
          .project.typeBlocks.map((b) => (b.id === block.id ? { ...b, text } : b)),
      })
    }
  }

  const onEditKeyDown = (e: KeyboardEvent<HTMLDivElement>, block: TypeBlockState) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      commitEdit(block, e.currentTarget)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      // the DOM was typed into outside React, so React will not repaint an
      // unchanged text child — restore it by hand before leaving edit mode
      e.currentTarget.innerText = block.text
      setEditingId(null)
    }
  }

  const onEditBlur = (e: FocusEvent<HTMLDivElement>, block: TypeBlockState) => {
    if (editingId === block.id) commitEdit(block, e.currentTarget)
  }

  const artboardScale = (): number => {
    const el = layerRef.current
    if (!el) return 1
    const rect = el.getBoundingClientRect()
    return rect.width > 0 ? rect.width / project.artboard.width : 1
  }

  const onPointerDown = (e: ReactPointerEvent, block: TypeBlockState, box: BlockLayout) => {
    if (e.button !== 0) return
    if (editingId === block.id) return // editing: the pointer belongs to the caret
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

  // ---- width handle: drag the block's right edge; the span snaps to
  // grid columns, so widths stay disciplined while feeling free
  const onResizeDown = (e: ReactPointerEvent, block: TypeBlockState) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    resizeRef.current = { id: block.id, pointerId: e.pointerId }
    useStore.getState().setUi({ dragging: true, selectedBlockId: block.id })
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // synthetic pointers have no active pointer to capture
    }
  }

  const onResizeMove = (e: ReactPointerEvent, block: TypeBlockState) => {
    const rs = resizeRef.current
    if (!rs || rs.id !== block.id || e.pointerId !== rs.pointerId) return
    const layer = layerRef.current
    if (!layer) return
    const rect = layer.getBoundingClientRect()
    const state = useStore.getState()
    const artX = ((e.clientX - rect.left) / Math.max(rect.width, 1)) * state.project.artboard.width
    const grid = getDerived(state.project).grid
    const bounds = grid.columnBoundaries
    const nCols = bounds.length - 1
    const blk = state.project.typeBlocks.find((b) => b.id === block.id)
    if (!blk) return
    let span = 1
    let best = Infinity
    for (let i = blk.anchor.col + 1; i <= nCols; i++) {
      const d = Math.abs(bounds[i].pos - artX)
      if (d < best) {
        best = d
        span = i - blk.anchor.col
      }
    }
    if (span !== blk.anchor.colSpan) {
      state.setTransient({
        typeBlocks: state.project.typeBlocks.map((b) =>
          b.id === block.id ? { ...b, anchor: { ...b.anchor, colSpan: span } } : b,
        ),
      })
    }
  }

  const onResizeUp = (e: ReactPointerEvent, block: TypeBlockState) => {
    const rs = resizeRef.current
    if (!rs || rs.id !== block.id) return
    resizeRef.current = null
    useStore.getState().commitTransient()
    useStore.getState().setUi({ dragging: false })
  }

  return (
    <div className="artboard-layer type-layer" ref={layerRef}>
      {project.typeBlocks.map((block) => {
        const box = layoutTypeBlock(block, derived.grid)
        const editing = editingId === block.id
        return (
          <div
            key={block.id}
            data-block-id={block.id}
            className={
              'type-block' +
              (selectedBlockId === block.id ? ' selected' : '') +
              (editing ? ' editing' : '')
            }
            contentEditable={editing}
            suppressContentEditableWarning
            spellCheck={false}
            // while editing the click belongs to the caret: re-selecting
            // would churn a re-render under the cursor for no reason
            onClick={
              editing
                ? undefined
                : () => setUi({ selectedBlockId: block.id, activePanel: 'compose' })
            }
            onDoubleClick={() => setEditingId(block.id)}
            onKeyDown={editing ? (e) => onEditKeyDown(e, block) : undefined}
            onBlur={editing ? (e) => onEditBlur(e, block) : undefined}
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
              color: block.color ?? fallbackTypeColor,
              WebkitTextStroke: block.strokeWidth
                ? `${block.strokeWidth}px ${block.strokeColor ?? INK}`
                : undefined,
              background: block.background,
            }}
          >
            {block.text}
            {selectedBlockId === block.id && !editing ? (
              <>
                <span
                  className="type-block-handle"
                  aria-label="Resize width"
                  onPointerDown={(e) => onResizeDown(e, block)}
                  onPointerMove={(e) => onResizeMove(e, block)}
                  onPointerUp={(e) => onResizeUp(e, block)}
                  onPointerCancel={(e) => onResizeUp(e, block)}
                  onClick={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => e.stopPropagation()}
                />
                <button
                  className="type-block-delete"
                  aria-label="Delete text block"
                  onPointerDown={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation()
                    const st = useStore.getState()
                    st.apply({ typeBlocks: st.project.typeBlocks.filter((b) => b.id !== block.id) })
                    st.setUi({ selectedBlockId: undefined })
                  }}
                >
                  ×
                </button>
              </>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
