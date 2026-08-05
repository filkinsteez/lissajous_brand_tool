'use client'

import { useMemo } from 'react'
import { useStore } from '@/core/state/store'
import { buildCurveClones, buildRepeats } from '@/core/repeater/repeater'
import type { SheetClone } from '@/core/sheet/sheet'
import { resolveProjectProtos, PROTO_SIZE } from '@/core/canvas/shapeProtos'
import type { RepeaterState, ShapeLayer } from '@/core/state/types'
import { getDerived } from '@/core/pipeline'
import { transformedCurve } from '@/core/lissajous/figureTransform'
import { layerBaseColor, fieldSampler } from '@/core/layers/paint'
import { ProtoDefs } from './ProtoDefs'
import { layerStyle, fillPaint, TexturePatternDef } from './layerPaint'
import { shapeD, metaGlyphD } from './SheetLayer'

// renders the merged cloner's RADIAL / LINEAR / CURVE modes — the
// accumulating repeat engine (GRID mode renders through SheetLayer)
type RepeaterLayerT = Extract<ShapeLayer, { type: 'cloner' }>

export function RepeaterLayer({ layer }: { layer: RepeaterLayerT }) {
  const project = useStore((s) => s.project)
  const p = layer.params
  // the repeat engine's view of the merged params: stampSize is its
  // size dial (grid's `size` is per-cell and stays out of reach)
  const rep: RepeaterState = useMemo(
    () => ({ ...p, mode: p.mode === 'linear' ? 'linear' : 'radial', size: p.stampSize }),
    [p],
  )

  const baseColor = layerBaseColor(layer.color, project)
  const sampler =
    layer.color === 'sampled' && layer.texture === 'solid' ? fieldSampler(project) : null

  // bound drawn protos: non-empty switches the vocabulary to <use> stamps
  const protos = useMemo(
    () => resolveProjectProtos(project, p.sourceShapeIds),
    [project, p.sourceShapeIds],
  )

  const clones = useMemo(
    () =>
      p.mode === 'curve'
        ? buildCurveClones(
            rep,
            project.artboard.width,
            project.artboard.height,
            transformedCurve(project, getDerived(project)),
            protos.length,
          )
        : buildRepeats(rep, project.artboard.width, project.artboard.height, protos.length),
    [p.mode, rep, project, protos],
  )

  const strokeW = Math.max(
    1.5,
    Math.min(project.artboard.width, project.artboard.height) * 0.0035,
  )
  const metas: SheetClone[] = []
  const drawn: SheetClone[] = []
  let filledD = ''
  let strokedD = ''
  for (const c of clones) {
    if (c.drawnIndex !== undefined) {
      drawn.push(c)
      continue
    }
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
        <ProtoDefs protos={protos} layerId={layer.id} />
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
          .filter((c) => c.shape !== 'meta' && c.drawnIndex === undefined)
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
      {drawn.map((c, i) => {
        const di = c.drawnIndex ?? 0
        const p = protos[di]
        if (!p) return null
        // drawn protos stamp with their OWN fill; layer color machinery
        // does not apply. Proto box is PROTO_SIZE, so scale = diameter/box.
        return (
          <use
            key={i}
            href={`#dp-${layer.id}-${di}`}
            fill={p.fill}
            fillRule="evenodd"
            opacity={c.opacity * p.opacity}
            transform={`translate(${c.x.toFixed(1)} ${c.y.toFixed(1)}) rotate(${((c.rotate * 180) / Math.PI).toFixed(1)}) scale(${((c.r * 2) / PROTO_SIZE).toFixed(3)})`}
          />
        )
      })}
    </svg>
  )
}
