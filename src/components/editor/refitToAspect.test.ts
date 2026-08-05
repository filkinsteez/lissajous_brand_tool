import { describe, expect, it } from 'vitest'
import { clampToArtboard, refitToAspect } from './consumeDesignHandoff'
import { inscribeAspect } from '@/core/grid/types'

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

  it('holds extreme aspects instead of clamping them into a crop', () => {
    // a hand-entered 64x8192 lab output: clamping the aspect here would
    // reintroduce exactly the crop this function exists to prevent
    const r = refitToAspect(rect, 0.0078125)
    expect(r.w / r.h).toBeCloseTo(0.0078125, 8)
  })

  it('preserves area for sub-pixel rects too', () => {
    const tiny = { x: 0, y: 0, w: 0.5, h: 0.5 }
    const r = refitToAspect(tiny, 2)
    expect(r.w * r.h).toBeCloseTo(0.25, 6)
  })

  it('survives degenerate input instead of producing NaN', () => {
    for (const aspect of [0, -1, NaN, Infinity, -Infinity]) {
      const r = refitToAspect(rect, aspect)
      expect(Number.isFinite(r.w) && r.w > 0).toBe(true)
      expect(Number.isFinite(r.h) && r.h > 0).toBe(true)
      expect(Number.isFinite(r.x) && Number.isFinite(r.y)).toBe(true)
    }
    const fromNaNRect = refitToAspect({ x: NaN, y: 0, w: NaN, h: 600 }, 2)
    expect(Number.isFinite(fromNaNRect.w) && fromNaNRect.w > 0).toBe(true)
    expect(Number.isFinite(fromNaNRect.x)).toBe(true)
  })
})

describe('clampToArtboard', () => {
  const artW = 1920
  const artH = 1080

  it('leaves an already-contained rect alone', () => {
    const r = { x: 100, y: 100, w: 400, h: 300 }
    expect(clampToArtboard(r, artW, artH)).toEqual(r)
  })

  it('pulls an overhanging rect back onto the page', () => {
    const r = clampToArtboard({ x: -300, y: -50, w: 400, h: 300 }, artW, artH)
    expect(r.x).toBe(0)
    expect(r.y).toBe(0)
    expect(r.w).toBe(400)
  })

  it('shrinks an oversized rect to fit, keeping its aspect', () => {
    const r = clampToArtboard({ x: -100, y: -2000, w: 42, h: 4243 }, artW, artH)
    expect(r.x).toBeGreaterThanOrEqual(0)
    expect(r.y).toBeGreaterThanOrEqual(0)
    expect(r.x + r.w).toBeLessThanOrEqual(artW + 0.001)
    expect(r.y + r.h).toBeLessThanOrEqual(artH + 0.001)
    expect(r.w / r.h).toBeCloseTo(42 / 4243, 6)
  })
})

describe('inscribeAspect — the durable no-crop guarantee', () => {
  const cell = { x: 200, y: 100, w: 600, h: 300 } // 2.0

  it('fits inside the cell, centred, at the requested aspect', () => {
    for (const aspect of [0.5, 1, 2, 4]) {
      const r = inscribeAspect(cell, aspect)
      expect(r.w / r.h).toBeCloseTo(aspect, 6)
      expect(r.w).toBeLessThanOrEqual(cell.w + 0.001)
      expect(r.h).toBeLessThanOrEqual(cell.h + 0.001)
      expect(r.x + r.w / 2).toBeCloseTo(cell.x + cell.w / 2, 6)
      expect(r.y + r.h / 2).toBeCloseTo(cell.y + cell.h / 2, 6)
    }
  })

  it('fills the cell exactly when the aspects already agree', () => {
    const r = inscribeAspect(cell, cell.w / cell.h)
    expect(r).toEqual(cell)
  })
})
