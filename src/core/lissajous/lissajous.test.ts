import { describe, expect, it } from 'vitest'
import { sampleCurve } from './sampler'
import { findIntersections } from './intersections'
import type { LissajousState } from '@/core/state/types'

const base: LissajousState = {
  frequencyX: 3,
  frequencyY: 2,
  phase: 0.7, // generic phase — degenerate phases can collapse crossings
  amplitudeX: 0.9,
  amplitudeY: 0.9,
  rotation: 0,
  offsetX: 0,
  offsetY: 0,
  sampleDensity: 2048,
}

const W = 1200
const H = 1600

describe('sampleCurve', () => {
  it('is a closed curve in artboard space', () => {
    const s = sampleCurve(base, W, H)
    expect(s[0].x).toBeCloseTo(s[s.length - 1].x, 6)
    expect(s[0].y).toBeCloseTo(s[s.length - 1].y, 6)
  })

  it('stays inside the amplitude box', () => {
    const s = sampleCurve(base, W, H)
    for (const p of s) {
      expect(p.x).toBeGreaterThanOrEqual(W / 2 - 0.9 * (W / 2) - 1e-6)
      expect(p.x).toBeLessThanOrEqual(W / 2 + 0.9 * (W / 2) + 1e-6)
      expect(p.y).toBeGreaterThanOrEqual(H / 2 - 0.9 * (H / 2) - 1e-6)
      expect(p.y).toBeLessThanOrEqual(H / 2 + 0.9 * (H / 2) + 1e-6)
    }
  })

  it('computes finite tangents and curvature everywhere', () => {
    const s = sampleCurve(base, W, H)
    for (const p of s) {
      expect(Number.isFinite(p.angle)).toBe(true)
      expect(Number.isFinite(p.curvature)).toBe(true)
    }
  })
})

describe('findIntersections', () => {
  it('finds 2ab - a - b crossings for coprime 3:2 at a generic phase', () => {
    const s = sampleCurve(base, W, H)
    const nodes = findIntersections(s, 0.015 * Math.min(W, H))
    expect(nodes.length).toBe(2 * 3 * 2 - 3 - 2) // 7
  })

  it('finds 2ab - a - b crossings for 5:4 at a generic phase', () => {
    const s = sampleCurve({ ...base, frequencyX: 5, frequencyY: 4 }, W, H)
    const nodes = findIntersections(s, 0.015 * Math.min(W, H))
    expect(nodes.length).toBe(2 * 5 * 4 - 5 - 4) // 31
  })

  it('is deterministic and sorted by ti', () => {
    const s = sampleCurve(base, W, H)
    const a = findIntersections(s, 0.015 * Math.min(W, H))
    const b = findIntersections(s, 0.015 * Math.min(W, H))
    expect(a).toEqual(b)
    for (let i = 1; i < a.length; i++) expect(a[i].ti).toBeGreaterThan(a[i - 1].ti)
    a.forEach((n, i) => expect(n.id).toBe(i))
  })
})
