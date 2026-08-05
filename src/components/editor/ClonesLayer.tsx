'use client'

import { useMemo } from 'react'
import { useStore } from '@/core/state/store'
import { getDerived } from '@/core/pipeline'
import {
  buildContourLevels,
  dealProtoIndex,
  stampsAlongContours,
} from '@/core/cloner/contours'
import { cloneTransforms } from '@/core/cloner/effectors'
import { PROTO_SIZE, resolveProjectProtos } from '@/core/canvas/shapeProtos'
import type { ShapeLayer } from '@/core/state/types'
import { layerBaseColor } from '@/core/layers/paint'
import { ProtoDefs } from './ProtoDefs'
import { layerStyle } from './layerPaint'

type ClonesLayerT = Extract<ShapeLayer, { type: 'clones' }>

// The cloner: nested hairline offsets of the curve, drawn over the
// background — the reference's field-line register. The contours follow
// the SAME zoom + pan as the background figure, so the two registers
// stay one geometry. Bound drawn shapes flip the register from stroked
// rings to shapes stamped along the rings (clone-along-path).
export function ClonesLayer({ layer }: { layer: ClonesLayerT }) {
  const project = useStore((s) => s.project)
  const cloner = layer.params

  const levels = useMemo(() => {
    const derived = getDerived(project)
    return buildContourLevels(
      derived.samples,
      project.artboard.width,
      project.artboard.height,
      { count: Math.round(cloner.count), spacing: cloner.spacing, growth: cloner.growth },
      {
        scale: project.background.fieldScale ?? 1,
        offsetX: project.background.fieldOffsetX ?? 0,
        offsetY: project.background.fieldOffsetY ?? 0,
      },
    )
    // getDerived is memoized on the project reference; the fields named
    // here are the ones that actually change the drawing
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    project.lissajous,
    project.artboard.width,
    project.artboard.height,
    cloner.count,
    cloner.spacing,
    cloner.growth,
    project.background.fieldScale,
    project.background.fieldOffsetX,
    project.background.fieldOffsetY,
  ])

  const protos = useMemo(
    () => resolveProjectProtos(project, cloner.sourceShapeIds),
    [project, cloner.sourceShapeIds],
  )

  const W = project.artboard.width
  const H = project.artboard.height
  const minDim = Math.min(W, H)

  // stamp centers per ring, at equal arc length; the stamp size rides the
  // ring's effector weight so STEP thins the stamps like it thins strokes
  const stamped = useMemo(() => {
    if (!protos.length || !levels.length) return null
    const ts = cloneTransforms(cloner, levels.length, minDim, project.background.seed)
    return levels.map((level, i) => {
      const size = Math.min(Math.max(ts[i].weight * 5, 6), minDim * 0.05)
      return { size, stamps: stampsAlongContours([level], size * 2.6) }
    })
  }, [levels, protos.length, cloner, minDim, project.background.seed])

  if (!levels.length) return null

  const stroke = layerBaseColor(layer.color, project)
  const transforms = cloneTransforms(cloner, levels.length, minDim, project.background.seed)

  return (
    <svg
      className="artboard-layer shape-layer"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      aria-hidden
      style={layerStyle(layer)}
    >
      {protos.length > 0 && (
        <defs>
          <ProtoDefs protos={protos} layerId={layer.id} />
        </defs>
      )}
      {levels.map((level, i) => {
        const t = transforms[i]
        return (
          <g
            key={i}
            transform={`translate(${t.dx.toFixed(1)} ${t.dy.toFixed(1)}) rotate(${t.rotateDeg.toFixed(2)} ${W / 2} ${H / 2}) translate(${W / 2} ${H / 2}) scale(${t.scale.toFixed(4)}) translate(${-W / 2} ${-H / 2})`}
            opacity={t.opacity}
          >
            {stamped ? (
              stamped[i].stamps.map((st, j) => {
                const pi = dealProtoIndex(i, j, protos.length)
                const p = protos[pi]
                return (
                  <use
                    key={j}
                    href={`#dp-${layer.id}-${pi}`}
                    fill={p.fill}
                    fillRule="evenodd"
                    opacity={p.opacity}
                    transform={`translate(${st.x.toFixed(1)} ${st.y.toFixed(1)}) rotate(${((st.angle * 180) / Math.PI).toFixed(1)}) scale(${(stamped[i].size / PROTO_SIZE).toFixed(3)})`}
                  />
                )
              })
            ) : (
              <path
                d={level.d}
                fill="none"
                stroke={stroke}
                strokeWidth={t.weight}
                strokeLinecap="round"
              />
            )}
          </g>
        )
      })}
    </svg>
  )
}
