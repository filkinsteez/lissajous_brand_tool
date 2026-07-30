'use client'

import { useEffect, useRef } from 'react'
import { useStore } from '@/core/state/store'
import { renderToCanvas } from '@/render/backgroundGL'

function syncCanvasBackingStore(canvas: HTMLCanvasElement): { width: number; height: number } {
  const rect = canvas.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  const width = Math.max(1, Math.round(rect.width * dpr))
  const height = Math.max(1, Math.round(rect.height * dpr))
  if (canvas.width !== width) canvas.width = width
  if (canvas.height !== height) canvas.height = height
  return { width, height }
}

export function BackgroundLayer() {
  const mode = useStore((s) => s.project.background.mode)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sizeRef = useRef({ width: 0, height: 0 })

  useEffect(() => {
    if (mode !== 'field') return
    const canvas = canvasRef.current
    if (!canvas) return

    // the field is a STILL: rendered frozen (time derived from the seed),
    // re-rendered only when the project changes or the canvas resizes —
    // no animation loop, no per-frame GPU load
    const renderFrame = () => {
      const next = syncCanvasBackingStore(canvas)
      sizeRef.current = next
      renderToCanvas(canvas, useStore.getState().project, next.width, next.height, { frozen: true })
    }

    // dev capture hook: re-render synchronously and read back in the same
    // task (the GL context has no preserveDrawingBuffer, so a stale read
    // returns blank) — used by the devshot loop while iterating on the field
    // PNG: lossless — JPEG's block transform was adding its own artifacts
    // to the very gradients under inspection
    ;(window as unknown as { __lbsBgShot?: () => string }).__lbsBgShot = () => {
      renderFrame()
      return canvas.toDataURL('image/png')
    }

    const ro = new ResizeObserver(renderFrame)
    ro.observe(canvas)
    renderFrame()
    let lastProject = useStore.getState().project
    const unsub = useStore.subscribe((state) => {
      if (state.project !== lastProject) {
        lastProject = state.project
        renderFrame()
      }
    })
    return () => {
      ro.disconnect()
      unsub()
    }
  }, [mode])

  if (mode !== 'field') return null
  return <canvas ref={canvasRef} className="artboard-layer background-layer" />
}
