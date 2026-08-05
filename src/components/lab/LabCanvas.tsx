'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Eraser, Paintbrush } from 'lucide-react'
import { useLabStore } from '@/core/lab/labStore'
import { getLabSource } from '@/core/lab/sourceCache'
import { renderLab, renderSourceOverlay } from '@/core/lab/render'
import {
  BRUSH_LEVEL,
  ERASE_LEVEL,
  applyStroke,
  ensurePaintRaster,
  reconcilePaint,
  serializePaint,
} from '@/core/lab/paintRuntime'
import { createFieldSource, mintSourceId } from '@/core/lab/territory'
import { resolveBankCached } from './bankCache'
import { importLabSource } from './importSource'

// The study canvas. Render-on-demand: state changes schedule ONE rAF
// draw (coalescing bursts), drags render at half resolution via the
// quality gate. The same renderLab that draws here is the export.
//
// The BRUSH paints the mask field directly on the composition — strokes
// mutate the runtime raster at pointer speed and commit once on
// release, so undo gets one entry per stroke, not one per sample.

type PaintTool = 'off' | 'brush' | 'erase'

export function LabCanvas() {
  const lab = useLabStore((s) => s.lab)
  const view = useLabStore((s) => s.ui.view)
  const quality = useLabStore((s) => s.ui.quality)
  const sourceNonce = useLabStore((s) => s.ui.sourceNonce)
  const zoom = useLabStore((s) => s.ui.zoom)
  const note = useLabStore((s) => s.ui.note)
  const focusedSourceId = useLabStore((s) => s.ui.focusedSourceId)
  const setUi = useLabStore((s) => s.setUi)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef(0)
  const strokingRef = useRef(false)
  const [wrapSize, setWrapSize] = useState({ w: 0, h: 0 })
  const [dragOver, setDragOver] = useState(false)
  const [tool, setTool] = useState<PaintTool>('off')
  const [brush, setBrush] = useState(90) // output px

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect
      setWrapSize({ w: r.width, h: r.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // draw — coalesced into one rAF per state burst
  useEffect(() => {
    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      const canvas = canvasRef.current
      if (!canvas) return
      const scale = quality === 'live' ? 0.5 : 1
      const w = Math.max(1, Math.round(lab.output.width * scale))
      const h = Math.max(1, Math.round(lab.output.height * scale))
      if (canvas.width !== w) canvas.width = w
      if (canvas.height !== h) canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(scale, 0, 0, scale, 0, 0)
      renderLab(ctx, lab, getLabSource(), resolveBankCached(lab.mark.bank), view)
      // while a Fields dial drags, that field's contours ride on top
      if (focusedSourceId && view === 'composite') {
        renderSourceOverlay(ctx, lab, getLabSource(), focusedSourceId)
      }
    })
    return () => cancelAnimationFrame(rafRef.current)
  }, [lab, view, quality, sourceNonce, focusedSourceId])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith('image/'))
    if (file) void importLabSource(file)
  }, [])

  const hasSource = !!getLabSource()
  const pad = 32
  const fitScale = Math.min(
    1,
    (wrapSize.w - pad) / Math.max(1, lab.output.width),
    (wrapSize.h - pad) / Math.max(1, lab.output.height),
  )
  const displayScale = zoom === 'fit' ? Math.max(0.02, fitScale) : 1

  const lastPointRef = useRef<{ x: number; y: number } | null>(null)
  const strokePointerRef = useRef<number | null>(null)

  const strokeAt = (e: React.PointerEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const r = canvas.getBoundingClientRect()
    const ox = ((e.clientX - r.left) / r.width) * lab.output.width
    const oy = ((e.clientY - r.top) / r.height) * lab.output.height
    reconcilePaint(useLabStore.getState().lab.paint)
    const raster = ensurePaintRaster(lab.output.width, lab.output.height)
    // per-axis scales: the raster height clamps on extreme aspect
    // ratios, so x and y do not share one factor
    const kx = raster.w / lab.output.width
    const ky = raster.h / lab.output.height
    const rad = Math.max(1.5, brush * kx)
    const target = tool === 'erase' ? ERASE_LEVEL : BRUSH_LEVEL
    // interpolate from the previous sample so fast drags leave a
    // stroke, not stepping stones
    const prev = lastPointRef.current
    if (prev) {
      const steps = Math.ceil(Math.hypot(ox - prev.x, oy - prev.y) / (brush * 0.4)) || 1
      for (let i = 1; i <= steps; i++) {
        const t = i / steps
        applyStroke(
          raster,
          (prev.x + (ox - prev.x) * t) * kx,
          (prev.y + (oy - prev.y) * t) * ky,
          rad,
          target,
        )
      }
    } else {
      applyStroke(raster, ox * kx, oy * ky, rad, target)
    }
    lastPointRef.current = { x: ox, y: oy }
    setUi({ sourceNonce: useLabStore.getState().ui.sourceNonce + 1 })
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (tool === 'off') return
    // one stroke, one pointer — a second touch mid-stroke would
    // ping-pong lastPointRef between fingers and paint straight streaks
    if (strokingRef.current) return
    e.preventDefault()
    try {
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    } catch {
      // synthetic events carry no capturable pointer — strokes still work
    }
    strokePointerRef.current = e.pointerId
    strokingRef.current = true
    // first stroke with no paint source in the stack adds one — the
    // brush should never paint into a field nothing reads
    const st = useLabStore.getState()
    if (!st.lab.territory.sources.some((s) => s.kind === 'paint')) {
      st.apply({
        territory: {
          sources: [...st.lab.territory.sources, createFieldSource('paint', mintSourceId())],
        },
      })
    }
    strokeAt(e)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (strokingRef.current && e.pointerId === strokePointerRef.current) strokeAt(e)
  }
  const onPointerUp = (e: React.PointerEvent) => {
    if (!strokingRef.current || e.pointerId !== strokePointerRef.current) return
    strokingRef.current = false
    strokePointerRef.current = null
    lastPointRef.current = null
    const st = useLabStore.getState()
    const raster = ensurePaintRaster(st.lab.output.width, st.lab.output.height)
    st.apply({ paint: serializePaint(raster) })
  }

  return (
    <div className="lab-stage-inner">
      <div className="lab-view-row" role="tablist" aria-label="View">
        <button
          role="tab"
          aria-selected={view === 'composite'}
          className={view === 'composite' ? 'lab-chip active' : 'lab-chip'}
          onClick={() => setUi({ view: 'composite' })}
        >
          Result
        </button>
        <button
          role="tab"
          aria-selected={view === 'source'}
          className={view === 'source' ? 'lab-chip active' : 'lab-chip'}
          onClick={() => setUi({ view: 'source' })}
        >
          Photo
        </button>
        <span className="lab-view-gap" />
        <button
          className={zoom === 'fit' ? 'lab-chip active' : 'lab-chip'}
          onClick={() => setUi({ zoom: 'fit' })}
        >
          Fit
        </button>
        <button
          className={zoom === 'actual' ? 'lab-chip active' : 'lab-chip'}
          onClick={() => setUi({ zoom: 'actual' })}
        >
          100%
        </button>
      </div>
      <div
        ref={wrapRef}
        className={dragOver ? 'lab-canvas-wrap drag' : 'lab-canvas-wrap'}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <canvas
          ref={canvasRef}
          className={tool === 'off' ? 'lab-canvas' : 'lab-canvas painting'}
          style={{
            width: lab.output.width * displayScale,
            height: lab.output.height * displayScale,
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
        {!hasSource ? (
          <div className="lab-empty">
            Drop an image — or compose from the curve alone
          </div>
        ) : null}
        {note ? <div className="lab-note">{note}</div> : null}
        {/* the brush dock — paint the effect in, or the photo back */}
        <div className="lab-brush-dock" role="toolbar" aria-label="Brush">
          <button
            className={tool === 'brush' ? 'lab-dock-chip active' : 'lab-dock-chip'}
            title="Brush — paint the effect over the photo"
            aria-pressed={tool === 'brush'}
            onClick={() => setTool(tool === 'brush' ? 'off' : 'brush')}
          >
            <Paintbrush />
            Brush
          </button>
          <button
            className={tool === 'erase' ? 'lab-dock-chip active' : 'lab-dock-chip'}
            title="Restore — bring the photo back where you paint"
            aria-pressed={tool === 'erase'}
            onClick={() => setTool(tool === 'erase' ? 'off' : 'erase')}
          >
            <Eraser />
            Restore
          </button>
          {tool !== 'off' ? (
            <input
              className="lab-brush-size"
              type="range"
              min={20}
              max={320}
              value={brush}
              aria-label="Brush size"
              onChange={(e) => setBrush(Number(e.target.value))}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}
