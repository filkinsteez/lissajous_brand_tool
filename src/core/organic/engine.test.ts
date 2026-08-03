import { describe, expect, it } from 'vitest'
import { buildOrganic, densityField } from './engine'
import { chan } from './random'
import { fbm } from './noise'
import { DEFAULT_LAYER_PARAMS } from '@/core/state/defaults'
import type { OrganicState } from '@/core/state/types'

const base: OrganicState = { ...DEFAULT_LAYER_PARAMS.organic, protos: ['blob', 'circle'] }

const diagonal = Array.from({ length: 64 }, (_, i) => ({
  x: (i / 63) * 1000,
  y: (i / 63) * 800,
}))

describe('organic engine', () => {
  it('is deterministic: same recipe, same composition', () => {
    const a = buildOrganic(base, 1000, 800, diagonal, 5)
    const b = buildOrganic(base, 1000, 800, diagonal, 5)
    expect(a.points).toEqual(b.points)
    expect(a.points.length).toBeGreaterThan(100)
  })

  it('random channels are independent: one dial does not reshuffle others', () => {
    const a = buildOrganic(base, 1000, 800, diagonal, 5)
    const b = buildOrganic({ ...base, colorField: 0 }, 1000, 800, diagonal, 5)
    // same survivors at the same positions with the same shapes
    const byId = new Map(b.points.map((p) => [p.id, p]))
    let matched = 0
    for (const p of a.points) {
      const q = byId.get(p.id)
      if (!q) continue
      expect(q.x).toBe(p.x)
      expect(q.y).toBe(p.y)
      expect(q.proto).toBe(p.proto)
      expect(q.scale).toBe(p.scale)
      matched++
    }
    expect(matched).toBe(a.points.length)
  })

  it('reseeding deals a different composition', () => {
    const a = buildOrganic(base, 1000, 800, diagonal, 5)
    const b = buildOrganic({ ...base, seed: base.seed + 1 }, 1000, 800, diagonal, 5)
    const aKey = a.points
      .slice(0, 50)
      .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      .join('|')
    const bKey = b.points
      .slice(0, 50)
      .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      .join('|')
    expect(aKey).not.toBe(bKey)
  })

  it('poisson respects the minimum spacing', () => {
    const p = { ...base, distribution: 'poisson' as const, curvePull: 0, noiseAmount: 0, focalStrength: 0 }
    const { points } = buildOrganic(p, 1000, 800, null, 5)
    const r = p.spacing * 800
    let violations = 0
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        if (Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y) < r * 0.999) violations++
      }
    }
    expect(violations).toBe(0)
    expect(points.length).toBeGreaterThan(200)
  })

  it('curve pull concentrates density near the figure', () => {
    const p = { ...base, curvePull: 1, noiseAmount: 0, focalStrength: 0 }
    const field = densityField(p, 1000, 800, diagonal)
    // on the diagonal vs the far corner
    expect(field(500, 400)).toBeGreaterThan(field(950, 60) + 0.3)
  })

  it('every distribution produces points inside the canvas', () => {
    for (const d of ['poisson', 'phyllo', 'hex', 'curve', 'cluster'] as const) {
      const { points } = buildOrganic({ ...base, distribution: d }, 1000, 800, diagonal, 5)
      expect(points.length).toBeGreaterThan(60)
      for (const pt of points.slice(0, 200)) {
        expect(pt.x).toBeGreaterThan(-40)
        expect(pt.x).toBeLessThan(1040)
        expect(pt.scale).toBeGreaterThan(0)
        expect(pt.opacity).toBeGreaterThan(0)
      }
    }
  })

  it('proto deal is order-free: toggling a proto off and on reshuffles nothing', () => {
    const a = buildOrganic({ ...base, protos: ['blob', 'circle'] }, 1000, 800, diagonal, 5)
    const b = buildOrganic({ ...base, protos: ['circle', 'blob'] }, 1000, 800, diagonal, 5)
    expect(a.points.map((p) => `${p.id}:${p.proto}`)).toEqual(
      b.points.map((p) => `${p.id}:${p.proto}`),
    )
    // adding a proto only reassigns points that WIN it — the rest hold
    const c = buildOrganic({ ...base, protos: ['blob', 'circle', 'star'] }, 1000, 800, diagonal, 5)
    const byId = new Map(c.points.map((p) => [p.id, p.proto]))
    for (const p of a.points) {
      const now = byId.get(p.id)
      if (now !== 'star') expect(now).toBe(p.proto)
    }
  })

  it('sizeField sign genuinely flips direction', () => {
    const grow = buildOrganic({ ...base, sizeField: 1, sizeRange: 0 }, 1000, 800, diagonal, 5)
    const shrink = buildOrganic({ ...base, sizeField: -1, sizeRange: 0 }, 1000, 800, diagonal, 5)
    // compare the same point at high field: positive grows it, negative shrinks it
    const dense = grow.points.filter((p) => p.field > 0.6).slice(0, 40)
    const shrinkById = new Map(shrink.points.map((p) => [p.id, p]))
    let checked = 0
    for (const p of dense) {
      const q = shrinkById.get(p.id)
      if (!q) continue
      expect(p.scale).toBeGreaterThan(q.scale)
      checked++
    }
    expect(checked).toBeGreaterThan(3)
  })

  it('noise and channels are stationary and seeded', () => {
    expect(fbm(7, 1.5, 2.5)).toBe(fbm(7, 1.5, 2.5))
    expect(fbm(7, 1.5, 2.5)).not.toBe(fbm(8, 1.5, 2.5))
    expect(chan(1, 2, 'x')).toBe(chan(1, 2, 'x'))
    expect(chan(1, 2, 'x')).not.toBe(chan(1, 2, 'y'))
    expect(chan(1, 2, 'x')).not.toBe(chan(1, 3, 'x'))
    // uniform-ish: mean of many samples near 0.5
    let sum = 0
    for (let i = 0; i < 2000; i++) sum += chan(5, i, 'meantest')
    expect(Math.abs(sum / 2000 - 0.5)).toBeLessThan(0.03)
  })
})
