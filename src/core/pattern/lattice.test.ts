import { describe, expect, it } from 'vitest'
import { buildLattice } from './lattice'
import type { CurveSample } from '@/core/lissajous/sampler'

function lineSamples(y: number, width: number, n = 128): CurveSample[] {
  return Array.from({ length: n }, (_, i) => ({
    x: (i / (n - 1)) * width,
    y,
    t: i / (n - 1),
    angle: 0,
    curvature: 0,
  }))
}

describe('pattern lattice', () => {
  it('cells on the curve become squares, far cells stay dots', () => {
    const tiers = buildLattice(lineSamples(500, 1000), 1000, 1000, {
      cells: 20,
      size: 0.6,
      range: 1.5,
      mode: 'lattice',
    })
    expect(tiers.squares.length).toBeGreaterThan(0)
    expect(tiers.dots.length).toBeGreaterThan(0)
    // the ramp exists: intermediate tiers fire too
    expect(tiers.rings.length + tiers.circles.length).toBeGreaterThan(0)
  })

  it('trace mode drops the baseline lattice', () => {
    const tiers = buildLattice(lineSamples(500, 1000), 1000, 1000, {
      cells: 20,
      size: 0.6,
      range: 1.5,
      mode: 'trace',
    })
    expect(tiers.dots).toBe('')
    expect(tiers.squares.length).toBeGreaterThan(0)
  })

  it('is deterministic and honors the transform', () => {
    const samples = lineSamples(500, 1000)
    const a = buildLattice(samples, 1000, 1000, { cells: 16, size: 0.5, range: 1.5, mode: 'lattice' })
    const b = buildLattice(samples, 1000, 1000, { cells: 16, size: 0.5, range: 1.5, mode: 'lattice' })
    expect(a).toEqual(b)
    const shifted = buildLattice(
      samples, 1000, 1000,
      { cells: 16, size: 0.5, range: 1.5, mode: 'lattice' },
      { scale: 1, offsetX: 0, offsetY: 0.3 },
    )
    expect(shifted.squares).not.toEqual(a.squares)
  })
})

describe('drawn proto stamps', () => {
  const opts = { cells: 20, size: 0.6, range: 1.5, mode: 'lattice' as const }

  it('no drawn protos: stamps stay empty and the tiers are untouched', () => {
    const samples = lineSamples(500, 1000)
    const bare = buildLattice(samples, 1000, 1000, opts)
    expect(bare.stamps).toEqual([])
    expect(bare.squares.length).toBeGreaterThan(0)
    // drawnCount 0 must be byte-identical to the argument being absent
    expect(buildLattice(samples, 1000, 1000, opts, undefined, 0)).toEqual(bare)
  })

  it('the deal is deterministic and every index is in range', () => {
    const samples = lineSamples(500, 1000)
    const a = buildLattice(samples, 1000, 1000, opts, undefined, 3)
    const b = buildLattice(samples, 1000, 1000, opts, undefined, 3)
    expect(a.stamps).toEqual(b.stamps)
    expect(a.stamps.length).toBeGreaterThan(0)
    for (const s of a.stamps) {
      expect(s.protoIndex).toBeGreaterThanOrEqual(0)
      expect(s.protoIndex).toBeLessThan(3)
    }
    // substitution replaces the tiers, never doubles them
    expect(a.dots + a.circles + a.rings + a.squares).toBe('')
  })

  it('stamps keep the lattice: every cell stamped, sizes on the band ladder', () => {
    const samples = lineSamples(500, 1000)
    const a = buildLattice(samples, 1000, 1000, opts, undefined, 3)
    // cells:20 on a square artboard -> 20x20 grid, r = 0.6*50/2
    expect(a.stamps.length).toBe(400)
    const r = (0.6 * 50) / 2
    const ladder = new Set([r * 0.9, r * 0.85, r * 0.55, r * 0.2])
    for (const s of a.stamps) expect(ladder.has(s.r)).toBe(true)
    // trace mode drops the far cells, same as the dots tier
    const trace = buildLattice(samples, 1000, 1000, { ...opts, mode: 'trace' }, undefined, 3)
    expect(trace.stamps.length).toBeLessThan(400)
    expect(trace.stamps.every((s) => s.r !== r * 0.2)).toBe(true)
    // the deal rides the cell, not the count: positions and sizes are
    // identical under a different proto count
    const five = buildLattice(samples, 1000, 1000, opts, undefined, 5)
    expect(five.stamps.map(({ x, y, r: rr }) => ({ x, y, rr }))).toEqual(
      a.stamps.map(({ x, y, r: rr }) => ({ x, y, rr })),
    )
  })
})
