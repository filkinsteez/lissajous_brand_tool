'use client'

import { useEffect, useRef } from 'react'
import { useStore } from '@/core/state/store'
import { getDerived } from '@/core/pipeline'
import { getFieldBake } from '@/core/lissajous/fields'
import { getPressureMask } from '@/core/typography/pressureMask'
import { getGlyphLayout } from '@/core/glyph-field/layout'
import { renderGlyphField } from '@/core/glyph-field/renderCanvas'
import { lbsDebug } from '@/core/state/debug'
import { INK } from '@/core/state/defaults'

// L3: the Glyph Field, canvas-rendered at artboard resolution.
export function GlyphFieldLayer() {
  const project = useStore((s) => s.project)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const { width: W, height: H } = project.artboard
    const derived = getDerived(project)
    const { sampler } = getFieldBake(derived.samples, derived.primary, W, H)
    const mask = getPressureMask(project, derived.grid)
    const glyphs = getGlyphLayout(project, derived.grid, sampler, mask)
    lbsDebug('glyphCount', glyphs.length)
    lbsDebug('glyphSample', glyphs.slice(0, 20))

    const draw = () => renderGlyphField(canvas, glyphs, W, H, {
      ink: INK,
      overprint: project.glyphField.overprint,
    })
    // ensure the brand font is actually loaded before the first paint,
    // otherwise glyphs rasterize in the fallback font and stay stale
    if (typeof document !== 'undefined' && document.fonts?.status !== 'loaded') {
      document.fonts.ready.then(draw)
    }
    draw()
  }, [project])

  if (!project.glyphField.enabled) return null
  return <canvas ref={canvasRef} className="artboard-layer glyph-layer" data-testid="glyph-field" />
}
