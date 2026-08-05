'use client'

import { useMemo } from 'react'
import { useStore } from '@/core/state/store'
import { getDerived } from '@/core/pipeline'
import { buildSheetClones, metaUnitOutline, unitPolygon, type SheetClone } from '@/core/sheet/sheet'
import { transformedCurve } from '@/core/lissajous/figureTransform'
import { resolveProjectProtos, PROTO_SIZE } from '@/core/canvas/shapeProtos'
import type { ShapeLayer } from '@/core/state/types'
import { layerBaseColor, fieldSampler } from '@/core/layers/paint'
import { ProtoDefs } from './ProtoDefs'
import { layerStyle, fillPaint, TexturePatternDef } from './layerPaint'

// the curve the CURVE effector reads lives in core/lissajous/figureTransform
// — one shared definition for live layers and the export

// The sheet register drawn as SVG. Primitives are baked into one path
// per (depth layer x fill/stroke x color) bucket; the meta glyph is
// instanced with <use> so hundreds of marks stay cheap.

const rot = (c: SheetClone, px: number, py: number): { x: number; y: number } => {
  const cos = Math.cos(c.rotate)
  const sin = Math.sin(c.rotate)
  return { x: c.x + (px * cos - py * sin) * c.r, y: c.y + (px * sin + py * cos) * c.r }
}

function circleD(c: SheetClone): string {
  const r = c.r
  return (
    `M${(c.x - r).toFixed(1)} ${c.y.toFixed(1)}` +
    `a${r.toFixed(1)} ${r.toFixed(1)} 0 1 0 ${(r * 2).toFixed(1)} 0` +
    `a${r.toFixed(1)} ${r.toFixed(1)} 0 1 0 ${(-r * 2).toFixed(1)} 0`
  )
}

// semicircle: flat edge along the shape's local x-axis
function halfD(c: SheetClone): string {
  const a = rot(c, -1, 0)
  const b = rot(c, 1, 0)
  const r = c.r
  return (
    `M${a.x.toFixed(1)} ${a.y.toFixed(1)}` +
    `A${r.toFixed(1)} ${r.toFixed(1)} 0 0 1 ${b.x.toFixed(1)} ${b.y.toFixed(1)}Z`
  )
}

// quarter disc anchored in the cell corner — the truchet tile
function quarterD(c: SheetClone): string {
  const corner = rot(c, -1, -1)
  const armX = rot(c, 1, -1)
  const armY = rot(c, -1, 1)
  const r = c.r * 2
  return (
    `M${corner.x.toFixed(1)} ${corner.y.toFixed(1)}` +
    `L${armX.x.toFixed(1)} ${armX.y.toFixed(1)}` +
    `A${r.toFixed(1)} ${r.toFixed(1)} 0 0 1 ${armY.x.toFixed(1)} ${armY.y.toFixed(1)}Z`
  )
}

function polyD(c: SheetClone, shape: 'square' | 'triangle' | 'cross'): string {
  const pts = unitPolygon(shape)
  let d = ''
  for (let i = 0; i < pts.length; i++) {
    const p = rot(c, pts[i].x, pts[i].y)
    d += `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`
  }
  return d + 'Z'
}

export function shapeD(c: SheetClone): string {
  switch (c.shape) {
    case 'circle':
      return circleD(c)
    case 'half':
      return halfD(c)
    case 'quarter':
      return quarterD(c)
    default:
      return polyD(c, c.shape as 'square' | 'triangle' | 'cross')
  }
}

export function metaGlyphD(): string {
  const pts = metaUnitOutline()
  let d = ''
  for (let i = 0; i < pts.length; i++) {
    d += `${i === 0 ? 'M' : 'L'}${pts[i].x.toFixed(3)} ${pts[i].y.toFixed(3)}`
  }
  return d + 'Z'
}

// renders the merged cloner's GRID mode — the sheet engine
type SheetLayerT = Extract<ShapeLayer, { type: 'cloner' }>

