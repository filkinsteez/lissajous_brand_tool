'use client'

import { useEffect, useRef } from 'react'
import { useStore } from '@/core/state/store'
import { buildImageCells, paintImageCells, samplePixels } from '@/core/array/imageArray'
import { resolveProjectProtos, type ShapeProto } from '@/core/canvas/shapeProtos'
import { BRAND_PALETTE } from '@/core/color/palette'
import type { ShapeLayer } from '@/core/state/types'
import { layerStyle } from './layerPaint'

type ArrayLayerT = Extract<ShapeLayer, { type: 'array' }>

// The array register: an uploaded image re-drawn as a glyph array.
// Canvas, not SVG — thousands of individually colored cells are trivial
// for 2D canvas and would be DOM soup as elements.
export function ArrayLayer({ layer }: { layer: ArrayLayerT }) {
  const project = useStore((s) => s.project)
  const shapes = useStore((s) => s.project.shapes)
  const state = layer.params
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgCache = useRef<{ src: string; el: HTMLImageElement } | null>(null)

  const image = project.images.find((im) => im.id === state.imageId) ?? project.images[0]

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !image) return
    let alive = true

    const render = (el: HTMLImageElement) => {
      if (!alive || !canvas) return
      const W = project.artboard.width
      const H = project.artboard.height
      canvas.width = W
      canvas.height = H
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.clearRect(0, 0, W, H)
      const cols = Math.max(4, Math.round(state.cells))
      const rows = Math.max(4, Math.round(H / (W / cols)))
      const pixels = samplePixels(el, cols, rows)
      if (!pixels) return
      // the palette deal: the poster's three locked/leading roles
      const roles = project.background.roles.slice(0, 3)
      const palette = roles.map((r) => BRAND_PALETTE.roles[r].base)
      const protos = resolveProjectProtos(project, state.sourceShapeIds)
      const cells = buildImageCells(state, W, H, pixels, palette, protos.map((p: ShapeProto) => p.fill))
      paintImageCells(ctx, cells, protos)
    }

    if (imgCache.current?.src === image.src) {
      render(imgCache.current.el)
    } else {
      const el = new Image()
      el.onload = () => {
        imgCache.current = { src: image.src, el }
        render(el)
      }
      el.src = image.src
    }
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, image, shapes, project.typeBlocks, project.artboard.width, project.artboard.height, project.background.roles])

  if (!image) return null

  return (
    <canvas
      ref={canvasRef}
      className="artboard-layer shape-canvas"
      aria-hidden
      style={layerStyle(layer)}
    />
  )
}
