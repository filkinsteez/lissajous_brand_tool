import { describe, expect, it } from 'vitest'
import { buildRepeats } from './repeater'
import type { RepeaterState } from '@/core/state/types'

const base: RepeaterState = {
  shape: 'circle',
  mode: 'linear',
  count: 6,
  countX: 4,
  countY: 3,
  size: 0.1,
  originX: 0.2,
  originY: 0.2,
  stepX: 0.1,
  stepY: 0.05,
  radius: 0.3,
  span: Math.PI * 2,
  rotate: 0.2,
  scaleStep: 0.9,
  fade: 0.5,
  stroked: false,
}

describe('repeater', () => {
  it('LINEAR steps position, rotation and scale arithmetically/geometrically', () => {
    const reps = buildRepeats(base, 1000, 1000)
    expect(reps.length).toBe(6)
    // arithmetic position progression
    const dx1 = reps[1].x - reps[0].x
    const dx2 = reps[2].x - reps[1].x
    expect(dx1).toBeCloseTo(dx2, 6)
    expect(dx1).toBeCloseTo(100, 6)
    // accumulated rotation
    expect(reps[3].rotate).toBeCloseTo(0.6, 6)
    // geometric scale
    expect(reps[2].r / reps[1].r).toBeCloseTo(0.9, 6)
    // fade ramps down
    expect(reps[5].opacity).toBeLessThan(reps[0].opacity)
  })

  it('RADIAL rides a ring around the origin, oriented along the spokes', () => {
    const reps = buildRepeats(
      { ...base, mode: 'radial', rotate: 0, scaleStep: 1, count: 8 },
      1000, 1000,
    )
    for (const c of reps) {
      const d = Math.hypot(c.x - 200, c.y - 200)
      expect(d).toBeCloseTo(300, 4)
    }
    // full circle: evenly spaced, no doubled endpoint
    const a0 = Math.atan2(reps[0].y - 200, reps[0].x - 200)
    const a1 = Math.atan2(reps[1].y - 200, reps[1].x - 200)
    expect(Math.abs(a1 - a0)).toBeCloseTo((Math.PI * 2) / 8, 4)
  })

  it('partial spans reach both ends', () => {
    const reps = buildRepeats(
      { ...base, mode: 'radial', span: Math.PI / 2, rotate: 0, count: 5 },
      1000, 1000,
    )
    const angles = reps.map((c) => Math.atan2(c.y - 200, c.x - 200))
    expect(angles[0]).toBeCloseTo(-Math.PI / 2, 4)
    expect(angles[4]).toBeCloseTo(0, 4)
  })

  it('GRID lays countX×countY cells centered on the origin, sweeping in reading order', () => {
    const reps = buildRepeats(
      { ...base, mode: 'grid', originX: 0.5, originY: 0.5 },
      1000, 1000,
    )
    expect(reps.length).toBe(12)
    // centered: mean position sits on the origin
    const mx = reps.reduce((s, c) => s + c.x, 0) / reps.length
    const my = reps.reduce((s, c) => s + c.y, 0) / reps.length
    expect(mx).toBeCloseTo(500, 4)
    expect(my).toBeCloseTo(500, 4)
    // cell spacing is the step (row-major: neighbors in x, rows in y)
    expect(reps[1].x - reps[0].x).toBeCloseTo(100, 6)
    expect(reps[4].y - reps[0].y).toBeCloseTo(50, 6)
    // accumulation runs by reading-order index
    expect(reps[5].rotate).toBeCloseTo(1.0, 6)
    expect(reps[11].opacity).toBeLessThan(reps[0].opacity)
  })

  it('meta stays a line drawing and mixed cycles the vocabulary', () => {
    const metas = buildRepeats({ ...base, shape: 'meta', stroked: false }, 1000, 1000)
    expect(metas.every((c) => c.stroked)).toBe(true)
    const mixed = buildRepeats({ ...base, shape: 'mixed', count: 8 }, 1000, 1000)
    expect(new Set(mixed.map((c) => c.shape)).size).toBeGreaterThan(3)
  })
})
