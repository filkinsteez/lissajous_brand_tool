import { describe, expect, it } from 'vitest'
import { buildCells } from './composition'
import { constantField } from './field'
import { buildColorField, hexToRgb, PALETTES } from './colorField'
import { buildBeadFills, buildBlockFills, buildShingleFills } from './fills'
import type { TerritoryState } from './types'

const TERR: TerritoryState = {
  sources: [],
  bands: ['blocks', 'beads', 'shingle'],
  boundary: 'hard',
}

function cellsFor(t: number) {
  return buildCells({
    T: () => t,
    territory: TERR,
    structure: { baseCell: 40, maxLevels: 0, subdivide: 0 },
    maps: null,
    rect: { x: 0, y: 0, w: 400, h: 400 },
    outW: 400,
    outH: 400,
    seed: 5,
  })
}

describe('color field', () => {
  it('is deterministic and stays a palette blend', () => {
    const f = buildColorField({ palette: PALETTES[0].colors, seed: 3, T: constantField(0.5), outW: 400, outH: 400 })
    const g = buildColorField({ palette: PALETTES[0].colors, seed: 3, T: constantField(0.5), outW: 400, outH: 400 })
    expect(f(120, 200)).toEqual(g(120, 200))
    const [r, gg, b] = f(50, 50)
    expect(r).toBeGreaterThanOrEqual(0)
    expect(r).toBeLessThanOrEqual(255)
    expect(gg).toBeGreaterThanOrEqual(0)
    expect(b).toBeLessThanOrEqual(255)
  })

  it('orders the palette along the territory', () => {
    // low T should be dominated by early palette slots, high T by late
    const pal = ['#ff0000', '#00ff00', '#0000ff']
    const T = (x: number) => Math.max(0, Math.min(1, x / 400))
    const f = buildColorField({ palette: pal, seed: 1, T, outW: 400, outH: 400 })
    const left = f(8, 200)
    const right = f(392, 200)
    expect(left[0]).toBeGreaterThan(left[2]) // red end
    expect(right[2]).toBeGreaterThan(right[0]) // blue end
  })

  it('hexToRgb parses', () => {
    expect(hexToRgb('#ff0080')).toEqual([255, 0, 128])
    expect(hexToRgb('#fff')).toEqual([255, 255, 255])
  })
})

describe('fills', () => {
  it('blocks deal palette indices coherently and deterministically', () => {
    const cells = cellsFor(0.1) // band 0 = blocks
    const a = buildBlockFills({ cells, paletteSize: 6, seed: 9 })
    const b = buildBlockFills({ cells, paletteSize: 6, seed: 9 })
    expect(JSON.stringify(a.map((f) => f.color))).toBe(JSON.stringify(b.map((f) => f.color)))
    expect(a.length).toBe(100)
    for (const f of a) {
      expect(f.color).toBeGreaterThanOrEqual(0)
      expect(f.color).toBeLessThan(6)
    }
    // coherence: many adjacent pairs share a color (a pure random deal
    // over 6 colors would share ~17%)
    let shared = 0
    let pairs = 0
    for (const f of a) {
      const right = a.find((o) => o.cell.iy === f.cell.iy && o.cell.ix === f.cell.ix + 1)
      if (right) {
        pairs++
        if (right.color === f.color) shared++
      }
    }
    expect(shared / pairs).toBeGreaterThan(0.35)
  })

  it('beads cover every cell and carry column runs', () => {
    const cells = cellsFor(0.5) // band 1 = beads
    const fills = buildBeadFills({ cells, paletteSize: 5, seed: 9 })
    expect(fills.length).toBe(100) // ground beads included
    // runs: within one column, consecutive active cells share color
    const col = fills.filter((f) => f.cell.ix === 3).sort((x, y) => x.cell.iy - y.cell.iy)
    for (let i = 1; i < col.length; i++) {
      if (col[i].active && col[i - 1].active) {
        // same run window -> same color (different windows may differ)
        const runLen = 3 // minimum run length in the builder
        if (Math.floor(col[i].cell.iy / runLen) === Math.floor(col[i - 1].cell.iy / runLen)) {
          expect(col[i].color).toBe(col[i - 1].color)
        }
      }
    }
  })

  it('shingles alternate direction by row and stay in the palette', () => {
    const cells = cellsFor(0.9) // band 2 = shingle
    const fills = buildShingleFills({ cells, paletteSize: 4, seed: 9, lean: 0 })
    expect(fills.length).toBe(100)
    const row0 = fills.find((f) => f.cell.iy === 0 && f.cell.ix === 0)!
    const row1 = fills.find((f) => f.cell.iy === 1 && f.cell.ix === 0)!
    expect(row0.angle).not.toBe(row1.angle)
    for (const f of fills) {
      expect(f.a).toBeLessThan(4)
      expect(f.b).toBeLessThan(4)
    }
  })
})
