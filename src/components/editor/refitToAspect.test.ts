import { describe, expect, it } from 'vitest'
import { refitToAspect } from './consumeDesignHandoff'

// The round trip's safety net: when a lab render comes back at an aspect
// the block was not authored for, the block reshapes instead of letting
// cover-fit crop the composition away.

const rect = { x: 100, y: 200, w: 300, h: 600 } // 0.5, area 180000

describe('refitToAspect', () => {
  it('takes the requested aspect', () => {
    const r = refitToAspect(rect, 4)
    expect(r.w / r.h).toBeCloseTo(4, 6)
  })

  it('preserves area', () => {
    for (const aspect of [0.25, 0.5, 1, 2, 4]) {
      const r = refitToAspect(rect, aspect)
      expect(r.w * r.h).toBeCloseTo(rect.w * rect.h, 4)
    }
  })

  it('preserves the centre', () => {
    for (const aspect of [0.3, 1, 3]) {
      const r = refitToAspect(rect, aspect)
      expect(r.x + r.w / 2).toBeCloseTo(rect.x + rect.w / 2, 6)
      expect(r.y + r.h / 2).toBeCloseTo(rect.y + rect.h / 2, 6)
    }
  })

  it('is a no-op in shape when the aspect already matches', () => {
    const r = refitToAspect(rect, rect.w / rect.h)
    expect(r.w).toBeCloseTo(rect.w, 6)
    expect(r.h).toBeCloseTo(rect.h, 6)
    expect(r.x).toBeCloseTo(rect.x, 6)
    expect(r.y).toBeCloseTo(rect.y, 6)
  })

  it('survives degenerate input instead of producing NaN', () => {
    const r = refitToAspect({ x: 0, y: 0, w: 0, h: 0 }, 0)
    expect(Number.isFinite(r.w)).toBe(true)
    expect(Number.isFinite(r.h)).toBe(true)
    expect(r.w).toBeGreaterThan(0)
    expect(r.h).toBeGreaterThan(0)
  })
})
