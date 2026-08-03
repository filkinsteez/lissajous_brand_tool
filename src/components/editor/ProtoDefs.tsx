'use client'

import type { ShapeProto } from '@/core/canvas/shapeProtos'

// One def per bound source, shared by every effector's SVG layer: path
// protos as <path>, text protos as <text> width-normalized to the same
// PROTO box (the fontSize comes from the proto — the identical number
// the canvas painters use, so live and export agree by construction).
export function ProtoDefs({ protos, layerId }: { protos: ShapeProto[]; layerId: string }) {
  return (
    <>
      {protos.map((p, i) =>
        p.kind === 'path' ? (
          <path key={p.id} id={`dp-${layerId}-${i}`} d={p.d} />
        ) : (
          <text
            key={p.id}
            id={`dp-${layerId}-${i}`}
            fontFamily={p.family}
            fontWeight={p.weight}
            fontSize={p.fontSize}
            textAnchor="middle"
            dominantBaseline="central"
          >
            {p.text}
          </text>
        ),
      )}
    </>
  )
}
