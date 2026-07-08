import type { GridState } from '@/core/state/types'
import type { RankedNode } from '@/core/lissajous/ranking'
import type { CurveFeatures } from '@/core/lissajous/features'
import type { EditorialGrid, GridGuide } from './types'

type Cluster = { pos: number; weight: number; sources: number[] }

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

// Agglomerative 1-D clustering of node coordinates. Nodes closer than
// mergeGap collapse into one score-weighted guide position.
function clusterAxis(
  values: { pos: number; weight: number; id: number }[],
  mergeGap: number,
): Cluster[] {
  const sorted = [...values].sort((a, b) => a.pos - b.pos)
  const out: Cluster[] = []
  for (const v of sorted) {
    const last = out[out.length - 1]
    if (last && v.pos - last.pos < mergeGap) {
      const w = last.weight + v.weight
      last.pos = (last.pos * last.weight + v.pos * v.weight) / w
      last.weight = w
      if (v.id >= 0) last.sources.push(v.id)
    } else {
      out.push({ pos: v.pos, weight: v.weight, sources: v.id >= 0 ? [v.id] : [] })
    }
  }
  return out
}

// Force interior boundary count to at most `target`: keep the strongest
// clusters and enforce a minimum span, but never synthesize geometry.
function fitBoundaries(
  clusters: Cluster[],
  lo: number,
  hi: number,
  targetInterior: number,
  minSpan: number,
): Cluster[] {
  const interior = clusters
    .filter((c) => c.pos > lo + minSpan / 2 && c.pos < hi - minSpan / 2)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, targetInterior)
    .sort((a, b) => a.pos - b.pos)

  // enforce minimum span between neighbours (keep the heavier one)
  let changed = true
  while (changed) {
    changed = false
    for (let i = 0; i < interior.length - 1; i++) {
      if (interior[i + 1].pos - interior[i].pos < minSpan) {
        interior.splice(interior[i + 1].weight > interior[i].weight ? i : i + 1, 1)
        changed = true
        break
      }
    }
  }

  return interior
}

function toGuides(axis: 'x' | 'y', lo: number, hi: number, interior: Cluster[]): GridGuide[] {
  const guides: GridGuide[] = [
    { id: `${axis}0`, axis, pos: lo, sources: [] },
    ...interior.map((c, i) => ({ id: `${axis}${i + 1}`, axis, pos: c.pos, sources: c.sources })),
    { id: `${axis}${interior.length + 1}`, axis, pos: hi, sources: [] },
  ]
  return guides
}

function suggestZones(
  rowBoundaries: GridGuide[],
  columnBoundaries: GridGuide[],
  nodes: RankedNode[],
): Pick<EditorialGrid, 'headlineBand' | 'captionCell'> {
  // headline: the widest row band in the lower two thirds with the fewest nodes
  let best = { y: 0, h: 0, crowd: Infinity }
  for (let i = 0; i < rowBoundaries.length - 1; i++) {
    const y = rowBoundaries[i].pos
    const h = rowBoundaries[i + 1].pos - y
    const yMin = rowBoundaries[0].pos
    const yMax = rowBoundaries[rowBoundaries.length - 1].pos
    if (y < yMin + (yMax - yMin) * 0.33) continue
    const crowd = nodes.filter((n) => n.y >= y && n.y < y + h).length / Math.max(1, h)
    if (crowd < best.crowd || (crowd === best.crowd && h > best.h)) best = { y, h, crowd }
  }
  const x0 = columnBoundaries[0].pos
  const x1 = columnBoundaries[Math.min(2, columnBoundaries.length - 1)].pos
  const captionCell = {
    x: x0,
    y: rowBoundaries[0].pos,
    w: x1 - x0,
    h: rowBoundaries[Math.min(1, rowBoundaries.length - 1)].pos - rowBoundaries[0].pos,
  }
  return { headlineBand: { y: best.y, h: best.h }, captionCell }
}

