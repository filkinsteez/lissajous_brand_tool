import { describe, expect, it } from 'vitest'
import { buildImageCells, type PixelGrid } from './imageArray'
import type { ImageArrayState } from '@/core/state/types'

const base: ImageArrayState = {
  sourceShapeIds: [],
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

// drawn vocabulary: a 4x4 grid, one gray value per row — black (dark
// tier), mid (circle/ring tier), near-threshold (dot tier), white
// (above threshold -> lattice)
const ROW_VALUES = [0, 64, 115, 255]

function rowGrid(): PixelGrid {
  const data = new Uint8ClampedArray(4 * 4 * 4)
  for (let iy = 0; iy < 4; iy++) {
    for (let ix = 0; ix < 4; ix++) {
      const o = (iy * 4 + ix) * 4
      const v = ROW_VALUES[iy]
      data[o] = v
      data[o + 1] = v
      data[o + 2] = v
      data[o + 3] = 255
    }
  }
  return { w: 4, h: 4, data }
}

function rowState(over: Partial<ImageArrayState> = {}): ImageArrayState {
  return {
    sourceShapeIds: [],
    imageId: null,
    cells: 4,
    size: 1,
    threshold: 0.5,
    blend: 0,
    invert: false,
    ...over,
  }
}

const PALETTE = ['#aa0000', '#00aa00', '#0000aa']
const FILLS = ['#112233', '#445566', '#778899']

describe('image array drawn vocabulary', () => {
  it('empty binding is byte-identical to the built-in path and deals no protos', () => {
    const a = buildImageCells(rowState(), 100, 100, rowGrid(), PALETTE)
    const b = buildImageCells(rowState(), 100, 100, rowGrid(), PALETTE, [])
    expect(b).toEqual(a)
    expect(a).toHaveLength(16)
    for (const c of a) expect(c.protoIndex).toBeUndefined()
    // the built-in tier reads hold
    for (let i = 0; i < 4; i++) {
      expect(['square', 'cross']).toContain(a[i].glyph)
      expect(['circle', 'ring']).toContain(a[4 + i].glyph)
      expect(a[8 + i].glyph).toBe('dot')
      expect(a[12 + i].glyph).toBe('lattice')
    }
  })

  it('proto deal is deterministic and every index is in range', () => {
    const a = buildImageCells(rowState(), 100, 100, rowGrid(), PALETTE, FILLS)
    const b = buildImageCells(rowState(), 100, 100, rowGrid(), PALETTE, FILLS)
    expect(b).toEqual(a)
    for (const c of a) {
      expect(Number.isInteger(c.protoIndex)).toBe(true)
      expect(c.protoIndex).toBeGreaterThanOrEqual(0)
      expect(c.protoIndex).toBeLessThan(FILLS.length)
      expect(c.color).toBe(FILLS[c.protoIndex!]) // blend 0: the proto's own fill
    }
  })

  it('binding swaps vocabulary only: geometry and alpha match the built-in deal', () => {
    const plain = buildImageCells(rowState(), 100, 100, rowGrid(), PALETTE)
    const drawn = buildImageCells(rowState(), 100, 100, rowGrid(), PALETTE, FILLS)
    expect(drawn.length).toBe(plain.length)
    for (let i = 0; i < plain.length; i++) {
      expect(drawn[i].x).toBe(plain[i].x)
      expect(drawn[i].y).toBe(plain[i].y)
      expect(drawn[i].r).toBe(plain[i].r) // dot-tier shrink survives: darks stay heavy
      expect(drawn[i].alpha).toBe(plain[i].alpha)
    }
    // full BLEND pulls glyph cells to the sampled pixel; the lattice keeps its fill
    const blended = buildImageCells(rowState({ blend: 1 }), 100, 100, rowGrid(), PALETTE, FILLS)
    for (let i = 0; i < 4; i++) {
      expect(blended[i].color).toBe('#000000')
      expect(blended[4 + i].color).toBe('#404040')
      expect(blended[12 + i].color).toBe(FILLS[blended[12 + i].protoIndex!])
    }
  })
})
