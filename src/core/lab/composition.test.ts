import { describe, expect, it } from 'vitest'
import type { AnalysisMaps } from './analysis'
import { buildCellMarks, buildCells, cellId, curveFlowField, MARK_DEFAULTS } from './composition'
import type { StructureState, TerritoryState } from './types'

// hand-built analysis maps: left half busy (high detail), right half flat
function fakeMaps(detail = 0): AnalysisMaps {
  const w = 32
  const h = 32
  const n = w * h
  const half = (v: number, x: number) => (x < w / 2 ? v : 0)
  const detailArr = new Float32Array(n)
  const lum = new Float32Array(n).fill(0.35)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) detailArr[y * w + x] = half(detail, x)
  return {
    w,
    h,
    rgba: new Uint8ClampedArray(n * 4).fill(128),
    lum,
    alpha: new Float32Array(n).fill(1),
    edge: new Float32Array(n).fill(0.2),
    orientX: new Float32Array(n),
    orientY: new Float32Array(n),
    detailFine: detailArr,
    detailCoarse: detailArr,
  }
}

const RECT = { x: 0, y: 0, w: 320, h: 320 }
const TERR: TerritoryState = { sources: [], bands: ['empty', 'marks'], boundary: 'hard' }
const STRUCT: StructureState = { baseCell: 40, maxLevels: 0, subdivide: 0.5 }

describe('buildCells', () => {
  it('a flat territory yields a uniform base grid in one band', () => {
    const cells = buildCells({
      T: () => 0.9,
      territory: TERR,
      structure: STRUCT,
      maps: null,
      rect: RECT,
      outW: 320,
      outH: 320,
      seed: 1,
    })
    expect(cells).toHaveLength(64)
    expect(new Set(cells.map((c) => c.band))).toEqual(new Set([1]))
    expect(new Set(cells.map((c) => c.treatment))).toEqual(new Set(['marks']))
    expect(new Set(cells.map((c) => c.level))).toEqual(new Set([0]))
  })

  it('detail splits cells only where it lives, and ids stay stable', () => {
    const cells = buildCells({
      T: () => 0.9,
      territory: TERR,
      structure: { baseCell: 40, maxLevels: 2, subdivide: 1 },
      maps: fakeMaps(0.9),
      rect: RECT,
      outW: 320,
      outH: 320,
      seed: 1,
    })
    expect(cells.length).toBeGreaterThan(64)
    const left = cells.filter((c) => c.x < 160)
    const right = cells.filter((c) => c.x >= 160)
    expect(Math.min(...left.map((c) => c.size))).toBeLessThan(Math.min(...right.map((c) => c.size)))
    expect(new Set(right.map((c) => c.level))).toEqual(new Set([0]))
    // ids unique across the mixed-level grid
    const ids = cells.map((c) => cellId(c.level, c.ix, c.iy))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('dither mixes bands along a flat threshold where hard does not', () => {
    const mk = (boundary: TerritoryState['boundary']) =>
      buildCells({
        T: () => 0.5,
        territory: { ...TERR, boundary },
        structure: STRUCT,
        maps: null,
        rect: RECT,
        outW: 320,
        outH: 320,
        seed: 1,
      })
    expect(new Set(mk('hard').map((c) => c.band)).size).toBe(1)
    expect(new Set(mk('dither').map((c) => c.band)).size).toBe(2)
    expect(new Set(mk('porous').map((c) => c.band)).size).toBe(2)
  })

  it('a strong restore field forces the photo treatment over any band', () => {
    const cells = buildCells({
      T: () => 0.9, // band 1 = marks
      territory: TERR,
      structure: STRUCT,
      maps: null,
      rect: RECT,
      outW: 320,
      outH: 320,
      seed: 1,
      restore: (x) => (x < 160 ? 1 : 0), // erased left half
    })
    const left = cells.filter((c) => c.x + c.size / 2 < 160)
    const right = cells.filter((c) => c.x + c.size / 2 >= 160)
    expect(new Set(left.map((c) => c.treatment))).toEqual(new Set(['photo']))
    expect(new Set(right.map((c) => c.treatment))).toEqual(new Set(['marks']))
  })

  it('empty and flat treatments never subdivide', () => {
    const cells = buildCells({
      T: () => 0.2, // band 0 = empty
      territory: TERR,
      structure: { baseCell: 40, maxLevels: 2, subdivide: 1 },
      maps: fakeMaps(0.9),
      rect: RECT,
      outW: 320,
      outH: 320,
      seed: 1,
    })
    expect(new Set(cells.map((c) => c.level))).toEqual(new Set([0]))
  })
})

describe('buildCellMarks', () => {
  const cells = buildCells({
    T: () => 0.9,
    territory: TERR,
    structure: STRUCT,
    maps: fakeMaps(0.4),
    rect: RECT,
    outW: 320,
    outH: 320,
    seed: 7,
  })

  it('is byte-deterministic and seed-sensitive', () => {
    const mk = (seed: number) =>
      buildCellMarks({
        cells,
        params: MARK_DEFAULTS,
        maps: fakeMaps(0.4),
        rect: RECT,
        seed,
        bankSize: 5,
        flowField: null,
      })
    expect(JSON.stringify(mk(7))).toBe(JSON.stringify(mk(7)))
    expect(JSON.stringify(mk(7))).not.toBe(JSON.stringify(mk(8)))
  })

  it('only marks-treatment cells emit, occupancy 0 emits nothing', () => {
    const none = buildCellMarks({
      cells,
      params: { ...MARK_DEFAULTS, occupancy: 0 },
      maps: fakeMaps(0.4),
      rect: RECT,
      seed: 7,
      bankSize: 5,
      flowField: null,
    })
    expect(none).toHaveLength(0)
  })

  it('works with no source at all — territory carries the tone', () => {
    const stamps = buildCellMarks({
      cells,
      params: { ...MARK_DEFAULTS, occupancy: 1 },
      maps: null,
      rect: RECT,
      seed: 7,
      bankSize: 3,
      flowField: null,
    })
    expect(stamps.length).toBeGreaterThan(0)
    for (const s of stamps) expect(s.tone).toBeCloseTo(0.9, 5)
  })

  it('full flow with full rotation hands orientation to the flow field', () => {
    const stamps = buildCellMarks({
      cells,
      params: { ...MARK_DEFAULTS, occupancy: 1, rotationInfluence: 1, flow: 1 },
      maps: fakeMaps(0.4),
      rect: RECT,
      seed: 7,
      bankSize: 3,
      flowField: () => 0.7,
    })
    for (const s of stamps) expect(s.rot).toBeCloseTo(0.7, 5)
  })
})

describe('curveFlowField', () => {
  it('returns the tangent of the nearest curve point', () => {
    const horizontal = Array.from({ length: 20 }, (_, i) => ({ x: i * 20, y: 200, angle: 0 }))
    const f = curveFlowField(horizontal, 400, 400, 24)
    expect(Math.abs(f(200, 100))).toBeLessThan(0.05)
    const vertical = Array.from({ length: 20 }, (_, i) => ({ x: 200, y: i * 20, angle: Math.PI / 2 }))
    const g = curveFlowField(vertical, 400, 400, 24)
    expect(Math.abs(Math.abs(g(100, 200)) - Math.PI / 2)).toBeLessThan(0.05)
  })
})
