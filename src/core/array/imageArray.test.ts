import { describe, expect, it } from 'vitest'
import { buildImageCells, type PixelGrid } from './imageArray'
import type { ImageArrayState } from '@/core/state/types'

const base: ImageArrayState = {
  imageId: 'x',
  cells: 10,
  size: 0.7,
  threshold: 0.7,
  blend: 0,
  invert: false,
}

// synthetic image: left half black, right half white
function halfBlack(w = 10, h = 10): PixelGrid {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = x < w / 2 ? 0 : 255
      const o = (y * w + x) * 4
      data[o] = v
      data[o + 1] = v
      data[o + 2] = v
      data[o + 3] = 255
    }
  }
  return { w, h, data }
}

describe('image array', () => {
  it('dark cells become heavy glyphs, light cells fall to the lattice', () => {
    const cells = buildImageCells(base, 1000, 1000, halfBlack(), ['#ff0000', '#00ff00'])
    const dark = cells.filter((c) => c.x < 500)
    const light = cells.filter((c) => c.x > 500)
    expect(dark.every((c) => c.glyph === 'square' || c.glyph === 'cross')).toBe(true)
    expect(light.every((c) => c.glyph === 'lattice')).toBe(true)
    expect(light[0].alpha).toBeLessThan(0.5)
  })

  it('INVERT flips the reading', () => {
    const cells = buildImageCells({ ...base, invert: true }, 1000, 1000, halfBlack(), ['#ff0000'])
    const dark = cells.filter((c) => c.x < 500)
    expect(dark.every((c) => c.glyph === 'lattice')).toBe(true)
  })

  it('BLEND pulls glyph color toward the sampled image color', () => {
    const flat = buildImageCells(base, 1000, 1000, halfBlack(), ['#ff0000'])
    const blended = buildImageCells({ ...base, blend: 1 }, 1000, 1000, halfBlack(), ['#ff0000'])
    const g0 = flat.find((c) => c.glyph !== 'lattice')
    const g1 = blended.find((c) => c.glyph !== 'lattice')
    expect(g0?.color).toBe('#ff0000')
    expect(g1?.color).toBe('#000000') // fully blended toward the black pixel
  })

  it('deals palette colors deterministically', () => {
    const a = buildImageCells(base, 1000, 1000, halfBlack(), ['#ff0000', '#00ff00', '#0000ff'])
    const b = buildImageCells(base, 1000, 1000, halfBlack(), ['#ff0000', '#00ff00', '#0000ff'])
    expect(a).toEqual(b)
    const used = new Set(a.filter((c) => c.glyph !== 'lattice').map((c) => c.color))
    expect(used.size).toBeGreaterThan(1)
  })
})
