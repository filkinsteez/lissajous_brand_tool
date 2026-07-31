'use client'

import { useMemo } from 'react'
import { useStore } from '@/core/state/store'
import { buildRepeats } from '@/core/repeater/repeater'
import type { SheetClone } from '@/core/sheet/sheet'
import type { ShapeLayer } from '@/core/state/types'
import { layerBaseColor, fieldSampler } from '@/core/layers/paint'
import { layerStyle, fillPaint, TexturePatternDef } from './layerPaint'
import { shapeD, metaGlyphD } from './SheetLayer'

type RepeaterLayerT = Extract<ShapeLayer, { type: 'repeater' }>

// The repeater drawn as SVG — same painters as the sheet, so the two
// registers stay one drawing language. Meta glyphs instance a private
// def per layer.
export function RepeaterLayer({ layer }: { layer: RepeaterLayerT }) {
  const project = useStore((s) => s.project)
  const rep = layer.params

  const baseColor = layerBaseColor(layer.color, project)
  const sampler =
    layer.color === 'sampled' && layer.texture === 'solid' ? fieldSampler(project) : null

  const clones = useMemo(
    () => buildRepeats(rep, project.artboard.width, project.artboard.height),
    [rep, project.artboard.width, project.artboard.height],
  )

  const strokeW = Math.max(
    1.5,
    Math.min(project.artboard.width, project.artboard.height) * 0.0035,
  )
  const metas: SheetClone[] = []
  let filledD = ''
  let strokedD = ''
  for (const c of clones) {
    if (c.shape === 'meta') {
      metas.push(c)
      continue
    }
    if (c.stroked) strokedD += shapeD(c)
    else filledD += shapeD(c)
  }
  // per-clone opacity (FADE) and per-clone sampled color both force
  // individual paths; the batched pair covers the flat case
  const batched = rep.fade < 0.01 && !sampler

  return (
    <svg
      className="artboard-layer shape-layer"
      viewBox={`0 0 ${project.artboard.width} ${project.artboard.height}`}
      preserveAspectRatio="none"
      aria-hidden
      style={layerStyle(layer)}
    >
      <defs>
        <path id={`repeater-meta-${layer.id}`} d={metaGlyphD()} />
        <TexturePatternDef layer={layer} color={baseColor} />
      </defs>
      {batched ? (
        <>
          {filledD ? (
            <path d={filledD} fill={fillPaint(layer, baseColor)} fillRule="evenodd" />
          ) : null}
          {strokedD ? (
            <path d={strokedD} fill="none" stroke={baseColor} strokeWidth={strokeW} />
          ) : null}
        </>
      ) : (
        clones
          .filter((c) => c.shape !== 'meta')
          .map((c, i) => {
            const color = sampler ? sampler(c.x, c.y) : baseColor
            return (
              <path
                key={i}
                d={shapeD(c)}
                fill={c.stroked ? 'none' : sampler ? color : fillPaint(layer, baseColor)}
                stroke={c.stroked ? color : 'none'}
                strokeWidth={c.stroked ? strokeW : undefined}
                opacity={c.opacity}
                fillRule="evenodd"
              />
            )
          })
      )}
      {metas.map((c, i) => (
        <use
          key={i}
          href={`#repeater-meta-${layer.id}`}
          fill="none"
          stroke={sampler ? sampler(c.x, c.y) : baseColor}
          strokeWidth={strokeW / Math.max(c.r, 0.5)}
          opacity={c.opacity}
          transform={`translate(${c.x.toFixed(1)} ${c.y.toFixed(1)}) rotate(${((c.rotate * 180) / Math.PI).toFixed(1)}) scale(${c.r.toFixed(2)})`}
        />
      ))}
    </svg>
  )
}
