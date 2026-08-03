'use client'

import { useEffect, useRef } from 'react'
import { useStore } from '@/core/state/store'
import { getDerived } from '@/core/pipeline'
import { buildOrganic } from '@/core/organic/engine'
import { paintOrganic } from '@/core/organic/paint'
import { BRAND_PALETTE } from '@/core/color/palette'
import { INK, PAPER } from '@/core/state/defaults'
import { transformedCurve } from '@/core/lissajous/figureTransform'
import { resolveProtos } from '@/core/canvas/shapeProtos'
import { layerStyle } from './layerPaint'
import type { ShapeLayer } from '@/core/state/types'

type OrganicLayerT = Extract<ShapeLayer, { type: 'organic' }>

// The organic register live. Subscriptions are NARROW — the engine
// rebuild is the most expensive per-change work in the app, so it only
// re-runs when an input it actually reads changes (its own params, the
// artboard, the palette roles, the figure, the view quality) instead of
// on every project mutation anywhere.
export function OrganicLayer({ layer }: { layer: OrganicLayerT }) {
  const artW = useStore((s) => s.project.artboard.width)
  const artH = useStore((s) => s.project.artboard.height)
  const roles = useStore((s) => s.project.background.roles)
  const lissajous = useStore((s) => s.project.lissajous)
  const fieldScale = useStore((s) => s.project.background.fieldScale)
  const fieldOffsetX = useStore((s) => s.project.background.fieldOffsetX)
  const fieldOffsetY = useStore((s) => s.project.background.fieldOffsetY)
  const quality = useStore((s) => s.ui.quality)
  const shapes = useStore((s) => s.project.shapes)
  const typeBlocks = useStore((s) => s.project.typeBlocks)
  const bgMode = useStore((s) => s.project.background.mode)
  const ground = useStore((s) => s.project.background.ground)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = artW
    canvas.height = artH
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, artW, artH)

    const p = layer.params
    const needsCurve =
      p.curvePull > 0 || p.distribution === 'curve' || p.rotation === 'tangent' || p.rotation === 'flow'
    const project = useStore.getState().project
    const curve = needsCurve ? transformedCurve(project, getDerived(project)) : null
    const palette = [PAPER, ...roles.slice(0, 4).map((r) => BRAND_PALETTE.roles[r].base)]
    // resolved ids (not the raw binding) feed the deal, so drawnIndex
    // stays aligned with the proto array when a bound source is deleted
    const textFallback = bgMode === 'field' && ground !== 'neutral' ? PAPER : INK
    const drawnProtos = resolveProtos(shapes, p.sourceShapeIds, typeBlocks, textFallback)
    const build = buildOrganic(
      p,
      artW,
      artH,
      curve,
      palette.length,
      drawnProtos.map((d) => d.id),
    )
    // while a slider is mid-drag (quality 'live') the raster finish is
    // skipped so the drag stays fluid; the full pass lands on release
    paintOrganic(ctx, build, artW, artH, {
      scale: 1,
      palette,
      full: quality === 'hq',
      drawnProtos: drawnProtos.length ? drawnProtos : undefined,
    })
  }, [layer, artW, artH, roles, lissajous, fieldScale, fieldOffsetX, fieldOffsetY, quality, shapes, typeBlocks, bgMode, ground])

  return (
    <canvas
      ref={canvasRef}
      className="artboard-layer shape-canvas"
      aria-hidden
      style={layerStyle(layer)}
    />
  )
}
