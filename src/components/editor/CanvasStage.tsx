'use client'

import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/core/state/store'
import { Artboard } from './Artboard'
import { CanvasDock } from './CanvasDock'

const ZOOM_MIN = 0.25
const ZOOM_MAX = 6

// Fits the artboard into the stage, then applies the view transform on
// top: zoom multiplies the fit scale. Every canvas layer derives its
// pointer scale from live rects, so drag / marquee / resize math
// survives any zoom untouched. There is deliberately NO pan gesture —
// pan offsets exist only so ctrl-zoom can anchor the cursor point.
//
//   ctrl/cmd + wheel (pinch)  zoom toward the cursor
//   ctrl/cmd + 0              fit          ctrl/cmd + 1   100%
export function CanvasStage() {
  const { width, height } = useStore((s) => s.project.artboard)
  const isolating = useStore((s) => {
    const id = s.ui.isolateLayerId
    return !!id && s.project.layers.some((l) => l.id === id && l.params.sourceShapeIds.length > 0)
  })
  const zoom = useStore((s) => s.ui.zoom)
  const panX = useStore((s) => s.ui.panX)
  const panY = useStore((s) => s.ui.panY)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState(0.4)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const doFit = () => {
      const pad = 48
      const dock = 56 // matches .artboard-scaler margin-bottom — the dock's slot
      const w = el.clientWidth - pad * 2
      const h = el.clientHeight - pad * 2 - dock
      if (w > 0 && h > 0) setFit(Math.min(w / width, h / height))
    }
    doFit()
    const ro = new ResizeObserver(doFit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [width, height])

  // wheel: pinch/ctrl zooms about the cursor; plain wheel does nothing
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      const st = useStore.getState()
      const { zoom: z, panX: px, panY: py } = st.ui
      const scaler = el.querySelector('.artboard-scaler') as HTMLElement | null
      if (!scaler) return
      const base = scaler.getBoundingClientRect()
      const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z * Math.exp(-e.deltaY * 0.0022)))
      // keep the canvas point under the cursor fixed while the scale moves
      const cx = e.clientX - base.left
      const cy = e.clientY - base.top
      st.setUi({
        zoom: next,
        panX: cx - ((cx - px) / z) * next,
        panY: cy - ((cy - py) / z) * next,
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // ctrl/cmd 0 and 1 are the view presets
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      const ae = document.activeElement as HTMLElement | null
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) return
      if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault()
        useStore.getState().setUi({ zoom: 1, panX: 0, panY: 0 })
      } else if ((e.ctrlKey || e.metaKey) && e.key === '1') {
        e.preventDefault()
        // 100%: one artboard pixel to one screen pixel, centered
        useStore.getState().setUi({ zoom: 1 / Math.max(fit, 0.001), panX: 0, panY: 0 })
      }
    }
    window.addEventListener('keydown', onDown)
    return () => window.removeEventListener('keydown', onDown)
  }, [fit])

  const pct = Math.round(fit * zoom * 100)

  return (
    <div className="canvas-stage" ref={wrapRef}>
      <div className="artboard-scaler" style={{ width: width * fit, height: height * fit }}>
        <div
          className="artboard-viewport"
          style={{ transform: `translate(${panX}px, ${panY}px) scale(${zoom})` }}
        >
          <div
            className="artboard-origin"
            style={{ width, height, transform: `scale(${fit})` }}
          >
            <Artboard />
          </div>
        </div>
        {/* pinned to the artboard's bottom edge — the scaler is the static
            fit box, so the dock ignores zoom/pan of the inner viewport */}
        <CanvasDock />
      </div>
      {isolating ? (
        <button
          className="isolate-banner"
          title="Exit isolation (Enter or Esc)"
          onClick={() => useStore.getState().setUi({ isolateLayerId: undefined, selectedShapeIds: [] })}
        >
          EDITING SOURCES — the effector updates live · ENTER, ESC or click here when done
        </button>
      ) : null}
      <button
        className="zoom-chip"
        title="Zoom — click to fit (Ctrl+0), Ctrl+1 for 100%, Ctrl+scroll to zoom"
        onClick={() => useStore.getState().setUi({ zoom: 1, panX: 0, panY: 0 })}
      >
        {pct}%
      </button>
    </div>
  )
}
