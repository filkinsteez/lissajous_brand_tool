'use client'

import { useEffect, useRef } from 'react'
import { useStore } from '@/core/state/store'
import { getDerived } from '@/core/pipeline'
import { getFieldBake } from '@/core/lissajous/fields'
import { getPressureMask } from '@/core/typography/pressureMask'
import { MaterialRenderer } from '@/render/materialRenderer'
import { renderController } from '@/render/renderController'
import { lbsDebug } from '@/core/state/debug'

// L1: the WebGL material canvas. Bake resolution follows interaction
// quality: 128² while a slider drags, 256² once it settles.
export function MaterialLayer() {
  const project = useStore((s) => s.project)
  const quality = useStore((s) => s.ui.quality)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<MaterialRenderer | null>(null)

  // renderer lifecycle
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || rendererRef.current) return
    rendererRef.current = new MaterialRenderer(canvas)
    lbsDebug('materialAvailable', rendererRef.current.available)
    return () => {
      rendererRef.current?.dispose()
      rendererRef.current = null
    }
  }, [project.material.enabled])

  // upload field/pressure + draw on any relevant change
  useEffect(() => {
    const canvas = canvasRef.current
    const renderer = rendererRef.current
    if (!canvas || !renderer || !renderer.available) return

    const { width: W, height: H } = project.artboard
    if (canvas.width !== W) canvas.width = W
    if (canvas.height !== H) canvas.height = H

    const derived = getDerived(project)
    const t0 = performance.now()
    const { bake } = getFieldBake(derived.samples, derived.primary, W, H, quality === 'live' ? 128 : 256)
    lbsDebug('bakeMs', Math.round((performance.now() - t0) * 10) / 10)
    {
      // field sanity stats for verification via __lbs.debug.fieldStats
      let dMin = Infinity, dMax = -Infinity, dSum = 0, aMax = 0
      for (let i = 0; i < bake.data.length; i += 4) {
        const d = bake.data[i]
        if (d < dMin) dMin = d
        if (d > dMax) dMax = d
        dSum += d
        if (bake.data[i + 3] > aMax) aMax = bake.data[i + 3]
      }
      lbsDebug('fieldStats', {
        distMin: +dMin.toFixed(3), distMax: +dMax.toFixed(3),
        distMean: +((dSum * 4) / bake.data.length).toFixed(3), densityMax: +aMax.toFixed(3),
      })
    }
    const mask = getPressureMask(project, derived.grid)

    renderer.setField(bake)
    renderer.setPressure(mask)
    renderer.render(project.material, performance.now() / 1000, project.seed)

    lbsDebug('samplePixel', (x: number, y: number) =>
      renderer.samplePixel(project.material, x, y, performance.now() / 1000, project.seed))
    lbsDebug('renderMaterialAt', (w: number, h: number) =>
      renderer.renderToPixels(project.material, w, h, project.seed))
  }, [project, quality])

  // slow motion drift — only ticks when motion > 0
  useEffect(() => {
    if (!project.material.enabled || project.material.motion <= 0) return
    return renderController.subscribe((_dt, t) => {
      rendererRef.current?.render(project.material, t / 1000, project.seed)
    })
  }, [project.material, project.seed])

  if (!project.material.enabled) return null
  return <canvas ref={canvasRef} className="artboard-layer material-layer" data-testid="material-canvas" />
}
