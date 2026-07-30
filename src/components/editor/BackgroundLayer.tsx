'use client'

import { useEffect, useRef } from 'react'
import { useStore } from '@/core/state/store'
import { renderController } from '@/render/renderController'
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

    const renderFrame = (timeMs: number) => {
      const next = syncCanvasBackingStore(canvas)
      sizeRef.current = next
      renderToCanvas(canvas, useStore.getState().project, next.width, next.height, { timeMs })
    }

    const ro = new ResizeObserver(() => {
      renderFrame(performance.now())
    })
    ro.observe(canvas)
    renderFrame(performance.now())
    const unsub = renderController.subscribe((_, t) => renderFrame(t))
    return () => {
      ro.disconnect()
      unsub()
    }
  }, [mode])

  if (mode !== 'field') return null
  return <canvas ref={canvasRef} className="artboard-layer background-layer" />
}
