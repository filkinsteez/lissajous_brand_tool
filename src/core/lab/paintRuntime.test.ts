import { describe, expect, it } from 'vitest'
import {
  BRUSH_LEVEL,
  ERASE_LEVEL,
  PAINT_NEUTRAL,
  applyStroke,
  type PaintRaster,
} from './paintRuntime'

function raster(fill = PAINT_NEUTRAL): PaintRaster {
  return { w: 16, h: 16, bytes: new Uint8Array(16 * 16).fill(fill) }
}

describe('applyStroke', () => {
  it('brush centers land below neutral (carve), erase lands at the top (restore)', () => {
    expect(BRUSH_LEVEL).toBeLessThan(PAINT_NEUTRAL)
    expect(ERASE_LEVEL).toBeGreaterThan(PAINT_NEUTRAL)
    const r = raster()
    applyStroke(r, 8, 8, 4, BRUSH_LEVEL)
    expect(r.bytes[8 * 16 + 8]).toBe(BRUSH_LEVEL)
    const e = raster()
    applyStroke(e, 8, 8, 4, ERASE_LEVEL)
    expect(e.bytes[8 * 16 + 8]).toBe(ERASE_LEVEL)
  })

  it('either tool always wins where applied', () => {
    const r = raster(ERASE_LEVEL)
    applyStroke(r, 8, 8, 4, BRUSH_LEVEL)
    expect(r.bytes[8 * 16 + 8]).toBe(BRUSH_LEVEL)
    applyStroke(r, 8, 8, 4, ERASE_LEVEL)
    expect(r.bytes[8 * 16 + 8]).toBe(ERASE_LEVEL)
  })

  it('falls off softly toward neutral and leaves pixels outside the radius alone', () => {
    const r = raster()
    applyStroke(r, 8, 8, 3, ERASE_LEVEL)
    expect(r.bytes[8 * 16 + 10]).toBeGreaterThan(PAINT_NEUTRAL)
    expect(r.bytes[8 * 16 + 10]).toBeLessThan(ERASE_LEVEL)
    expect(r.bytes[8 * 16 + 14]).toBe(PAINT_NEUTRAL)
    expect(r.bytes[0]).toBe(PAINT_NEUTRAL)
  })

  it('repeated dabs converge to the target instead of overshooting', () => {
    const r = raster()
    for (let i = 0; i < 12; i++) applyStroke(r, 8, 8, 4, BRUSH_LEVEL)
    for (let i = 0; i < r.bytes.length; i++) {
      expect(r.bytes[i]).toBeGreaterThanOrEqual(BRUSH_LEVEL)
      expect(r.bytes[i]).toBeLessThanOrEqual(PAINT_NEUTRAL)
    }
  })
})
