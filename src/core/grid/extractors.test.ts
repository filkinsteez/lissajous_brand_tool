import { describe, expect, it } from 'vitest'
import { sampleCurve } from '@/core/lissajous/sampler'
import { findIntersections } from '@/core/lissajous/intersections'
import { rankNodes, topNodes } from '@/core/lissajous/ranking'
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
  return { project, ranked: topNodes(ranked), W, H }
}

describe('strict editorial extraction', () => {
  it('produces the biased column and row counts', () => {
    const { project, ranked, W, H } = buildNodes()
    const grid = extractGrid(project.grid, ranked, W, H)
    expect(grid.columnBoundaries.length).toBe(project.grid.columnBias + 1) // 6 cols
    expect(grid.rowBoundaries.length).toBe(project.grid.rowBias + 1) // 8 rows
  })

  it('keeps boundaries inside the content box, sorted, min-width apart', () => {
    const { project, ranked, W, H } = buildNodes()
    const grid = extractGrid(project.grid, ranked, W, H)
    const box = grid.contentBox
    const xs = grid.columnBoundaries.map((g) => g.pos)
    expect(xs[0]).toBe(box.x)
    expect(xs[xs.length - 1]).toBeCloseTo(box.x + box.w, 6)
    for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThan(xs[i - 1])
  })

  it('is deterministic', () => {
    const a = buildNodes()
    const b = buildNodes()
    const gridA = extractGrid(a.project.grid, a.ranked, a.W, a.H)
    const gridB = extractGrid(b.project.grid, b.ranked, b.W, b.H)
    expect(gridA).toEqual(gridB)
  })

  it('rows land on the baseline rhythm', () => {
    const { project, ranked, W, H } = buildNodes()
    const grid = extractGrid(project.grid, ranked, W, H)
    for (const r of grid.rowBoundaries.slice(1, -1)) {
      const offset = (r.pos - grid.contentBox.y) / grid.baseline
      expect(Math.abs(offset - Math.round(offset))).toBeLessThan(1e-6)
    }
  })
})

describe('projection extraction', () => {
  it('emits one guide pair per usable node cluster with source tracking', () => {
    const { project, ranked, W, H } = buildNodes()
    const grid = extractGrid({ ...project.grid, mode: 'projection' }, ranked, W, H)
    const interior = grid.columnBoundaries.slice(1, -1)
    expect(interior.length).toBeGreaterThan(0)
    for (const g of interior) expect(g.sources.length).toBeGreaterThan(0)
  })
})
