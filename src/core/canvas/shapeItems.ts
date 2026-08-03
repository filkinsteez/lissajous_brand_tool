import type { ShapeItem } from '@/core/state/types'

// Drawn primitives — the direct-drawing instrument next to the
// procedural layers. One path generator feeds both the live SVG layer
// and the export's Path2D, so a drawn shape is pixel-identical in both.

const TAU = Math.PI * 2

// deterministic per-shape hash for blob harmonics / star irregularity
function h01(seed: number, k: number): number {
  let h = (seed ^ Math.imul(k, 0x9e3779b1)) >>> 0
  h = (h ^ (h >>> 13)) >>> 0
  h = Math.imul(h, 0x27d4eb2d) >>> 0
  h = (h ^ (h >>> 15)) >>> 0
  return h / 0x100000000
}

const f = (v: number) => v.toFixed(2)

export function shapePathD(s: ShapeItem): string {
  const { x, y, w, h } = s
  const cx = x + w / 2
  const cy = y + h / 2
  const rx = w / 2
  const ry = h / 2

  switch (s.kind) {
    case 'rect':
      return `M${f(x)} ${f(y)}H${f(x + w)}V${f(y + h)}H${f(x)}Z`

    case 'ellipse':
      return (
        `M${f(cx - rx)} ${f(cy)}` +
        `A${f(rx)} ${f(ry)} 0 1 0 ${f(cx + rx)} ${f(cy)}` +
        `A${f(rx)} ${f(ry)} 0 1 0 ${f(cx - rx)} ${f(cy)}Z`
      )

    case 'poly': {
      // hexagon, flat proportions follow the box
      let d = ''
      for (let i = 0; i < 6; i++) {
        const t = (i / 6) * TAU - Math.PI / 2
        const px = cx + Math.cos(t) * rx
        const py = cy + Math.sin(t) * ry
        d += `${i === 0 ? 'M' : 'L'}${f(px)} ${f(py)}`
      }
      return d + 'Z'
    }

    case 'star': {
      const inner = 0.42 + h01(s.seed, 1) * 0.08
      let d = ''
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? 1 : inner
        const t = (i / 10) * TAU - Math.PI / 2
        const px = cx + Math.cos(t) * rx * r
        const py = cy + Math.sin(t) * ry * r
        d += `${i === 0 ? 'M' : 'L'}${f(px)} ${f(py)}`
      }
      return d + 'Z'
    }

    case 'line': {
      // a capsule along the box diagonal; `flip` remembers which diagonal
      // was dragged. Thickness rides the box's short side so resizing
      // works with plain corner handles.
      const x1 = x
      const y1 = s.flip ? y + h : y
      const x2 = x + w
      const y2 = s.flip ? y : y + h
      const len = Math.hypot(x2 - x1, y2 - y1) || 1
      const th = Math.max(3, Math.min(w, h) * 0.22, Math.min(24, len * 0.06))
      const nx = (-(y2 - y1) / len) * (th / 2)
      const ny = ((x2 - x1) / len) * (th / 2)
      return (
        `M${f(x1 + nx)} ${f(y1 + ny)}` +
        `L${f(x2 + nx)} ${f(y2 + ny)}` +
        `A${f(th / 2)} ${f(th / 2)} 0 0 0 ${f(x2 - nx)} ${f(y2 - ny)}` +
        `L${f(x1 - nx)} ${f(y1 - ny)}` +
        `A${f(th / 2)} ${f(th / 2)} 0 0 0 ${f(x1 + nx)} ${f(y1 + ny)}Z`
      )
    }

    default: {
      // blob: three low harmonics from the shape's own seed — every drawn
      // blob is its own creature, stable across edits
      const a2 = h01(s.seed, 2) * 0.24
      const a3 = h01(s.seed, 3) * 0.2
      const a5 = h01(s.seed, 5) * 0.1
      const p2 = h01(s.seed, 7) * TAU
      const p3 = h01(s.seed, 11) * TAU
      const p5 = h01(s.seed, 13) * TAU
      let d = ''
      const N = 48
      for (let i = 0; i < N; i++) {
        const t = (i / N) * TAU
        const r =
          1 + a2 * Math.sin(2 * t + p2) + a3 * Math.sin(3 * t + p3) + a5 * Math.sin(5 * t + p5)
        const px = cx + Math.cos(t) * rx * r * 0.82
        const py = cy + Math.sin(t) * ry * r * 0.82
        d += `${i === 0 ? 'M' : 'L'}${f(px)} ${f(py)}`
      }
      return d + 'Z'
    }
  }
}

// normalize a drag into a shape box; tiny drags become a default-size
// stamp at the click point (the Figma click-to-place behavior)
export function dragToBox(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  minDim: number,
): { x: number; y: number; w: number; h: number; flip: boolean } {
  const w = Math.abs(x1 - x0)
  const h = Math.abs(y1 - y0)
  if (w < 6 && h < 6) {
    const s = minDim * 0.08
    return { x: x0 - s / 2, y: y0 - s / 2, w: s, h: s, flip: false }
  }
  return {
    x: Math.min(x0, x1),
    y: Math.min(y0, y1),
    w: Math.max(6, w),
    h: Math.max(6, h),
    // drag direction: up-right or down-left means the rising diagonal
    flip: (x1 - x0) * (y1 - y0) < 0,
  }
}
