import type { ProjectState } from './state/types'
import { sampleCurve, type CurveSample } from './lissajous/sampler'
import { findIntersections, type CurveNode } from './lissajous/intersections'
import { rankNodes, topNodes, type RankedNode } from './lissajous/ranking'
import { curveFeatures, type CurveFeatures } from './lissajous/features'
import { extractGrid } from './grid/extractors'
import type { EditorialGrid } from './grid/types'
import { lbsDebug } from './state/debug'

export type Derived = {
  samples: CurveSample[]
  intersections: CurveNode[]
  ranked: RankedNode[]
  primary: RankedNode[]
  features: CurveFeatures
  grid: EditorialGrid
}

const PHASE_EPS = (0.5 * Math.PI) / 180

let cacheKey = ''
let cacheVal: Derived | null = null

// Memoized derived-data pipeline: lissajous → samples → intersections →
// ranking → grid. Pure function of project state; React components and the
// render loop both read through here, so everything stays in lockstep.
export function getDerived(project: ProjectState): Derived {
  const { lissajous: liss, grid: gridState, artboard } = project
  const key = JSON.stringify([liss, gridState, artboard.width, artboard.height])
  if (cacheVal && key === cacheKey) return cacheVal

  const t0 = performance.now()
  const W = artboard.width
  const H = artboard.height

  const samples = sampleCurve(liss, W, H)
  const features = curveFeatures(samples)
  const dedupeEps = 0.015 * Math.min(W, H)
  const intersections = findIntersections(samples, dedupeEps)

  // stability probes run at half density: they only need survival, not precision
  const probeN = Math.max(512, Math.floor(liss.sampleDensity / 2))
  const perturbedA = findIntersections(
    sampleCurve({ ...liss, phase: liss.phase + PHASE_EPS }, W, H, probeN), dedupeEps)
  const perturbedB = findIntersections(
    sampleCurve({ ...liss, phase: liss.phase - PHASE_EPS }, W, H, probeN), dedupeEps)

  const margin = Math.min(W, H) * 0.08
  const ranked = rankNodes(intersections, { samples, artW: W, artH: H, margin, perturbedA, perturbedB })
  const primary = topNodes(ranked)
  // explicit node selection (setup mode click) overrides the automatic top-K
  const selected = gridState.selectedNodeIds.length
    ? ranked.filter((n) => gridState.selectedNodeIds.includes(n.id))
    : null
  const grid = extractGrid(
    gridState,
    selected && selected.length >= 2 ? selected : primary,
    features,
    W,
    H,
  )

  cacheKey = key
  cacheVal = { samples, intersections, ranked, primary, features, grid }

  lbsDebug('intersections', intersections)
  lbsDebug('ranked', ranked)
  lbsDebug('primary', primary)
  lbsDebug('grid', grid)
  lbsDebug('deriveMs', Math.round((performance.now() - t0) * 10) / 10)

  return cacheVal
}
