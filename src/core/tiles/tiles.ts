import type { TilesState } from '@/core/state/types'

// The tiles engine: flush, edge-to-edge modular tile systems — the
// coded-poster language. Cells fill their bounds completely so adjacent
// tiles CONNECT; the composition is per-cell state, not floating glyphs.
//
//   CHECKER — every cell is empty (outlined), solid, or subdivided into
//     a finer sub-lattice; some cells carry X diagonals. The stroke
//     lattice draws OVER the fills in the primary color, so it vanishes
//     on same-color solids and articulates the dark ones — the pixel-
//     poster read. The curve pulls activity and subdivision depth, so
//     the figure emerges as clustered fine texture.
//   RINGS — concentric quarter-arc bands centered on a dealt cell
//     corner. Equal radii across cells mean arcs MEET at shared edges:
//     the truchet weave appears by construction. Ring parity alternates
//     the two inks; DUO flips whole cells' parity for weave variety.
//
// Pure data + path strings, shared verbatim by the SVG layer and the
// PNG export. Deterministic per seed.

export type TilesBuild = {
  fillA: string // the layer color
  fillB: string // the counter ink
  stroke: string // lattice + diagonals, drawn in the layer color
  strokeWidth: number // artboard px
  // bound objects: CHECKER's active cells stamp the bound shape flush
  // in the cell instead of a solid — the tree's modifier grammar made
  // literal. color 1 = the DUO counter-ink deal.
  stamps: { x: number; y: number; w: number; h: number; color: 0 | 1; proto: number }[]
}

function hash(ix: number, iy: number, k: number, seed: number): number {
  const v = Math.sin(ix * 127.1 + iy * 311.7 + k * 269.5 + seed * 0.137) * 43758.5453
  return v - Math.floor(v)
}

const f1 = (v: number) => v.toFixed(1)

function rect(x: number, y: number, w: number, h: number): string {
  return `M${f1(x)} ${f1(y)}H${f1(x + w)}V${f1(y + h)}H${f1(x)}Z`
}

// nearest-distance field from cell centers to the figure — the same
// read every other register uses, sampled coarsely for speed
function curveDist(pts: { x: number; y: number }[] | null, x: number, y: number): number {
  if (!pts || pts.length < 2) return Number.POSITIVE_INFINITY
  let best = Number.POSITIVE_INFINITY
  for (let i = 0; i < pts.length; i += 3) {
    const dx = pts[i].x - x
    const dy = pts[i].y - y
    const d2 = dx * dx + dy * dy
    if (d2 < best) best = d2
  }
  return Math.sqrt(best)
}

