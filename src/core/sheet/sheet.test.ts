import { describe, expect, it } from 'vitest'
import { buildSheetClones, metaUnitOutline, unitPolygon } from './sheet'
import type { SheetState } from '@/core/state/types'

const base: SheetState = {
  enabled: true,
  shape: 'circle',
  layout: 'grid',
  countX: 4,
  countY: 5,
  countZ: 1,
  size: 0.5,
  depth: 0.4,
  random: 0,
  noise: 0,
  strokeMix: 0,
  curve: 0,
  tone: 'paper',
}

const diagonal: { x: number; y: number }[] = Array.from({ length: 64 }, (_, i) => ({
  x: (i / 63) * 1000,
  y: 500,
}))

describe('sheet grid cloner', () => {
  it('produces countX x countY x countZ clones on a regular grid', () => {
    const clones = buildSheetClones(base, 1000, 1000, 7)
    expect(clones.length).toBe(20)
    // no jitter: clones sit exactly at cell centers
    expect(clones[0].rotate).toBe(0)
    const xs = new Set(clones.map((c) => Math.round(c.x)))
    expect(xs.size).toBe(4)
    const z2 = buildSheetClones({ ...base, countZ: 3 }, 1000, 1000, 7)
    expect(z2.length).toBe(60)
  })

  it('RANDOM jitters deterministically per seed', () => {
    const a = buildSheetClones({ ...base, random: 0.6 }, 1000, 1000, 7)
    const b = buildSheetClones({ ...base, random: 0.6 }, 1000, 1000, 7)
    const c = buildSheetClones({ ...base, random: 0.6 }, 1000, 1000, 8)
    expect(a).toEqual(b)
    expect(a.map((k) => k.x)).not.toEqual(c.map((k) => k.x))
    // jitter actually moves clones off their cell centers
    const clean = buildSheetClones(base, 1000, 1000, 7)
    const moved = a.filter((k, i) => Math.abs(k.x - clean[i].x) > 1).length
    expect(moved).toBeGreaterThan(a.length / 2)
  })

  it('DEPTH stacks layers: deeper clones are larger, drifted, fainter', () => {
    const clones = buildSheetClones({ ...base, countZ: 2, depth: 1 }, 1000, 1000, 7)
    const front = clones.filter((c) => c.z === 0)
    const back = clones.filter((c) => c.z === 1)
    expect(back[0].r).toBeGreaterThan(front[0].r)
    expect(back[0].opacity).toBeLessThan(front[0].opacity)
    // back layers come first so the front draws on top
    expect(clones[0].z).toBe(1)
    expect(clones[clones.length - 1].z).toBe(0)
  })

  it('mixed shape assigns per-clone shapes from the full set', () => {
    const clones = buildSheetClones({ ...base, shape: 'mixed', countX: 8, countY: 8 }, 1000, 1000, 7)
    const shapes = new Set(clones.map((c) => c.shape))
    expect(shapes.size).toBeGreaterThan(2) // the type itself excludes 'mixed'
  })

  it('the meta glyph is a normalized unit outline', () => {
    const pts = metaUnitOutline()
    expect(pts.length).toBeGreaterThan(32)
    for (const p of pts) {
      expect(Math.abs(p.x)).toBeLessThanOrEqual(1.001)
      expect(Math.abs(p.y)).toBeLessThanOrEqual(1.001)
    }
    expect(unitPolygon('triangle').length).toBe(3)
    expect(unitPolygon('square').length).toBe(4)
    expect(unitPolygon('cross').length).toBe(12)
  })

  it('PACKED layout yields mixed cell sizes', () => {
    const clones = buildSheetClones({ ...base, layout: 'packed', countX: 8 }, 1000, 1000, 7)
    const sizes = new Set(clones.map((c) => Math.round(c.r)))
    expect(sizes.size).toBeGreaterThan(1) // big cells coexist with subdivided ones
    expect(clones.length).toBeGreaterThan(10)
  })

  it('STROKE MIX splits the population and NOISE keeps it deterministic', () => {
    const clones = buildSheetClones(
      { ...base, strokeMix: 0.5, noise: 0.8, countX: 10, countY: 10 },
      1000, 1000, 7,
    )
    const stroked = clones.filter((c) => c.stroked).length
    expect(stroked).toBeGreaterThan(clones.length * 0.2)
    expect(stroked).toBeLessThan(clones.length * 0.8)
    const again = buildSheetClones(
      { ...base, strokeMix: 0.5, noise: 0.8, countX: 10, countY: 10 },
      1000, 1000, 7,
    )
    expect(again).toEqual(clones)
  })

  it('NOISE varies size in patches even with zero RANDOM', () => {
    const clones = buildSheetClones({ ...base, noise: 1, countX: 12, countY: 12 }, 1000, 1000, 7)
    const rs = clones.map((c) => c.r)
    expect(new Set(rs.map((r) => Math.round(r))).size).toBeGreaterThan(3)
  })

  it('COUNT Y drives the packed layout too', () => {
    const a = buildSheetClones({ ...base, layout: 'packed', countY: 4 }, 1000, 1000, 7)
    const b = buildSheetClones({ ...base, layout: 'packed', countY: 16 }, 1000, 1000, 7)
    expect(b.length).toBeGreaterThan(a.length)
  })

  it('the meta glyph is always a line drawing', () => {
    const clones = buildSheetClones(
      { ...base, shape: 'meta', strokeMix: 0, countX: 4, countY: 4 },
      1000, 1000, 7,
    )
    expect(clones.every((c) => c.stroked)).toBe(true)
  })

  it('the CURVE effector swells clones near the figure and fills inside it', () => {
    // the "figure" here is a horizontal line at y=500: no inside, but the
    // band should swell sizes near it and shrink them far away
    const clones = buildSheetClones(
      { ...base, curve: 1, countX: 10, countY: 10 },
      1000, 1000, 7,
      diagonal,
    )
    const near = clones.filter((c) => Math.abs(c.y - 500) < 80)
    const far = clones.filter((c) => Math.abs(c.y - 500) > 350)
    const mean = (a: typeof clones) => a.reduce((s, c) => s + c.r, 0) / a.length
    expect(mean(near)).toBeGreaterThan(mean(far) * 1.3)
    // without curve points the effector is inert
    const off = buildSheetClones({ ...base, curve: 1, countX: 10, countY: 10 }, 1000, 1000, 7)
    expect(new Set(off.map((c) => Math.round(c.r))).size).toBe(1)
  })
})
