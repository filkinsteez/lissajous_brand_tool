import { TAU } from './equation'
import type { CurveSample } from './sampler'
import { SpatialHash } from '@/core/math/spatialHash'

export type CurveNode = {
  id: number
  x: number
  y: number
  ti: number // curve parameter of the earlier branch
  tj: number // curve parameter of the later branch
}

type Hit = { x: number; y: number; ti: number; tj: number }

function segInt(
  x1: number, y1: number, x2: number, y2: number,
  x3: number, y3: number, x4: number, y4: number,
): { x: number; y: number; u: number; v: number } | null {
  const d = (x2 - x1) * (y4 - y3) - (y2 - y1) * (x4 - x3)
  if (Math.abs(d) < 1e-12) return null
  const u = ((x3 - x1) * (y4 - y3) - (y3 - y1) * (x4 - x3)) / d
  const v = ((x3 - x1) * (y2 - y1) - (y3 - y1) * (x2 - x1)) / d
  if (u < 0 || u >= 1 || v < 0 || v >= 1) return null
  return { x: x1 + u * (x2 - x1), y: y1 + u * (y2 - y1), u, v }
}

// Self-intersections of the sampled polyline: spatial-hash buckets, test
// non-adjacent segment pairs, sort by ti BEFORE proximity-deduping — the
// sort keeps branch selection stable across small parameter changes
// (ported behavior from lissajous-studio).
export function findIntersections(samples: CurveSample[], dedupeEps: number): CurveNode[] {
  const n = samples.length - 1
  if (n < 4) return []

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (let i = 0; i <= n; i++) {
    const s = samples[i]
    if (s.x < minX) minX = s.x
    if (s.x > maxX) maxX = s.x
    if (s.y < minY) minY = s.y
    if (s.y > maxY) maxY = s.y
  }
  const extent = Math.max(maxX - minX, maxY - minY, 1)
  const hash = new SpatialHash<number>(extent * 0.04)

  for (let i = 0; i < n; i++) {
    const a = samples[i]
    const b = samples[i + 1]
    hash.insertRect(
      Math.min(a.x, b.x), Math.min(a.y, b.y),
      Math.max(a.x, b.x), Math.max(a.y, b.y),
      i,
    )
  }

  const tested = new Set<number>()
  const hits: Hit[] = []
  const dt = TAU / n

  hash.forEachBucket((segs) => {
    for (let p = 0; p < segs.length; p++) {
      for (let q = p + 1; q < segs.length; q++) {
        let i = segs[p]
        let j = segs[q]
        if (i > j) { const tmp = i; i = j; j = tmp }
        // skip adjacent segments, incl. the closing wrap pair
        if (j - i <= 1 || (i === 0 && j === n - 1)) continue
        const pairKey = i * 100000 + j
        if (tested.has(pairKey)) continue
        tested.add(pairKey)

        const a = samples[i], b = samples[i + 1]
        const c = samples[j], d = samples[j + 1]
        const hit = segInt(a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y)
        if (hit) {
          hits.push({ x: hit.x, y: hit.y, ti: (i + hit.u) * dt, tj: (j + hit.v) * dt })
        }
      }
    }
  })

  hits.sort((h1, h2) => h1.ti - h2.ti)

  const epsSq = dedupeEps * dedupeEps
  const nodes: CurveNode[] = []
  for (const h of hits) {
    let dup = false
    for (const k of nodes) {
      const dx = k.x - h.x
      const dy = k.y - h.y
      if (dx * dx + dy * dy < epsSq) { dup = true; break }
    }
    if (!dup) nodes.push({ id: nodes.length, x: h.x, y: h.y, ti: h.ti, tj: h.tj })
  }
  return nodes
}
