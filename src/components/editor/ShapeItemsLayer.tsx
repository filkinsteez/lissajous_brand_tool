'use client'

import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { useStore, type CanvasTool } from '@/core/state/store'
import { shapePathD, dragToBox } from '@/core/canvas/shapeItems'
import { consumedShapeIds } from '@/core/canvas/shapeProtos'
import { snapAxis, type SnapLines } from '@/core/canvas/snap'
import { getDerived } from '@/core/pipeline'
import { PAPER } from '@/core/state/defaults'
import { clickGuard } from './clickGuard'
import type { ShapeItem, ShapeItemKind } from '@/core/state/types'

const SHAPE_TOOLS: CanvasTool[] = ['rect', 'ellipse', 'poly', 'star', 'line', 'blob']

type Draft = { kind: ShapeItemKind; x0: number; y0: number; x1: number; y1: number }

type DragState = {
  id: string
  pointerId: number
  startX: number
  startY: number
  origins: Map<string, { x: number; y: number }>
  moved: boolean
  alt: boolean
}

type ResizeState = { id: string; pointerId: number; corner: 'nw' | 'ne' | 'sw' | 'se' }

// Drawn primitives live: drag with an armed shape tool to draw one,
// then it is a full canvas object — click/marquee select, drag to move
// (free position — drawn marks are instruments, not grid tenants),
// corner-resize, alt-drag duplicate, Delete. SVG for crisp edges; the
// export replays the same path data through Path2D.
export function ShapeItemsLayer() {
  const shapes = useStore((s) => s.project.shapes)
  const layers = useStore((s) => s.project.layers)
  const isolateLayerId = useStore((s) => s.ui.isolateLayerId)
  const selectedShapeIds = useStore((s) => s.ui.selectedShapeIds)
  const artW = useStore((s) => s.project.artboard.width)
  const artH = useStore((s) => s.project.artboard.height)

  // consumed masters live inside their effectors, not on the canvas;
  // isolation flips it — only the isolated effector's masters render
  const isolateLayer = layers.find((l) => l.id === isolateLayerId)
  const isolating = !!isolateLayer && isolateLayer.params.sourceShapeIds.length > 0
  const consumed = consumedShapeIds(layers)
  const visibleShapes = isolating
    ? shapes.filter((s) => isolateLayer.params.sourceShapeIds.includes(s.id))
    : shapes.filter((s) => !consumed.has(s.id))
  const layerRef = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  // smart guides: the grid lines the current gesture is snapped to —
  // the flash of magenta is what makes the magnet legible
  const [guides, setGuides] = useState<{ xs: number[]; ys: number[] }>({ xs: [], ys: [] })
  const dragRef = useRef<DragState | null>(null)
  const resizeRef = useRef<ResizeState | null>(null)

  const clearGuides = () => setGuides((g) => (g.xs.length || g.ys.length ? { xs: [], ys: [] } : g))

  const toArt = (clientX: number, clientY: number) => {
    const el = layerRef.current
    if (!el) return { x: 0, y: 0, scale: 1 }
    const r = el.getBoundingClientRect()
    const scale = r.width > 0 ? r.width / artW : 1
    return { x: (clientX - r.left) / scale, y: (clientY - r.top) / scale, scale }
  }

  // Snap targets, read fresh per gesture: the canvas frame (edges +
  // centers), the GRID's column/row boundaries (what the magnet
  // promises — a handful of real lines, not the full lattice of
  // intersections), and OTHER objects' edges and centers. `exclude`
  // keeps a dragged selection from snapping to itself.
  const snapLines = (exclude?: Iterable<string>): SnapLines | null => {
    const st = useStore.getState()
    if (!st.ui.snap) return null
    const xs = [0, artW / 2, artW]
    const ys = [0, artH / 2, artH]
    const grid = getDerived(st.project).grid
    for (const b of grid.columnBoundaries) xs.push(b.pos)
    for (const b of grid.rowBoundaries) ys.push(b.pos)
    const skip = new Set(exclude ?? [])
    const consumed = consumedShapeIds(st.project.layers)
    for (const s of st.project.shapes) {
      if (skip.has(s.id) || consumed.has(s.id)) continue
      xs.push(s.x, s.x + s.w / 2, s.x + s.w)
      ys.push(s.y, s.y + s.h / 2, s.y + s.h)
    }
    // images and type blocks measure through the DOM — their rects are
    // grid-derived and live in sibling layers
    const el = layerRef.current
    const artboard = el?.parentElement
    if (el && artboard) {
      const r = el.getBoundingClientRect()
      const scale = r.width > 0 ? r.width / artW : 1
      artboard.querySelectorAll('.image-block-wrap, .type-block').forEach((n) => {
        const b = n.getBoundingClientRect()
        const x0 = (b.left - r.left) / scale
        const y0 = (b.top - r.top) / scale
        const w = b.width / scale
        const h = b.height / scale
        xs.push(x0, x0 + w / 2, x0 + w)
        ys.push(y0, y0 + h / 2, y0 + h)
      })
    }
    return { xs, ys }
  }

  // drawing: an armed shape tool claims the artboard drag
  useEffect(() => {
    const layer = layerRef.current
    const artboard = layer?.parentElement
    if (!artboard) return
    let active: Draft | null = null

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return
      const tool = useStore.getState().ui.tool
      if (!SHAPE_TOOLS.includes(tool)) return
      // isolation edits the masters that exist — no drawing into it
      if (useStore.getState().ui.isolateLayerId) return
      e.preventDefault()
      const p = toArt(e.clientX, e.clientY)
      const lines = snapLines()
      if (lines) {
        const sx = snapAxis([p.x], lines.xs)
        const sy = snapAxis([p.y], lines.ys)
        if (sx) p.x += sx.delta
        if (sy) p.y += sy.delta
        setGuides({ xs: sx ? [sx.line] : [], ys: sy ? [sy.line] : [] })
      }
      active = { kind: tool as ShapeItemKind, x0: p.x, y0: p.y, x1: p.x, y1: p.y }
      setDraft(active)
    }
    const onMove = (e: PointerEvent) => {
      if (!active) return
      const p = toArt(e.clientX, e.clientY)
      // shift constrains to a square (snap would break squareness — skip it)
      let x1 = p.x
      let y1 = p.y
      if (e.shiftKey) {
        const dx = x1 - active.x0
        const dy = y1 - active.y0
        const m = Math.max(Math.abs(dx), Math.abs(dy))
        x1 = active.x0 + Math.sign(dx || 1) * m
        y1 = active.y0 + Math.sign(dy || 1) * m
        clearGuides()
      } else {
        const lines = snapLines()
        if (lines) {
          const sx = snapAxis([x1], lines.xs)
          const sy = snapAxis([y1], lines.ys)
          if (sx) x1 += sx.delta
          if (sy) y1 += sy.delta
          setGuides({ xs: sx ? [sx.line] : [], ys: sy ? [sy.line] : [] })
        }
      }
      active = { ...active, x1, y1 }
      setDraft(active)
    }
    const onUp = () => {
      if (!active) return
      const st = useStore.getState()
      const box = dragToBox(active.x0, active.y0, active.x1, active.y1, Math.min(artW, artH))
      const id = `shape-${Date.now().toString(36)}`
      const item: ShapeItem = {
        id,
        kind: active.kind,
        x: box.x,
        y: box.y,
        w: box.w,
        h: box.h,
        fill: PAPER,
        opacity: 1,
        seed: (Date.now() ^ (box.x * 7919) ^ (box.y * 104729)) >>> 0,
        flip: box.flip,
      }
      st.apply({ shapes: [...st.project.shapes, item] })
      st.setUi({
        tool: 'select',
        selectedShapeIds: [id],
        selectedBlockId: undefined,
        selectedBlockIds: [],
        selectedImageIds: [],
      })
      clickGuard.suppress = true
      active = null
      setDraft(null)
      clearGuides()
    }
    artboard.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      artboard.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artW, artH])

  // move: dragging a selected shape carries every selected shape
  const onShapePointerDown = (e: ReactPointerEvent, item: ShapeItem) => {
    if (e.button !== 0) return
    if (useStore.getState().ui.tool !== 'select') return
    e.preventDefault()
    e.stopPropagation()
    const st = useStore.getState()
    const ids = st.ui.selectedShapeIds.includes(item.id) ? st.ui.selectedShapeIds : [item.id]
    dragRef.current = {
      id: item.id,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origins: new Map(
        st.project.shapes.filter((s) => ids.includes(s.id)).map((s) => [s.id, { x: s.x, y: s.y }]),
      ),
      moved: false,
      alt: e.altKey,
    }
    try {
      ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    } catch {
      // synthetic pointers have no active pointer to capture
    }
  }

  const onShapePointerMove = (e: ReactPointerEvent, item: ShapeItem) => {
    const drag = dragRef.current
    if (!drag || drag.id !== item.id || e.pointerId !== drag.pointerId) return
    const { scale } = toArt(0, 0)
    const dx = (e.clientX - drag.startX) / scale
    const dy = (e.clientY - drag.startY) / scale
    if (!drag.moved) {
      if (Math.hypot(dx, dy) * scale < 4) return
      drag.moved = true
      const st = useStore.getState()
      if (drag.alt) {
        // alt-drag: copies stay behind at the original spots
        const clones = st.project.shapes
          .filter((s) => drag.origins.has(s.id))
          .map((s, i) => ({ ...s, id: `shape-${Date.now().toString(36)}-c${i}` }))
        st.apply({ shapes: [...st.project.shapes, ...clones] })
      }
      st.setUi({
        dragging: true,
        selectedShapeIds: [...drag.origins.keys()],
        selectedBlockId: undefined,
        selectedBlockIds: [],
        selectedImageIds: [],
      })
    }
    const st = useStore.getState()
    // the grabbed shape's edges are the snap probes; the whole selection
    // rides its corrected delta so a group lands as one unit
    const lines = snapLines(drag.origins.keys())
    let sdx = dx
    let sdy = dy
    if (lines) {
      const o = drag.origins.get(drag.id)
      const grabbed = st.project.shapes.find((s) => s.id === drag.id)
      if (o && grabbed) {
        // edges AND the box center probe the lines — centering on a
        // column is as legitimate a landing as sitting on it
        const sx = snapAxis(
          [o.x + dx, o.x + grabbed.w / 2 + dx, o.x + grabbed.w + dx],
          lines.xs,
        )
        const sy = snapAxis(
          [o.y + dy, o.y + grabbed.h / 2 + dy, o.y + grabbed.h + dy],
          lines.ys,
        )
        if (sx) sdx += sx.delta
        if (sy) sdy += sy.delta
        setGuides({ xs: sx ? [sx.line] : [], ys: sy ? [sy.line] : [] })
      }
    }
    st.setTransient({
      shapes: st.project.shapes.map((s) => {
        const o = drag.origins.get(s.id)
        return o ? { ...s, x: o.x + sdx, y: o.y + sdy } : s
      }),
    })
  }

  const onShapePointerUp = (e: ReactPointerEvent, item: ShapeItem) => {
    const drag = dragRef.current
    if (!drag || drag.id !== item.id) return
    dragRef.current = null
    clearGuides()
    if (drag.moved) {
      clickGuard.suppress = true
      useStore.getState().commitTransient()
      useStore.getState().setUi({ dragging: false })
    }
  }

  // resize: dragged corner moves, opposite corner pins
  const onResizeDown = (e: ReactPointerEvent, item: ShapeItem, corner: ResizeState['corner']) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    resizeRef.current = { id: item.id, pointerId: e.pointerId, corner }
    useStore.getState().setUi({ dragging: true, selectedShapeIds: [item.id] })
    try {
      ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    } catch {
      // synthetic pointers have no active pointer to capture
    }
  }

  const onResizeMove = (e: ReactPointerEvent, item: ShapeItem) => {
    const rs = resizeRef.current
    if (!rs || rs.id !== item.id || e.pointerId !== rs.pointerId) return
    const p = toArt(e.clientX, e.clientY)
    const lines = snapLines([item.id])
    if (lines) {
      const sx = snapAxis([p.x], lines.xs)
      const sy = snapAxis([p.y], lines.ys)
      if (sx) p.x += sx.delta
      if (sy) p.y += sy.delta
      setGuides({ xs: sx ? [sx.line] : [], ys: sy ? [sy.line] : [] })
    }
    const st = useStore.getState()
    const s = st.project.shapes.find((x) => x.id === item.id)
    if (!s) return
    let x0 = s.x
    let y0 = s.y
    let x1 = s.x + s.w
    let y1 = s.y + s.h
    if (rs.corner.includes('w')) x0 = Math.min(p.x, x1 - 6)
    else x1 = Math.max(p.x, x0 + 6)
    if (rs.corner.includes('n')) y0 = Math.min(p.y, y1 - 6)
    else y1 = Math.max(p.y, y0 + 6)
    st.setTransient({
      shapes: st.project.shapes.map((x) =>
        x.id === item.id ? { ...x, x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : x,
      ),
    })
  }

  const onResizeUp = (e: ReactPointerEvent, item: ShapeItem) => {
    const rs = resizeRef.current
    if (!rs || rs.id !== item.id) return
    resizeRef.current = null
    clearGuides()
    clickGuard.suppress = true
    useStore.getState().commitTransient()
    useStore.getState().setUi({ dragging: false })
  }

  const draftItem: ShapeItem | null = draft
    ? {
        id: 'draft',
        kind: draft.kind,
        ...dragToBox(draft.x0, draft.y0, draft.x1, draft.y1, Math.min(artW, artH)),
        fill: PAPER,
        opacity: 0.6,
        seed: 7,
      }
    : null

  return (
    <div className="artboard-layer shape-items-layer" ref={layerRef}>
      <svg
        viewBox={`0 0 ${artW} ${artH}`}
        preserveAspectRatio="none"
        aria-hidden
        className="shape-items-svg"
      >
        {visibleShapes.map((s) => (
          <path
            key={s.id}
            d={shapePathD(s)}
            fill={s.fill}
            stroke={s.stroke && s.strokeWidth ? s.stroke : 'none'}
            strokeWidth={s.stroke && s.strokeWidth ? s.strokeWidth : undefined}
            opacity={s.opacity}
            fillRule="evenodd"
            className={
              selectedShapeIds.includes(s.id) ? 'draw-shape selected' : 'draw-shape'
            }
            data-shape-id={s.id}
            onPointerDown={(e) => onShapePointerDown(e, s)}
            onPointerMove={(e) => onShapePointerMove(e, s)}
            onPointerUp={(e) => onShapePointerUp(e, s)}
            onPointerCancel={(e) => onShapePointerUp(e, s)}
          />
        ))}
        {draftItem ? (
          <path d={shapePathD(draftItem)} fill={draftItem.fill} opacity={0.5} className="draw-shape-draft" />
        ) : null}
      </svg>
      {guides.xs.map((x) => (
        <div key={`gx${x}`} className="snap-guide snap-guide-x" style={{ left: x }} />
      ))}
      {guides.ys.map((y) => (
        <div key={`gy${y}`} className="snap-guide snap-guide-y" style={{ top: y }} />
      ))}
      {visibleShapes
        .filter((s) => selectedShapeIds.length === 1 && selectedShapeIds[0] === s.id)
        .map((s) => (
          <div
            key={s.id}
            className="shape-select-frame"
            style={{ left: s.x, top: s.y, width: s.w, height: s.h }}
          >
            {(['nw', 'ne', 'sw', 'se'] as const).map((corner) => (
              <span
                key={corner}
                className={`image-resize-handle corner-${corner}`}
                aria-label={`Resize shape (${corner})`}
                onPointerDown={(e) => onResizeDown(e, s, corner)}
                onPointerMove={(e) => onResizeMove(e, s)}
                onPointerUp={(e) => onResizeUp(e, s)}
                onPointerCancel={(e) => onResizeUp(e, s)}
              />
            ))}
          </div>
        ))}
    </div>
  )
}
