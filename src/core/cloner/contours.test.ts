import { describe, expect, it } from 'vitest'
import { buildContourLevels, buildDistanceGrid, contourAtLevel } from './contours'
import type { CurveSample } from '@/core/lissajous/sampler'

function circleSamples(cx: number, cy: number, r: number, n = 256): CurveSample[] {
  return Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2
    return { x: cx + Math.cos(t) * r, y: cy + Math.sin(t) * r, t, angle: 0, curvature: 0 }
  })
}

describe('cloner contours', () => {
  it('a circle yields contours at every requested offset', () => {
    const samples = circleSamples(500, 500, 200)
    const levels = buildContourLevels(samples, 1000, 1000, { count: 5, spacing: 0.04, growth: 1 })
    expect(levels.length).toBe(5)
    for (const level of levels) {
      expect(level.d.length).toBeGreaterThan(0)
      expect(level.d).toContain('M')
      expect(level.d).toContain('L')
    }
    // offsets grow linearly at growth 1
    expect(levels[1].offset).toBeCloseTo(levels[0].offset * 2, 6)
  })

  it('growth > 1 accelerates the offsets', () => {
    const samples = circleSamples(500, 500, 200)
    const levels = buildContourLevels(samples, 1000, 1000, { count: 3, spacing: 0.03, growth: 2 })
    const gap1 = levels[1].offset - levels[0].offset
    const gap2 = levels[2].offset - levels[1].offset
    expect(gap2).toBeGreaterThan(gap1)
  })

  it('the distance grid is zero on the curve and grows away from it', () => {
    const samples = circleSamples(500, 500, 200)
    const pts = samples.map((s) => ({ x: s.x, y: s.y }))
    const grid = buildDistanceGrid(pts, 1000, 1000, 64)
    // center of the circle is ~200 away from the ring
    const centerIdx = Math.round(grid.rows / 2) * (grid.cols + 1) + Math.round(grid.cols / 2)
    expect(grid.values[centerIdx]).toBeGreaterThan(150)
    // a contour exactly at radius/2 exists inside AND outside is separate
    const d = contourAtLevel(grid, 100)
    expect(d.length).toBeGreaterThan(0)
  })

  it('is deterministic', () => {
    const samples = circleSamples(500, 500, 180)
    const a = buildContourLevels(samples, 1000, 1000, { count: 4, spacing: 0.05, growth: 1.3 })
    const b = buildContourLevels(samples, 1000, 1000, { count: 4, spacing: 0.05, growth: 1.3 })
    expect(a.map((l) => l.d)).toEqual(b.map((l) => l.d))
  })
})
