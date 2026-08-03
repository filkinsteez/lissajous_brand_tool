'use client'

import { useMemo } from 'react'
import { useStore } from '@/core/state/store'
import { getDerived } from '@/core/pipeline'
import { buildTiles } from '@/core/tiles/tiles'
import { transformedCurve } from '@/core/lissajous/figureTransform'
import { PROTO_SIZE, resolveProjectProtos } from '@/core/canvas/shapeProtos'
import type { ShapeLayer } from '@/core/state/types'
import { layerBaseColor } from '@/core/layers/paint'
import { ProtoDefs } from './ProtoDefs'
import { layerStyle } from './layerPaint'

type TilesLayerT = Extract<ShapeLayer, { type: 'tiles' }>

// The tiles register as SVG: batched fill paths in the layer color and
// the counter ink, the stroke lattice drawn over both. With bound
// objects, CHECKER's cells stamp the master flush in the cell instead
// of solid rects — the modifier-under-the-shape grammar made literal.
export function TilesLayer({ layer }: { layer: TilesLayerT }) {
  const project = useStore((s) => s.project)
  const t = layer.params

  const protos = useMemo(
    () => resolveProjectProtos(project, t.sourceShapeIds),
    [project, t.sourceShapeIds],
  )

  const built = useMemo(
    () =>
      buildTiles(
        t,
        project.artboard.width,
        project.artboard.height,
        t.curve > 0 ? transformedCurve(project, getDerived(project)) : null,
        protos.length,
      ),
    // getDerived memoizes on the project reference
    [t, project, protos.length],
  )

  const colorA = layerBaseColor(layer.color, project)
  const colorB = layerBaseColor(t.colorB ?? 'ink', project)

  return (
    <svg
      className="artboard-layer shape-layer"
      viewBox={`0 0 ${project.artboard.width} ${project.artboard.height}`}
      preserveAspectRatio="none"
      aria-hidden
      style={layerStyle(layer)}
    >
      {protos.length ? (
        <defs>
          <ProtoDefs protos={protos} layerId={layer.id} />
        </defs>
      ) : null}
      {built.fillB ? <path d={built.fillB} fill={colorB} /> : null}
      {built.fillA ? <path d={built.fillA} fill={colorA} /> : null}
      {built.stamps.map((s, i) => {
        const p = protos[s.proto]
        if (!p) return null
        // flush in the cell: the proto's largest dimension spans the
        // cell's short side, centered — DUO cells flip to the counter ink
        const k = Math.min(s.w, s.h) / PROTO_SIZE
        return (
          <use
            key={i}
            href={`#dp-${layer.id}-${s.proto}`}
            fill={s.color === 1 ? colorB : p.fill}
            fillRule="evenodd"
            opacity={p.opacity}
            transform={`translate(${(s.x + s.w / 2).toFixed(1)} ${(s.y + s.h / 2).toFixed(1)}) scale(${k.toFixed(3)})`}
          />
        )
      })}
      {built.stroke ? (
        <path d={built.stroke} fill="none" stroke={colorA} strokeWidth={built.strokeWidth} />
      ) : null}
    </svg>
  )
}
