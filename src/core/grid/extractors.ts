import type { GridState } from '@/core/state/types'
import type { RankedNode } from '@/core/lissajous/ranking'
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
      last.sources.push(v.id)
    } else {
      out.push({ pos: v.pos, weight: v.weight, sources: [v.id] })
    }
  }
  return out
}

// Force interior boundary count to exactly `target`: drop the lightest
// clusters, then subdivide the widest spans until the count fits.
function fitBoundaries(
  clusters: Cluster[],
  lo: number,
  hi: number,
  targetInterior: number,
  minSpan: number,
): Cluster[] {
  let interior = clusters
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

  while (interior.length < targetInterior) {
    // find widest span (incl. edges) and split it
    const all = [lo, ...interior.map((c) => c.pos), hi]
    let widest = 0
    let widestIdx = 0
    for (let i = 0; i < all.length - 1; i++) {
      const w = all[i + 1] - all[i]
      if (w > widest) { widest = w; widestIdx = i }
    }
    if (widest < minSpan * 2) break
    interior.push({ pos: all[widestIdx] + widest / 2, weight: 0.01, sources: [] })
    interior = interior.sort((a, b) => a.pos - b.pos)
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
  artW: number,
  artH: number,
): EditorialGrid {
  const margin = Math.round(Math.min(artW, artH) * lerp(0.06, 0.12, gridState.marginRestraint))
  const box = { x: margin, y: margin, w: artW - margin * 2, h: artH - margin * 2 }
  const gutter = Math.max(2, gridState.gutterScale * box.w * 0.015)

  // baseline rhythm: quantize a target leading into the content height
  const targetLeading = (box.h / 64) * Math.max(0.25, gridState.baselineRhythm)
  const baseline = box.h / Math.max(8, Math.round(box.h / targetLeading))

  const usable = nodes.filter(
    (n) => n.x > box.x - margin / 2 && n.x < box.x + box.w + margin / 2 &&
           n.y > box.y - margin / 2 && n.y < box.y + box.h + margin / 2,
  )
  const xs = usable.map((n) => ({ pos: n.x, weight: Math.max(0.05, n.score), id: n.id }))
  const ys = usable.map((n) => ({ pos: n.y, weight: Math.max(0.05, n.score), id: n.id }))

  const targetCols = Math.max(2, Math.min(8, Math.round(gridState.columnBias)))
  const targetRows = Math.max(2, Math.min(12, Math.round(gridState.rowBias)))

  // Cluster the crossings, fit to the target counts, then discipline —
  // the grid IS the crossings, evened out so any curve (even the
  // single-crossing 1:2) yields a workable editorial structure. The old
  // raw-projection mode was cut: it collapsed on sparse figures.
  const mergeGap = (box.w * 0.04) / Math.max(0.5, gridState.columnBias / 4)
  const colInterior = fitBoundaries(
    clusterAxis(xs, mergeGap), box.x, box.x + box.w,
    targetCols - 1, box.w / (2 * targetCols),
  )
  const rowInterior = fitBoundaries(
    clusterAxis(ys, box.h * 0.03), box.y, box.y + box.h,
    targetRows - 1, box.h / (2 * targetRows),
  )
  // discipline: snap columns to a micro-unit, rows to the baseline grid
  const unit = box.w / 48
  for (const c of colInterior) c.pos = box.x + Math.round((c.pos - box.x) / unit) * unit
  for (const r of rowInterior) r.pos = box.y + Math.round((r.pos - box.y) / baseline) * baseline

  const columnBoundaries = toGuides('x', box.x, box.x + box.w, colInterior)
  const rowBoundaries = toGuides('y', box.y, box.y + box.h, rowInterior)

  const anchors: EditorialGrid['anchors'] = []
  for (const cx of columnBoundaries) {
    for (const cy of rowBoundaries) anchors.push({ x: cx.pos, y: cy.pos, kind: 'lattice' })
  }
  for (const n of usable) anchors.push({ x: n.x, y: n.y, kind: 'node' })

  return {
    margins: { top: margin, right: margin, bottom: margin, left: margin },
    contentBox: box,
    columnBoundaries,
    rowBoundaries,
    gutter,
    baseline,
    anchors,
    ...suggestZones(rowBoundaries, columnBoundaries, usable),
  }
}
