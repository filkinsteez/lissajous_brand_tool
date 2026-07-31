'use client'

import type { CSSProperties } from 'react'
import type { ShapeLayer } from '@/core/state/types'
import { textureTile, type TextureKind } from '@/core/texture/textures'

// Shared paint plumbing for the live shape-layer components: the layer's
// opacity/blend as CSS on the flattened element (matching the export's
// per-layer composite), and the subtexture as an SVG <pattern> def.

export function layerStyle(layer: ShapeLayer): CSSProperties {
  return {
    opacity: layer.opacity < 1 ? layer.opacity : undefined,
    mixBlendMode: layer.blend !== 'normal' ? layer.blend : undefined,
  }
}

export const texPatternId = (layer: ShapeLayer) => `tex-${layer.id}`

// filled shapes take the weave; strokes stay solid color
export function fillPaint(layer: ShapeLayer, color: string): string {
  return layer.texture !== 'solid' ? `url(#${texPatternId(layer)})` : color
}

export function TexturePatternDef({ layer, color }: { layer: ShapeLayer; color: string }) {
  if (layer.texture === 'solid') return null
  const tile = textureTile(layer.texture as TextureKind, layer.texDensity)
  return (
    <pattern
      id={texPatternId(layer)}
      width={tile.size}
      height={tile.size}
      patternUnits="userSpaceOnUse"
    >
      {tile.rects.map((r, i) => (
        <rect key={`r${i}`} x={r.x} y={r.y} width={r.w} height={r.h} fill={color} />
      ))}
      {tile.dots.map((d, i) => (
        <circle key={`d${i}`} cx={d.x} cy={d.y} r={d.r} fill={color} />
      ))}
      {tile.lines.map((l, i) => (
        <line
          key={`l${i}`}
          x1={l.x1}
          y1={l.y1}
          x2={l.x2}
          y2={l.y2}
          stroke={color}
          strokeWidth={l.w}
        />
      ))}
    </pattern>
  )
}
