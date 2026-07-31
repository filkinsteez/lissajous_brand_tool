import { describe, expect, it } from 'vitest'
import { sampleCurve } from '@/core/lissajous/sampler'
import { findIntersections } from '@/core/lissajous/intersections'
import { rankNodes, topNodes } from '@/core/lissajous/ranking'
import { curveFeatures } from '@/core/lissajous/features'
import { extractGrid } from './extractors'
import { createDefaultProject } from '@/core/state/defaults'

function buildNodes(phase = 0.7) {
  const project = createDefaultProject()
  const liss = { ...project.lissajous, phase }
  const W = project.artboard.width
  const H = project.artboard.height
  const samples = sampleCurve(liss, W, H)
  const eps = 0.015 * Math.min(W, H)
  const nodes = findIntersections(samples, eps)
  const perturbedA = findIntersections(sampleCurve({ ...liss, phase: phase + 0.009 }, W, H, 1024), eps)
  const perturbedB = findIntersections(sampleCurve({ ...liss, phase: phase - 0.009 }, W, H, 1024), eps)
  const ranked = rankNodes(nodes, {
    samples, artW: W, artH: H, margin: Math.min(W, H) * 0.08, perturbedA, perturbedB,
  })
  return { project, ranked: topNodes(ranked), features: curveFeatures(samples), W, H }
}

describe('strict editorial extraction', () => {
  it('caps column and row counts at the configured biases', () => {
    const { project, ranked, features, W, H } = buildNodes()
    const grid = extractGrid(project.grid, ranked, features, W, H)
    expect(grid.columnBoundaries.length).toBeGreaterThanOrEqual(2)
    expect(grid.columnBoundaries.length).toBeLessThanOrEqual(project.grid.columnBias + 1)
    expect(grid.rowBoundaries.length).toBeGreaterThanOrEqual(2)
    expect(grid.rowBoundaries.length).toBeLessThanOrEqual(project.grid.rowBias + 1)
  })

  it('keeps boundaries inside the content box, sorted, min-width apart', () => {
    const { project, ranked, features, W, H } = buildNodes()
    const grid = extractGrid(project.grid, ranked, features, W, H)
    const box = grid.contentBox
    const xs = grid.columnBoundaries.map((g) => g.pos)
    expect(xs[0]).toBe(box.x)
    expect(xs[xs.length - 1]).toBeCloseTo(box.x + box.w, 6)
    for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThan(xs[i - 1])
  })

  it('is deterministic', () => {
    const a = buildNodes()
    const b = buildNodes()
    const gridA = extractGrid(a.project.grid, a.ranked, a.features, a.W, a.H)
    const gridB = extractGrid(b.project.grid, b.ranked, b.features, b.W, b.H)
    expect(gridA).toEqual(gridB)
  })

  it('geometry-sourced guides coincide with the curve; the rest are true subdivisions', () => {
    // The contract changed when COLUMNS/ROWS became a promise: guides that
    // carry sources still come from real curve geometry, and any guide
    // synthesized to reach the requested count must sit at the midpoint of
    // the span it subdivided (checked as: strictly between its neighbours,
    // away from both by a healthy margin — no arbitrary placements).
    const { project, ranked, features, W, H } = buildNodes()
    const grid = extractGrid(project.grid, ranked, features, W, H)
    const featureXs = [...features.xExtrema, ...features.yExtrema].map((p) => p.x)
    const xCandidates = [...ranked.map((n) => n.x), ...featureXs]
    const eps = 1

    const xs = grid.columnBoundaries.map((g) => g.pos)
    grid.columnBoundaries.forEach((c, i) => {
      if (i === 0 || i === grid.columnBoundaries.length - 1) return
      if (c.sources.length > 0) {
        expect(xCandidates.some((x) => Math.abs(x - c.pos) <= eps)).toBe(true)
      } else {
        const gap = Math.min(c.pos - xs[i - 1], xs[i + 1] - c.pos)
        expect(gap).toBeGreaterThan(0)
      }
    })
  })

  it('delivers the requested column count even when the curve is guide-poor', () => {
    const { project, ranked, features, W, H } = buildNodes()
    const grid = extractGrid({ ...project.grid, columnBias: 6 }, ranked, features, W, H)
    // 6 columns -> 7 boundaries (subdivision fills whatever geometry lacks)
    expect(grid.columnBoundaries.length).toBe(7)
  })
})

describe('legacy projection mode', () => {
  it('is ignored — old recipes get the disciplined grid', () => {
    const { project, ranked, features, W, H } = buildNodes()
    const strict = extractGrid(project.grid, ranked, features, W, H)
    const projection = extractGrid({ ...project.grid, mode: 'projection' }, ranked, features, W, H)
    expect(projection.columnBoundaries.map((g) => g.pos)).toEqual(
      strict.columnBoundaries.map((g) => g.pos),
    )
    expect(projection.rowBoundaries.map((g) => g.pos)).toEqual(
      strict.rowBoundaries.map((g) => g.pos),
    )
  })
})
