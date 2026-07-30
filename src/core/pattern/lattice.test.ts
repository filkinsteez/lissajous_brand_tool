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
