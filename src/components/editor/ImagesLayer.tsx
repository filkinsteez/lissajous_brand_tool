'use client'

import { useEffect, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { useStore } from '@/core/state/store'
import { getDerived } from '@/core/pipeline'
import { imageRect, type EditorialGrid } from '@/core/grid/types'
import { layoutTypeBlock } from '@/core/typography/textBlocks'
import { importImageFile } from '@/core/images'
import { suppressNextClick } from './clickGuard'
import type { ImageItem } from '@/core/state/types'

// L2: imported images as CANVAS OBJECTS — click to select, drag to move,
// corner handle to resize, Delete to remove. Upload by dropping a file
// anywhere on the canvas, or via the IMG tool in the strip.
//
// THE MAGNET CONTRACT: with snap ON an image is a grid tenant — drags
// land on cells, resizes land on boundaries. With snap OFF it is a free
// object — drag and resize in raw artboard px (stored as `free`, which
// a later snap-ON gesture clears back to an anchor).

const nearestIndex = (boundaries: { pos: number }[], v: number): number => {
  let best = 0
  let bestD = Infinity
  for (let i = 0; i < boundaries.length; i++) {
    const d = Math.abs(boundaries[i].pos - v)
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  return best
}

// place an anchor so the image's top-left lands on the nearest cell to
// (x, y), spans clamped inside the grid
export function placeImageAnchor(
  grid: EditorialGrid,
  x: number,
  y: number,
  colSpan = 2,
  rowSpan = 3,
): ImageItem['anchor'] {
  const nCols = grid.columnBoundaries.length - 1
  const nRows = grid.rowBoundaries.length - 1
  const span = Math.max(1, Math.min(colSpan, nCols))
  const rSpan = Math.max(1, Math.min(rowSpan, nRows))
  const col = Math.max(0, Math.min(nCols - span, nearestIndex(grid.columnBoundaries, x)))
  const row = Math.max(0, Math.min(nRows - rSpan, nearestIndex(grid.rowBoundaries, y)))
  return { col, row, colSpan: span, rowSpan: rSpan }
}

export function ImagesLayer() {
  const project = useStore((s) => s.project)
  if (!project.images.length) return <DropTarget />
  return <ImagesLayerInner />
}

// even with no images yet, the canvas accepts a dropped file
function DropTarget() {
  useCanvasImageDrop()
  return null
}

// shared: drop an image file on the artboard to import it right there
function useCanvasImageDrop() {
  useEffect(() => {
    const artboard = document.querySelector('.artboard')
    if (!(artboard instanceof HTMLElement)) return
    const onOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault()
    }
    const onDrop = (e: DragEvent) => {
      const files = e.dataTransfer?.files
      if (!files?.length) return
      e.preventDefault()
      const rect = artboard.getBoundingClientRect()
      void (async () => {
        const st = useStore.getState()
        const scale = rect.width > 0 ? rect.width / st.project.artboard.width : 1
        const x = (e.clientX - rect.left) / scale
        const y = (e.clientY - rect.top) / scale
        try {
          const src = await importImageFile(files[0])
          const s2 = useStore.getState()
          const grid = getDerived(s2.project).grid
          const id = `img-${Date.now().toString(36)}`
          s2.apply({
            images: [...s2.project.images, { id, src, anchor: placeImageAnchor(grid, x, y) }],
          })
          s2.setUi({
            selectedImageIds: [id],
            selectedBlockId: undefined,
            selectedBlockIds: [],
          })
        } catch {
          // unreadable file — skip it
        }
      })()
    }
    artboard.addEventListener('dragover', onOver)
    artboard.addEventListener('drop', onDrop)
    return () => {
      artboard.removeEventListener('dragover', onOver)
      artboard.removeEventListener('drop', onDrop)
    }
  }, [])
}

type Rect = { x: number; y: number; w: number; h: number }

type ImgDrag = {
  id: string
  pointerId: number
  startX: number
  startY: number
  startCol: number
  startRow: number
  startRect: Rect // the rect as rendered when the drag began
  moved: boolean
  alt: boolean // alt-drag: a copy stays behind
}

// scale from any corner: the dragged corner's edges snap to grid
// boundaries while the opposite corner stays pinned
type Corner = 'nw' | 'ne' | 'sw' | 'se'
const CORNERS: Corner[] = ['nw', 'ne', 'sw', 'se']

function ImagesLayerInner() {
  const project = useStore((s) => s.project)
  const selectedImageIds = useStore((s) => s.ui.selectedImageIds)
  const grid = getDerived(project).grid
  const layerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<ImgDrag | null>(null)
  const resizeRef = useRef<{
    id: string
    pointerId: number
    corner: Corner
    startRect: Rect
  } | null>(null)
  useCanvasImageDrop()

  const bg = project.images.find((im) => im.id === project.bgImageId) ?? null
  // arr- assets belong to the array register — never drawn as blocks
  const blocks = project.images.filter(
    (im) => im.id !== project.bgImageId && !im.id.startsWith('arr-'),
  )
  // keyboard (Delete / Escape / arrows / Ctrl+D / Ctrl+]) lives in the
  // TypeLayer's canvas handler, which owns the whole mixed selection

  const artboardScale = (): number => {
    const el = layerRef.current
    if (!el) return 1
    const rect = el.getBoundingClientRect()
    return rect.width > 0 ? rect.width / project.artboard.width : 1
  }

  // when the grabbed image is part of a bigger selection, the whole
  // mixed group (images AND text blocks) rides the drag. Anchors drive
  // the snap-ON path; start RECTS drive the snap-OFF (free) path.
  const groupImgRef = useRef<Map<string, ImageItem['anchor']> | null>(null)
  const groupTextRef = useRef<Map<
    string,
    { col: number; row: number; colSpan: number; baselineOffset?: number }
  > | null>(null)
  const groupImgRectRef = useRef<Map<string, Rect> | null>(null)
  const groupTextRectRef = useRef<Map<string, { x: number; y: number; w: number }> | null>(null)

  const onPointerDown = (e: ReactPointerEvent, im: ImageItem) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const st = useStore.getState()
    const g = getDerived(st.project).grid
    const imgIds = st.ui.selectedImageIds
    const textIds = st.ui.selectedBlockIds
    if (imgIds.includes(im.id) && imgIds.length + textIds.length > 1) {
      const groupImgs = st.project.images.filter((x) => imgIds.includes(x.id))
      const groupTexts = st.project.typeBlocks.filter((b) => textIds.includes(b.id))
      groupImgRef.current = new Map(groupImgs.map((x) => [x.id, { ...x.anchor }]))
      groupTextRef.current = new Map(groupTexts.map((b) => [b.id, { ...b.anchor }]))
      groupImgRectRef.current = new Map(
        groupImgs.map((x) => [x.id, imageRect(g, x.anchor, x.free)]),
      )
      groupTextRectRef.current = new Map(
        groupTexts.map((b) => {
          const box = layoutTypeBlock(b, g)
          return [b.id, { x: box.x, y: box.y, w: box.w }]
        }),
      )
    } else {
      groupImgRef.current = null
      groupTextRef.current = null
      groupImgRectRef.current = null
      groupTextRectRef.current = null
    }
    dragRef.current = {
      id: im.id,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startCol: im.anchor.col,
      startRow: im.anchor.row,
      startRect: imageRect(g, im.anchor, im.free),
      moved: false,
      alt: e.altKey,
    }
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // synthetic pointers have no active pointer to capture
    }
  }

  const onPointerMove = (e: ReactPointerEvent, im: ImageItem) => {
    const drag = dragRef.current
    if (!drag || drag.id !== im.id || e.pointerId !== drag.pointerId) return
    const scale = artboardScale()
    const dx = (e.clientX - drag.startX) / scale
    const dy = (e.clientY - drag.startY) / scale
    if (!drag.moved) {
      if (Math.hypot(dx, dy) * scale < 4) return
      drag.moved = true
      const st = useStore.getState()
      const keepSelection = groupImgRef.current !== null
      if (drag.alt) {
        // alt-drag duplicate: copies keep the original anchors
        const dragImgIds = groupImgRef.current ? [...groupImgRef.current.keys()] : [im.id]
        const clones = st.project.images
          .filter((x) => dragImgIds.includes(x.id))
          .map((x, i) => ({ ...x, id: `img-${Date.now().toString(36)}-c${i}` }))
        st.apply({ images: [...st.project.images, ...clones] })
      }
      st.setUi({
        dragging: true,
        ...(keepSelection
          ? {}
          : {
              selectedImageIds: [im.id],
              selectedBlockId: undefined,
              selectedBlockIds: [],
            }),
      })
    }
    const state = useStore.getState()
    const g = getDerived(state.project).grid

    // SNAP OFF: pure translation of the start rects — position anywhere
    if (!state.ui.snap) {
      const imgRects = groupImgRectRef.current
      const textRects = groupTextRectRef.current
      if (imgRects) {
        state.setTransient({
          images: state.project.images.map((x) => {
            const r = imgRects.get(x.id)
            return r ? { ...x, free: { x: r.x + dx, y: r.y + dy, w: r.w, h: r.h } } : x
          }),
          typeBlocks: state.project.typeBlocks.map((b) => {
            const r = textRects?.get(b.id)
            return r ? { ...b, free: { x: r.x + dx, y: r.y + dy, w: r.w } } : b
          }),
        })
      } else {
        const r = drag.startRect
        state.setTransient({
          images: state.project.images.map((x) =>
            x.id === im.id ? { ...x, free: { x: r.x + dx, y: r.y + dy, w: r.w, h: r.h } } : x,
          ),
        })
      }
      return
    }

    // SNAP ON: grid tenancy — anchors land on cells, free rects clear
    const startX = g.columnBoundaries[Math.min(drag.startCol, g.columnBoundaries.length - 1)].pos
    const startY = g.rowBoundaries[Math.min(drag.startRow, g.rowBoundaries.length - 1)].pos
    const anchor = placeImageAnchor(
      g,
      startX + dx,
      startY + dy,
      im.anchor.colSpan,
      im.anchor.rowSpan,
    )
    const groupImgs = groupImgRef.current
    if (groupImgs) {
      const startAnchor = groupImgs.get(im.id)
      if (!startAnchor) return
      const dCol = anchor.col - startAnchor.col
      const dRow = anchor.row - startAnchor.row
      const cols = g.columnBoundaries.length - 1
      const rws = g.rowBoundaries.length - 1
      const groupTexts = groupTextRef.current
      state.setTransient({
        images: state.project.images.map((x) => {
          const s = groupImgs.get(x.id)
          if (!s) return x
          return {
            ...x,
            free: undefined,
            anchor: {
              ...s,
              col: Math.max(0, Math.min(cols - s.colSpan, s.col + dCol)),
              row: Math.max(0, Math.min(rws - s.rowSpan, s.row + dRow)),
            },
          }
        }),
        typeBlocks: state.project.typeBlocks.map((b) => {
          const s = groupTexts?.get(b.id)
          if (!s) return b
          return {
            ...b,
            free: undefined,
            anchor: {
              ...s,
              col: Math.max(0, Math.min(cols - 1, s.col + dCol)),
              row: Math.max(0, Math.min(rws, s.row + dRow)),
            },
          }
        }),
      })
    } else {
      state.setTransient({
        images: state.project.images.map((x) =>
          x.id === im.id ? { ...x, anchor, free: undefined } : x,
        ),
      })
    }
  }

  const onPointerUp = (e: ReactPointerEvent, im: ImageItem) => {
    const drag = dragRef.current
    if (!drag || drag.id !== im.id) return
    dragRef.current = null
    groupImgRef.current = null
    groupTextRef.current = null
    if (drag.moved) {
      suppressNextClick()
      useStore.getState().commitTransient()
      useStore.getState().setUi({ dragging: false })
    }
    // plain clicks bubble to the artboard's stack-cycling selection
  }

  // corner handles: the dragged corner's edges snap to boundaries, the
  // opposite corner is the pinned one — so growth works in every
  // direction, including against the grid's edges
  const onResizeDown = (e: ReactPointerEvent, im: ImageItem, corner: Corner) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    const g = getDerived(useStore.getState().project).grid
    resizeRef.current = {
      id: im.id,
      pointerId: e.pointerId,
      corner,
      startRect: imageRect(g, im.anchor, im.free),
    }
    useStore.getState().setUi({ dragging: true, selectedImageIds: [im.id] })
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // synthetic pointers have no active pointer to capture
    }
  }

  const onResizeMove = (e: ReactPointerEvent, im: ImageItem) => {
    const rs = resizeRef.current
    if (!rs || rs.id !== im.id || e.pointerId !== rs.pointerId) return
    const layer = layerRef.current
    if (!layer) return
    const rect = layer.getBoundingClientRect()
    const state = useStore.getState()
    const g = getDerived(state.project).grid
    const scale = rect.width > 0 ? rect.width / state.project.artboard.width : 1
    const artX = (e.clientX - rect.left) / scale
    const artY = (e.clientY - rect.top) / scale
    const cols = g.columnBoundaries.length - 1
    const rws = g.rowBoundaries.length - 1
    const blk = state.project.images.find((x) => x.id === im.id)
    if (!blk) return

    // SNAP OFF: free resize — the dragged corner follows the pointer,
    // the opposite corner stays pinned, raw px
    if (!state.ui.snap) {
      const r = rs.startRect
      let x0 = r.x
      let y0 = r.y
      let x1 = r.x + r.w
      let y1 = r.y + r.h
      if (rs.corner.includes('w')) x0 = Math.min(artX, x1 - 24)
      else x1 = Math.max(artX, x0 + 24)
      if (rs.corner.includes('n')) y0 = Math.min(artY, y1 - 24)
      else y1 = Math.max(artY, y0 + 24)
      state.setTransient({
        images: state.project.images.map((x) =>
          x.id === im.id ? { ...x, free: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } } : x,
        ),
      })
      return
    }

    const bCol = nearestIndex(g.columnBoundaries, artX)
    const bRow = nearestIndex(g.rowBoundaries, artY)
    let c0 = blk.anchor.col
    let c1 = blk.anchor.col + blk.anchor.colSpan
    let r0 = blk.anchor.row
    let r1 = blk.anchor.row + blk.anchor.rowSpan
    if (rs.corner.includes('w')) c0 = Math.max(0, Math.min(c1 - 1, bCol))
    else c1 = Math.max(c0 + 1, Math.min(cols, bCol))
    if (rs.corner.includes('n')) r0 = Math.max(0, Math.min(r1 - 1, bRow))
    else r1 = Math.max(r0 + 1, Math.min(rws, bRow))
    const anchor = { col: c0, row: r0, colSpan: c1 - c0, rowSpan: r1 - r0 }
    if (
      blk.free !== undefined ||
      anchor.col !== blk.anchor.col ||
      anchor.row !== blk.anchor.row ||
      anchor.colSpan !== blk.anchor.colSpan ||
      anchor.rowSpan !== blk.anchor.rowSpan
    ) {
      state.setTransient({
        images: state.project.images.map((x) =>
          x.id === im.id ? { ...x, anchor, free: undefined } : x,
        ),
      })
    }
  }

  const onResizeUp = (e: ReactPointerEvent, im: ImageItem) => {
    const rs = resizeRef.current
    if (!rs || rs.id !== im.id) return
    resizeRef.current = null
    suppressNextClick()
    useStore.getState().commitTransient()
    useStore.getState().setUi({ dragging: false })
  }

  return (
    <div className="artboard-layer images-layer" ref={layerRef}>
      {bg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={bg.src} alt="" className="bg-image" />
      ) : null}
      {blocks.map((im) => {
        // anchored images get the half-gutter cell rect; free images sit
        // exactly where they were dropped — one shared function decides
        const { x, y, w, h } = imageRect(grid, im.anchor, im.free)
        const selected = selectedImageIds.includes(im.id)
        return (
          <div
            key={im.id}
            className={selected ? 'image-block-wrap selected' : 'image-block-wrap'}
            data-image-id={im.id}
            style={{ left: x, top: y, width: w, height: h }}
            onPointerDown={(e) => onPointerDown(e, im)}
            onPointerMove={(e) => onPointerMove(e, im)}
            onPointerUp={(e) => onPointerUp(e, im)}
            onPointerCancel={(e) => onPointerUp(e, im)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={im.src} alt="" className="image-block" draggable={false} />
            {selected ? (
              <>
                {/* deletion is the Delete key — no chip cluttering the box */}
                {CORNERS.map((corner) => (
                  <span
                    key={corner}
                    className={`image-resize-handle corner-${corner}`}
                    aria-label={`Resize image (${corner})`}
                    onPointerDown={(e) => onResizeDown(e, im, corner)}
                    onPointerMove={(e) => onResizeMove(e, im)}
                    onPointerUp={(e) => onResizeUp(e, im)}
                    onPointerCancel={(e) => onResizeUp(e, im)}
                  />
                ))}
              </>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