export function extractGrid(
  gridState: GridState,
  nodes: RankedNode[],
  features: CurveFeatures,
  artW: number,
  artH: number,
): EditorialGrid {
  const margin = 0
  const allFeatures = [...features.xExtrema, ...features.yExtrema]
  const geom = [
    ...nodes.map((n) => ({ x: n.x, y: n.y })),
    ...allFeatures.map((p) => ({ x: p.x, y: p.y })),
  ]
  let box: { x: number; y: number; w: number; h: number }
  if (geom.length >= 2) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const p of geom) {
      if (p.x < minX) minX = p.x
      if (p.x > maxX) maxX = p.x
      if (p.y < minY) minY = p.y
      if (p.y > maxY) maxY = p.y
    }
    const x0 = Math.max(0, minX - margin)
    const y0 = Math.max(0, minY - margin)
    const x1 = Math.min(artW, maxX + margin)
    const y1 = Math.min(artH, maxY + margin)
    box = { x: x0, y: y0, w: Math.max(8, x1 - x0), h: Math.max(8, y1 - y0) }
  } else {
    const fallback = Math.round(Math.min(artW, artH) * 0.08)
    box = { x: fallback, y: fallback, w: artW - fallback * 2, h: artH - fallback * 2 }
  }
  const gutter = Math.max(2, gridState.gutterScale * box.w * 0.015)

  // baseline rhythm: quantize a target leading into the content height
  const targetLeading = (box.h / 64) * Math.max(0.25, gridState.baselineRhythm)
  const baseline = box.h / Math.max(8, Math.round(box.h / targetLeading))

  const usableNodes = nodes.filter(
    (n) => n.x > box.x - margin / 2 && n.x < box.x + box.w + margin / 2 &&
           n.y > box.y - margin / 2 && n.y < box.y + box.h + margin / 2,
  )
  const usableFeatures = allFeatures.filter(
    (p) => p.x > box.x - margin / 2 && p.x < box.x + box.w + margin / 2 &&
           p.y > box.y - margin / 2 && p.y < box.y + box.h + margin / 2,
  )

  const xs = [
    ...usableNodes.map((n) => ({ pos: n.x, weight: Math.max(0.05, n.score), id: n.id })),
    ...usableFeatures.map((p) => ({ pos: p.x, weight: 0.35, id: -1 })),
  ]
  const ys = [
    ...usableNodes.map((n) => ({ pos: n.y, weight: Math.max(0.05, n.score), id: n.id })),
    ...usableFeatures.map((p) => ({ pos: p.y, weight: 0.35, id: -1 })),
  ]

  const targetCols = Math.max(2, Math.min(8, Math.round(gridState.columnBias)))
  const targetRows = Math.max(2, Math.min(12, Math.round(gridState.rowBias)))

  // Cluster crossing/extrema candidates and cap to target counts. We never
  // synthesize mid-span guides; every interior guide comes from real geometry.
  const mergeGap = (box.w * 0.04) / Math.max(0.5, gridState.columnBias / 4)
  const colInterior = fitBoundaries(
    clusterAxis(xs, mergeGap), box.x, box.x + box.w,
    targetCols - 1, box.w / (2 * targetCols),
  )
  const rowInterior = fitBoundaries(
    clusterAxis(ys, box.h * 0.03), box.y, box.y + box.h,
    targetRows - 1, box.h / (2 * targetRows),
  )

  const columnBoundaries = toGuides('x', box.x, box.x + box.w, colInterior)
  const rowBoundaries = toGuides('y', box.y, box.y + box.h, rowInterior)

  const anchors: EditorialGrid['anchors'] = []
  for (const cx of columnBoundaries) {
    for (const cy of rowBoundaries) anchors.push({ x: cx.pos, y: cy.pos, kind: 'lattice' })
  }
  for (const n of usableNodes) anchors.push({ x: n.x, y: n.y, kind: 'node' })

  return {
    margins: { top: margin, right: margin, bottom: margin, left: margin },
    contentBox: box,
    columnBoundaries,
    rowBoundaries,
    gutter,
    baseline,
    anchors,
    ...suggestZones(rowBoundaries, columnBoundaries, usableNodes),
  }
}
