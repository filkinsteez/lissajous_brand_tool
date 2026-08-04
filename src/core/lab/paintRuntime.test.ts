import { describe, expect, it } from 'vitest'
import { BRUSH_LEVEL, ERASE_LEVEL, applyStroke, type PaintRaster } from './paintRuntime'

function raster(fill = 0): PaintRaster {
  return { w: 16, h: 16, bytes: new Uint8Array(16 * 16).fill(fill) }
}

describe('applyStroke', () => {
  it('brush centers hit exactly the glitch level, erase hits paper level', () => {
    const r = raster()
    applyStroke(r, 8, 8, 4, BRUSH_LEVEL)
    expect(r.bytes[8 * 16 + 8]).toBe(BRUSH_LEVEL)
    const e = raster()
    applyStroke(e, 8, 8, 4, ERASE_LEVEL)
    expect(e.bytes[8 * 16 + 8]).toBe(ERASE_LEVEL)
  })

  it('either tool always wins where applied — brush pulls erased areas back down', () => {
    const r = raster(ERASE_LEVEL)
    applyStroke(r, 8, 8, 4, BRUSH_LEVEL)
    expect(r.bytes[8 * 16 + 8]).toBe(BRUSH_LEVEL)
    // and erase pushes brushed areas up
    applyStroke(r, 8, 8, 4, ERASE_LEVEL)
    expect(r.bytes[8 * 16 + 8]).toBe(ERASE_LEVEL)
  })

  it('falls off softly and leaves pixels outside the radius alone', () => {
    const r = raster()
    applyStroke(r, 8, 8, 3, ERASE_LEVEL)
    expect(r.bytes[8 * 16 + 10]).toBeGreaterThan(0)
    expect(r.bytes[8 * 16 + 10]).toBeLessThan(ERASE_LEVEL)
    expect(r.bytes[8 * 16 + 14]).toBe(0)
    expect(r.bytes[0]).toBe(0)
  })

  it('repeated dabs converge to the target instead of overshooting', () => {
    const r = raster()
    for (let i = 0; i < 12; i++) applyStroke(r, 8, 8, 4, BRUSH_LEVEL)
    for (let i = 0; i < r.bytes.length; i++) expect(r.bytes[i]).toBeLessThanOrEqual(BRUSH_LEVEL)
  })
})