export function SheetLayer({ layer }: { layer: SheetLayerT }) {
  const project = useStore((s) => s.project)
  const sheet = layer.params

  // bound drawn protos: non-empty switches the vocabulary to <use> stamps
  const protos = useMemo(
    () => resolveProjectProtos(project, sheet.sourceShapeIds),
    [project, sheet.sourceShapeIds],
  )

  const baseColor = layerBaseColor(layer.color, project)
  // SAMPLED bucket-keys by the field color under each clone; the weave
  // (texture) keeps a single color — the two don't compose
  const sampler =
    layer.color === 'sampled' && layer.texture === 'solid' ? fieldSampler(project) : null

  const built = useMemo(() => {
    const clones = buildSheetClones(
      sheet,
      project.artboard.width,
      project.artboard.height,
      project.background.seed,
      sheet.curve > 0 ? transformedCurve(project, getDerived(project)) : undefined,
      protos.length,
    )
    // buckets: (z, stroked, color) -> batched path; metas instanced separately
    const buckets = new Map<
      string,
      { opacity: number; stroked: boolean; z: number; d: string; color: string | null }
    >()
    const metas: { c: SheetClone; color: string | null }[] = []
    const drawn: SheetClone[] = []
    for (const c of clones) {
      if (c.drawnIndex !== undefined) {
        drawn.push(c)
        continue
      }
      const color = sampler ? sampler(c.x, c.y) : null
      if (c.shape === 'meta') {
        metas.push({ c, color })
        continue
      }
      const key = `${c.z}:${c.stroked ? 's' : 'f'}:${color ?? ''}`
      const d = shapeD(c)
      const entry = buckets.get(key)
      if (entry) entry.d += d
      else buckets.set(key, { opacity: c.opacity, stroked: c.stroked, z: c.z, d, color })
    }
    return {
      buckets: [...buckets.values()].sort((a, b) => b.z - a.z),
      metas,
      drawn,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    sheet,
    sampler,
    protos,
    project.artboard.width,
    project.artboard.height,
    project.background.seed,
    project.lissajous,
    project.background.fieldScale,
    project.background.fieldOffsetX,
    project.background.fieldOffsetY,
  ])

  const strokeW = Math.max(
    1.5,
    Math.min(project.artboard.width, project.artboard.height) * 0.0035,
  )

  return (
    <svg
      className="artboard-layer shape-layer"
      viewBox={`0 0 ${project.artboard.width} ${project.artboard.height}`}
      preserveAspectRatio="none"
      aria-hidden
      style={layerStyle(layer)}
    >
      <defs>
        <path id={`sheet-meta-${layer.id}`} d={metaGlyphD()} />
        <ProtoDefs protos={protos} layerId={layer.id} />
        <TexturePatternDef layer={layer} color={baseColor} />
      </defs>
      {built.buckets.map((b, i) => (
        <path
          key={i}
          d={b.d}
          fill={b.stroked ? 'none' : b.color ?? fillPaint(layer, baseColor)}
          stroke={b.stroked ? b.color ?? baseColor : 'none'}
          strokeWidth={b.stroked ? strokeW : undefined}
          opacity={b.opacity}
          fillRule="evenodd"
        />
      ))}
      {built.metas.map(({ c, color }, i) => (
        <use
          key={i}
          href={`#sheet-meta-${layer.id}`}
          fill={c.stroked ? 'none' : color ?? fillPaint(layer, baseColor)}
          stroke={c.stroked ? color ?? baseColor : 'none'}
          strokeWidth={c.stroked ? strokeW / Math.max(c.r, 0.5) : undefined}
          fillRule="evenodd"
          opacity={c.opacity}
          transform={`translate(${c.x.toFixed(1)} ${c.y.toFixed(1)}) rotate(${((c.rotate * 180) / Math.PI).toFixed(1)}) scale(${c.r.toFixed(2)})`}
        />
      ))}
      {built.drawn.map((c, i) => {
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
