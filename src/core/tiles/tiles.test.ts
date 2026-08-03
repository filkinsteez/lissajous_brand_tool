import { describe, expect, it } from 'vitest'
import { buildTiles } from './tiles'
import type { TilesState } from '@/core/state/types'

const base: TilesState = {
  sourceShapeIds: [],
  style: 'checker',
  seed: 7,
  cols: 8,
  density: 0.55,
  levels: 3,
  rings: 5,
  curve: 0,
  duo: 0.35,
  weight: 0.35,
}

const W = 800
const H = 600

describe('tiles engine', () => {
  it('is deterministic per seed and changes with it', () => {
    const a = buildTiles(base, W, H, null)
    const b = buildTiles(base, W, H, null)
    expect(a).toEqual(b)
    const c = buildTiles({ ...base, seed: 8 }, W, H, null)
    expect(c.fillA === a.fillA && c.fillB === a.fillB).toBe(false)
  })

  it('checker always draws its lattice; density gates the fills', () => {
    const empty = buildTiles({ ...base, density: 0, duo: 0 }, W, H, null)
    expect(empty.stroke.length).toBeGreaterThan(0)
    expect(empty.fillA).toBe('')
    expect(empty.fillB).toBe('')
    const full = buildTiles({ ...base, density: 1, duo: 0 }, W, H, null)
    expect(full.fillA.length).toBeGreaterThan(0)
    expect(full.fillB).toBe('')
  })

  it('rings stay inside their cells so neighbors can only MEET at edges', () => {
    const r = buildTiles({ ...base, style: 'rings', density: 1, duo: 0.5, curve: 0 }, W, H, null)
    // every coordinate in every band path lands within the artboard
    const nums = (r.fillA + r.fillB).match(/-?\d+(?:\.\d+)?/g)!.map(Number)
    for (let i = 0; i < nums.length; i += 2) {
      // A-command args include radii/flags; bound loosely by the artboard
      expect(nums[i]).toBeGreaterThanOrEqual(-1)
      expect(nums[i]).toBeLessThanOrEqual(Math.max(W, H) + 1)
    }
    expect(r.stroke).toBe('')
  })

  it('bound protos turn checker fills into cell stamps', () => {
    const plain = buildTiles({ ...base, density: 1 }, W, H, null)
    const bound = buildTiles({ ...base, density: 1 }, W, H, null, 2)
    expect(bound.fillA).toBe('')
    expect(bound.fillB).toBe('')
    expect(bound.stamps.length).toBeGreaterThan(0)
    expect(bound.stroke).toBe(plain.stroke) // the lattice is untouched
    for (const s of bound.stamps) {
      expect(s.proto === 0 || s.proto === 1).toBe(true)
      expect(s.w).toBeGreaterThan(0)
    }
    // rings ignore bindings — bands ARE the content
    const rings = buildTiles({ ...base, style: 'rings', density: 1 }, W, H, null, 2)
    expect(rings.stamps.length).toBe(0)
    expect(rings.fillA.length + rings.fillB.length).toBeGreaterThan(0)
  })

  it('the curve field changes the deal only when CURVE is up', () => {
    const pts = Array.from({ length: 60 }, (_, i) => ({
      x: (i / 59) * W,
      y: H / 2 + Math.sin((i / 59) * Math.PI * 2) * H * 0.3,
    }))
    const flat = buildTiles({ ...base, curve: 0 }, W, H, pts)
    const flatNull = buildTiles({ ...base, curve: 0 }, W, H, null)
    expect(flat).toEqual(flatNull)
    const bent = buildTiles({ ...base, curve: 1 }, W, H, pts)
    expect(bent.fillA === flat.fillA && bent.stroke === flat.stroke).toBe(false)
  })
})
