'use client'

import { useMemo } from 'react'
import { useStore } from '@/core/state/store'
import { getDerived } from '@/core/pipeline'
import { buildLattice } from '@/core/pattern/lattice'
import { PROTO_SIZE, resolveProjectProtos } from '@/core/canvas/shapeProtos'
import type { ShapeLayer } from '@/core/state/types'
import { layerBaseColor } from '@/core/layers/paint'
import { ProtoDefs } from './ProtoDefs'
import { layerStyle } from './layerPaint'

type PatternLayerT = Extract<ShapeLayer, { type: 'pattern' }>

// The lattice register: primitives on a grid, state swapped where the
// curve passes. Rides the background's zoom + pan like every register.
// Bound drawn shapes replace the primitive tiers: same cells, same
// distance bands, but stamped as <use> instances with a size ladder.
export function PatternLayer({ layer }: { layer: PatternLayerT }) {
  const project = useStore((s) => s.project)
  const pattern = layer.params

  const protos = useMemo(
    () => resolveProjectProtos(project, pattern.sourceShapeIds),
    [project, pattern.sourceShapeIds],
  )

  const tiers = useMemo(() => {
    const derived = getDerived(project)
    return buildLattice(
      derived.samples,
      project.artboard.width,
      project.artboard.height,
      { cells: pattern.cells, size: pattern.size, range: pattern.range, mode: pattern.mode },
      {
        scale: project.background.fieldScale ?? 1,
        offsetX: project.background.fieldOffsetX ?? 0,
        offsetY: project.background.fieldOffsetY ?? 0,
      },
      protos.length,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    project.lissajous,
    project.artboard.width,
    project.artboard.height,
    pattern.cells,
    pattern.size,
    pattern.range,
    pattern.mode,
    project.background.fieldScale,
    project.background.fieldOffsetX,
    project.background.fieldOffsetY,
    protos.length,
  ])

  if (!tiers) return null

  const tone = layerBaseColor(layer.color, project)

  return (
    <svg
      className="artboard-layer shape-layer"
      viewBox={`0 0 ${project.artboard.width} ${project.artboard.height}`}
      preserveAspectRatio="none"
      aria-hidden
      style={layerStyle(layer)}
    >
      {tiers.stamps.length ? (
        <>
          <defs>
            <ProtoDefs protos={protos} layerId={layer.id} />
          </defs>
          {tiers.stamps.map((s, i) => (
            <use
              key={i}
              href={`#dp-${layer.id}-${s.protoIndex}`}
              fill={protos[s.protoIndex].fill}
              fillRule="evenodd"
              opacity={protos[s.protoIndex].opacity}
              transform={`translate(${s.x.toFixed(1)} ${s.y.toFixed(1)}) scale(${((s.r * 2) / PROTO_SIZE).toFixed(3)})`}
            />
          ))}
        </>
      ) : (
        <>
          {tiers.dots ? <path d={tiers.dots} fill={tone} opacity={0.45} /> : null}
          {tiers.circles ? <path d={tiers.circles} fill={tone} opacity={0.8} /> : null}
          {tiers.rings ? (
            <path d={tiers.rings} fill="none" stroke={tone} strokeWidth={2} opacity={0.95} />
          ) : null}
          {tiers.squares ? <path d={tiers.squares} fill={tone} /> : null}
        </>
      )}
    </svg>
  )
}
