'use client'

import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/core/state/store'
import { Artboard } from './Artboard'

// Fits the artboard into the available stage area and hands the scale down.
export function CanvasStage() {
  const { width, height } = useStore((s) => s.project.artboard)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.4)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const fit = () => {
      const pad = 48
      const w = el.clientWidth - pad * 2
      const h = el.clientHeight - pad * 2
      if (w > 0 && h > 0) setScale(Math.min(w / width, h / height))
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [width, height])

  return (
    <div className="canvas-stage" ref={wrapRef}>
      <div
        className="artboard-scaler"
        style={{ width: width * scale, height: height * scale }}
      >
        <div
          className="artboard-origin"
          style={{ width, height, transform: `scale(${scale})` }}
        >
          <Artboard />
        </div>
      </div>
    </div>
  )
}
