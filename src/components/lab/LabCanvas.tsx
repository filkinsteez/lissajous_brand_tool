'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useLabStore } from '@/core/lab/labStore'
import { getLabSource } from '@/core/lab/sourceCache'
import { renderLab } from '@/core/lab/render'
import { LAB_VIEWS } from '@/core/lab/types'
import { resolveBankCached } from './bankCache'
import { importLabSource } from './importSource'

// The study canvas. Render-on-demand: state changes schedule ONE rAF
// draw (coalescing bursts), drags render at half resolution via the
// quality gate, and rest state re-renders full. The same renderLab that
// draws here is the export — no second painter to drift.

export function LabCanvas() {
  const lab = useLabStore((s) => s.lab)
  const view = useLabStore((s) => s.ui.view)
  const quality = useLabStore((s) => s.ui.quality)
  const sourceNonce = useLabStore((s) => s.ui.sourceNonce)
  const zoom = useLabStore((s) => s.ui.zoom)
  const note = useLabStore((s) => s.ui.note)
  const setUi = useLabStore((s) => s.setUi)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef(0)
  const [wrapSize, setWrapSize] = useState({ w: 0, h: 0 })
  const [dragOver, setDragOver] = useState(false)

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
    })
    return () => cancelAnimationFrame(rafRef.current)
  }, [lab, view, quality, sourceNonce])

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

  return (
    <div className="lab-stage-inner">
      <div className="lab-view-row" role="tablist" aria-label="View">
        {LAB_VIEWS.map((v) => (
          <button
            key={v.id}
            role="tab"
            aria-selected={view === v.id}
            className={view === v.id ? 'lab-chip active' : 'lab-chip'}
            onClick={() => setUi({ view: v.id })}
          >
            {v.label}
          </button>
        ))}
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
          className="lab-canvas"
          style={{
            width: lab.output.width * displayScale,
            height: lab.output.height * displayScale,
          }}
        />
        {!hasSource ? (
          <div className="lab-empty">Drop an image here — PNG, JPEG, or WebP</div>
        ) : null}
        {note ? <div className="lab-note">{note}</div> : null}
      </div>
    </div>
  )
}
