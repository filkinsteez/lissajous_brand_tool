import { describe, expect, it } from 'vitest'
import {
  coherenceField,
  constantField,
  fieldFromMap,
  fitRect,
  invertField,
  lerpFields,
  mulFields,
  remapField,
} from './field'

describe('fitRect', () => {
  it('contain letterboxes, cover crops', () => {
    expect(fitRect(100, 50, 200, 200, 'contain')).toEqual({ x: 0, y: 50, w: 200, h: 100 })
    expect(fitRect(100, 50, 200, 200, 'cover')).toEqual({ x: -100, y: 0, w: 400, h: 200 })
  })
})

describe('fieldFromMap', () => {
  const rect = { x: 10, y: 10, w: 80, h: 80 }
  const f = fieldFromMap(Float32Array.from([0, 1, 0, 1]), 2, 2, rect)

  it('is 0 outside the rect and interpolated inside', () => {
    expect(f(0, 0)).toBe(0)
    expect(f(200, 50)).toBe(0)
    expect(f(50, 50)).toBeCloseTo(0.5, 3)
  })
})

describe('coherenceField', () => {
  const rect = { x: 0, y: 0, w: 100, h: 100 }

  it('is deterministic per seed and channel', () => {
    const a = coherenceField(7, rect, 6, 'lab.region')
    const b = coherenceField(7, rect, 6, 'lab.region')
    const c = coherenceField(8, rect, 6, 'lab.region')
    const d = coherenceField(7, rect, 6, 'other')
    expect(a(33, 61)).toBe(b(33, 61))
    expect(a(33, 61)).not.toBe(c(33, 61))
    expect(a(33, 61)).not.toBe(d(33, 61))
  })

  it('stays in [0, 1) and varies smoothly', () => {
    const f = coherenceField(3, rect, 5, 'lab.region')
    for (let i = 0; i < 50; i++) {
      const v = f(i * 2, 97 - i)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
    // neighbors on a broad lattice barely differ
    expect(Math.abs(f(50, 50) - f(51, 50))).toBeLessThan(0.06)
  })
})

describe('combinators', () => {
  it('mul, lerp, remap, invert behave', () => {
    const half = constantField(0.5)
    const one = constantField(1)
    expect(mulFields(half, one)(0, 0)).toBe(0.5)
    expect(lerpFields(constantField(0), one, 0.25)(0, 0)).toBe(0.25)
    expect(remapField(half, 0.5, 1)(0, 0)).toBe(0)
    expect(remapField(constantField(0.75), 0.5, 1)(0, 0)).toBeCloseTo(0.5, 5)
    expect(invertField(half)(0, 0)).toBe(0.5)
    expect(invertField(one)(0, 0)).toBe(0)
  })
})
