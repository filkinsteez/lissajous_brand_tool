'use client'

import { useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { useStore } from '@/core/state/store'
import { getDerived } from '@/core/pipeline'
import { gridSnapLines, snapAxis } from '@/core/canvas/snap'

type Gesture = {
  pointerId: number
  mode: 'move' | 'nw' | 'ne' | 'sw' | 'se'
  startX: number
  startY: number
  box: { x: number; y: number; w: number; h: number } // artboard px at start
}

const MIN_BOX = 40 // artboard px

// The sheet's bounding frame: shown while a SHEET effector is the
// selected layer. Drag an edge to place the cloner, corner-resize to
// size it, double-click to reset to full bleed. Only the border strips
// and handles take pointer events — canvas objects underneath stay
// clickable through the frame's interior.
export function SheetBoundsLayer() {
  const artW = useStore((s) => s.project.artboard.width)
  const artH = useStore((s) => s.project.artboard.height)
  const layers = useStore((s) => s.project.layers)
  const selectedLayerId = useStore((s) => s.ui.selectedLayerId)
  const designTab = useStore((s) => s.ui.designTab)
  const panelOpen = useStore((s) => s.ui.panelOpen)
  const ref = useRef<HTMLDivElement>(null)
  const gRef = useRef<Gesture | null>(null)

  const layer = layers.find((l) => l.id === selectedLayerId) ?? layers[layers.length - 1]
  if (!panelOpen || designTab !== 'layers' || !layer) return null
  if (layer.type !== 'cloner' || layer.params.mode !== 'grid') return null
  const p = layer.params
  const box = {
    x: (p.boxX ?? 0) * artW,
    y: (p.boxY ?? 0) * artH,
    w: (p.boxW ?? 1) * artW,
    h: (p.boxH ?? 1) * artH,
  }

  const write = (b: typeof box) => {
    const st = useStore.getState()
    st.setTransient({
      layers: st.project.layers.map((l) =>
        l.id === layer.id && l.type === 'cloner'
          ? ({
              ...l,
              params: {
                ...l.params,
                boxX: b.x / artW,
                boxY: b.y / artH,
                boxW: b.w / artW,
                boxH: b.h / artH,
              },
            } as typeof l)
          : l,
      ),
    })
  }

  const onDown = (e: ReactPointerEvent, mode: Gesture['mode']) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    gRef.current = { pointerId: e.pointerId, mode, startX: e.clientX, startY: e.clientY, box }
    useStore.getState().setUi({ dragging: true })
    try {
      ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    } catch {
      // synthetic pointers have no active pointer to capture
    }
  }

  const onMove = (e: ReactPointerEvent) => {
    const g = gRef.current
    if (!g || e.pointerId !== g.pointerId) return
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const scale = r.width > 0 ? r.width / artW : 1
    const dx = (e.clientX - g.startX) / scale
    const dy = (e.clientY - g.startY) / scale
    const st = useStore.getState()
    const lines = st.ui.snap ? gridSnapLines(getDerived(st.project).grid, artW, artH) : null
    let b = { ...g.box }
    if (g.mode === 'move') {
      b.x += dx
      b.y += dy
      if (lines) {
        const sx = snapAxis([b.x, b.x + b.w], lines.xs)
        const sy = snapAxis([b.y, b.y + b.h], lines.ys)
        if (sx) b.x += sx.delta
        if (sy) b.y += sy.delta
      }
    } else {
      let x0 = g.box.x
      let y0 = g.box.y
      let x1 = g.box.x + g.box.w
      let y1 = g.box.y + g.box.h
      if (g.mode.includes('w')) x0 += dx
      else x1 += dx
      if (g.mode.includes('n')) y0 += dy
      else y1 += dy
      if (lines) {
        const sx = snapAxis([g.mode.includes('w') ? x0 : x1], lines.xs)
        const sy = snapAxis([g.mode.includes('n') ? y0 : y1], lines.ys)
        if (sx) {
          if (g.mode.includes('w')) x0 += sx.delta
          else x1 += sx.delta
        }
        if (sy) {
          if (g.mode.includes('n')) y0 += sy.delta
          else y1 += sy.delta
        }
      }
      if (g.mode.includes('w')) x0 = Math.min(x0, x1 - MIN_BOX)
      else x1 = Math.max(x1, x0 + MIN_BOX)
      if (g.mode.includes('n')) y0 = Math.min(y0, y1 - MIN_BOX)
      else y1 = Math.max(y1, y0 + MIN_BOX)
      b = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
    }
    write(b)
  }

  const onUp = () => {
    if (!gRef.current) return
    gRef.current = null
    useStore.getState().commitTransient()
    useStore.getState().setUi({ dragging: false })
  }

  const resetFull = () => {
    const st = useStore.getState()
    st.apply({
      layers: st.project.layers.map((l) =>
        l.id === layer.id && l.type === 'cloner'
          ? ({ ...l, params: { ...l.params, boxX: 0, boxY: 0, boxW: 1, boxH: 1 } } as typeof l)
          : l,
      ),
    })
  }

  const edge = (side: 'top' | 'right' | 'bottom' | 'left') => (
    <div
      key={side}
      className={`sheet-bounds-edge ${side}`}
      title="Drag to move the sheet's bounds — double-click for full bleed"
      onPointerDown={(e) => onDown(e, 'move')}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onDoubleClick={resetFull}
    />
  )

  return (
    <div className="artboard-layer sheet-bounds-layer" ref={ref}>
      <div
        className="sheet-bounds-frame"
        style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
      >
        {(['top', 'right', 'bottom', 'left'] as const).map(edge)}
        {(['nw', 'ne', 'sw', 'se'] as const).map((corner) => (
          <span
            key={corner}
            className={`image-resize-handle corner-${corner}`}
            aria-label={`Resize sheet bounds (${corner})`}
            onPointerDown={(e) => onDown(e, corner)}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          />
        ))}
      </div>
    </div>
  )
}