export function buildTiles(
  t: TilesState,
  width: number,
  height: number,
  curvePts: { x: number; y: number }[] | null,
  protoCount = 0,
): TilesBuild {
  const cols = Math.max(4, Math.round(t.cols))
  const cellW = width / cols
  const rows = Math.max(2, Math.round(height / cellW))
  const cellH = height / rows
  const minDim = Math.min(width, height)
  const reach = minDim * 0.16
  const strokeWidth = Math.max(1, (1 + t.weight * 5) * (cellW / 90))

  let fillA = ''
  let fillB = ''
  let stroke = ''
  const stamps: TilesBuild['stamps'] = []
  const drawn = protoCount > 0 && t.style === 'checker'
  const put = (x: number, y: number, w: number, h: number, toB: boolean, ix: number, iy: number) => {
    if (drawn) {
      stamps.push({ x, y, w, h, color: toB ? 1 : 0, proto: Math.floor(hash(ix, iy, 9, t.seed) * protoCount) % protoCount })
    } else if (toB) fillB += rect(x, y, w, h)
    else fillA += rect(x, y, w, h)
  }

  if (t.style === 'rings') {
    const bands = Math.max(2, Math.round(t.rings))
    const s = Math.min(cellW, cellH)
    const bw = s / bands
    for (let iy = 0; iy < rows; iy++) {
      for (let ix = 0; ix < cols; ix++) {
        if (hash(ix, iy, 1, t.seed) > t.density) continue
        const x0 = ix * cellW
        const y0 = iy * cellH
        // the dealt corner; CURVE nudges the deal toward a coherent
        // field so neighborhoods spin together near the figure
        const f =
          t.curve > 0
            ? Math.exp(-Math.pow(curveDist(curvePts, x0 + cellW / 2, y0 + cellH / 2) / reach, 2))
            : 0
        const coherent = Math.floor(((ix + iy) % 2 === 0 ? 0.25 : 0.75) * 4) % 4
        const dealt = Math.floor(hash(ix, iy, 2, t.seed) * 4) % 4
        const corner = hash(ix, iy, 3, t.seed) < t.curve * f ? coherent : dealt
        const cx = corner === 1 || corner === 2 ? x0 + cellW : x0
        const cy = corner >= 2 ? y0 + cellH : y0
        // angles that open INTO the cell from that corner
        const a0 = corner === 0 ? 0 : corner === 1 ? Math.PI / 2 : corner === 2 ? Math.PI : -Math.PI / 2
        const a1 = a0 + Math.PI / 2
        const flip = hash(ix, iy, 4, t.seed) < t.duo ? 1 : 0
        for (let i = 0; i < bands; i++) {
          const rIn = i * bw + bw * 0.225
          const rOut = (i + 1) * bw - bw * 0.225
          if (rOut <= rIn) continue
          const d =
            `M${f1(cx + Math.cos(a0) * rOut)} ${f1(cy + Math.sin(a0) * rOut)}` +
            `A${f1(rOut)} ${f1(rOut)} 0 0 1 ${f1(cx + Math.cos(a1) * rOut)} ${f1(cy + Math.sin(a1) * rOut)}` +
            `L${f1(cx + Math.cos(a1) * rIn)} ${f1(cy + Math.sin(a1) * rIn)}` +
            `A${f1(rIn)} ${f1(rIn)} 0 0 0 ${f1(cx + Math.cos(a0) * rIn)} ${f1(cy + Math.sin(a0) * rIn)}Z`
          if ((i + flip) % 2 === 0) fillA += d
          else fillB += d
        }
      }
    }
    return { fillA, fillB, stroke, strokeWidth, stamps }
  }

  // CHECKER
  const line = (x1: number, y1: number, x2: number, y2: number) =>
    `M${f1(x1)} ${f1(y1)}L${f1(x2)} ${f1(y2)}`

  // the base lattice: every cell boundary, one long stroke path
  for (let ix = 0; ix <= cols; ix++) stroke += line(ix * cellW, 0, ix * cellW, height)
  for (let iy = 0; iy <= rows; iy++) stroke += line(0, iy * cellH, width, iy * cellH)

  for (let iy = 0; iy < rows; iy++) {
    for (let ix = 0; ix < cols; ix++) {
      const x0 = ix * cellW
      const y0 = iy * cellH
      const f =
        t.curve > 0
          ? Math.exp(-Math.pow(curveDist(curvePts, x0 + cellW / 2, y0 + cellH / 2) / reach, 2))
          : 0
      const active = hash(ix, iy, 1, t.seed) < t.density + t.curve * f * 0.35
      const toB = hash(ix, iy, 5, t.seed) < t.duo
      // diagonals live on a sparse deal of their own, denser on the figure
      if (hash(ix, iy, 6, t.seed) < 0.1 + t.curve * f * 0.2) {
        stroke += line(x0, y0, x0 + cellW, y0 + cellH) + line(x0 + cellW, y0, x0, y0 + cellH)
      }
      if (!active) continue
      const pSub = t.levels > 1 ? 0.18 + t.curve * f * 0.6 : 0
      if (hash(ix, iy, 3, t.seed) < pSub) {
        // sub-lattice: 2x2, or 4x4 where the figure runs hottest
        const k = t.levels > 2 && hash(ix, iy, 4, t.seed) < 0.35 + f * 0.4 ? 4 : 2
        const sw = cellW / k
        const sh = cellH / k
        for (let i = 1; i < k; i++) {
          stroke += line(x0 + i * sw, y0, x0 + i * sw, y0 + cellH)
          stroke += line(x0, y0 + i * sh, x0 + cellW, y0 + i * sh)
        }
        for (let sy = 0; sy < k; sy++) {
          for (let sx = 0; sx < k; sx++) {
            // checker parity, occasionally broken so the texture breathes
            const parity = (sx + sy) % 2 === 0
            const broken = hash(ix * 31 + sx, iy * 37 + sy, 7, t.seed) < 0.12
            if (parity !== broken) {
              put(x0 + sx * sw, y0 + sy * sh, sw, sh, toB, ix * 31 + sx, iy * 37 + sy)
            }
          }
        }
      } else {
        put(x0, y0, cellW, cellH, toB, ix, iy)
      }
    }
  }
  return { fillA, fillB, stroke, strokeWidth, stamps }
}
