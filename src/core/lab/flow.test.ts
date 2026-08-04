import { describe, expect, it } from 'vitest'
import { buildCells } from './composition'
import { constantField } from './field'
import {
  buildDabs,
  buildScanlines,
  buildStreams,
  composeFlow,
  traceStream,
} from './flow'
import type { FlowState, TerritoryState } from './types'
import { analyzeRGBA } from './analysis'

const FLOW = (over: Partial<FlowState> = {}): FlowState => ({
  basis: 'angle',
  angle: 0,
  curl: 0,
  scale: 0.4,
  warp: 0.5,
  ...over,
})

const DEPS = { seed: 7, outW: 400, outH: 400, curveAngle: null, T: constantField(0.5) }

describe('composeFlow', () => {
  it('angle basis yields the fixed direction', () => {
    const f = composeFlow(FLOW({ angle: Math.PI / 2 }), DEPS)
    const [vx, vy] = f(100, 100)
    expect(Math.abs(vx)).toBeLessThan(1e-9)
    expect(vy).toBeCloseTo(1, 6)
  })

  it('is deterministic per seed and differs across seeds with curl', () => {
    const a = composeFlow(FLOW({ curl: 0.8 }), DEPS)
    const b = composeFlow(FLOW({ curl: 0.8 }), DEPS)
    const c = composeFlow(FLOW({ curl: 0.8 }), { ...DEPS, seed: 8 })
    expect(a(50, 50)).toEqual(b(50, 50))
    expect(a(50, 50)).not.toEqual(c(50, 50))
  })

  it('contour basis flows along band edges (perpendicular to the gradient)', () => {
    // T rises with x -> gradient is +x -> flow should be ±y
    const f = composeFlow(FLOW({ basis: 'contour' }), {
      ...DEPS,
      T: (x) => Math.max(0, Math.min(1, x / 400)),
    })
    const [vx, vy] = f(200, 200)
    expect(Math.abs(vy)).toBeGreaterThan(Math.abs(vx) * 10)
  })

  it('curve basis falls back when no curve angle exists', () => {
    const f = composeFlow(FLOW({ basis: 'curve', angle: 0 }), DEPS)
    expect(f(10, 10)[0]).toBeCloseTo(1, 6)
  })
})

describe('traceStream', () => {
  it('integrates a straight line under a constant field', () => {
    const pts = traceStream(() => [1, 0], 10, 20, 5, 4)
    expect(pts).toHaveLength(12)
    expect(pts[10]).toBeCloseTo(30, 6)
    expect(pts[11]).toBeCloseTo(20, 6)
  })

  it('resolves mod-π sign flips by continuity — no fold-backs', () => {
    // a field whose reported direction flips sign across x=50, as
    // doubled-angle tangent fields do at the atan2 wrap
    const flippy = (x: number): [number, number] => (x < 50 ? [1, 0] : [-1, 0])
    const pts = traceStream(flippy, 10, 0, 20, 5)
    // x must keep increasing — a naive walker would bounce at 50
    expect(pts[pts.length - 2]).toBeGreaterThan(100)
  })
})

describe('buildScanlines', () => {
  const rect = { x: 0, y: 0, w: 400, h: 400 }

  it('lays flat parallel lines with no source', () => {
    const lines = buildScanlines({ outW: 400, outH: 120, spacing: 40, warp: 1, maps: null, rect, field: null, bend: 0 })
    expect(lines).toHaveLength(3)
    const ys = new Set(lines[0].filter((_, i) => i % 2 === 1))
    expect(ys.size).toBe(1) // undisplaced
  })

  it('dark image areas displace the lines', () => {
    // left half black, right half white
    const w = 32
    const rgba = new Uint8ClampedArray(w * 32 * 4)
    for (let i = 0; i < w * 32; i++) {
      const v = (i % w) < w / 2 ? 0 : 255
      rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = v
      rgba[i * 4 + 3] = 255
    }
    const maps = analyzeRGBA(rgba, w, 32)
    const lines = buildScanlines({ outW: 400, outH: 400, spacing: 40, warp: 1, maps, rect, field: null, bend: 0 })
    const line = lines[3]
    const yAt = (x: number) => line[(Math.round(x / 4) * 2) + 1]
    // dark left is pulled off the baseline, bright right stays near it
    expect(Math.abs(yAt(80) - 140)).toBeGreaterThan(30)
    expect(Math.abs(yAt(360) - 140)).toBeLessThan(8)
  })
})

describe('dabs and streams', () => {
  const TERR: TerritoryState = { sources: [], bands: ['dabs', 'streams'], boundary: 'hard' }
  const cells = buildCells({
    T: (x) => (x < 200 ? 0.2 : 0.8), // left = dabs band, right = streams band
    territory: TERR,
    structure: { baseCell: 50, maxLevels: 0, subdivide: 0 },
    maps: null,
    rect: { x: 0, y: 0, w: 400, h: 400 },
    outW: 400,
    outH: 400,
    seed: 3,
  })

  it('dabs only emit in dabs cells, deterministically', () => {
    const mk = () =>
      buildDabs({
        cells,
        maps: null,
        rect: { x: 0, y: 0, w: 400, h: 400 },
        seed: 3,
        field: () => [1, 0],
        occupancy: 1,
      })
    const dabs = mk()
    expect(dabs.length).toBeGreaterThan(0)
    for (const d of dabs) expect(d.pts[0]).toBeLessThan(250) // start in the left band
    expect(JSON.stringify(mk())).toBe(JSON.stringify(dabs))
  })

  it('streams start in stream cells and carry many steps', () => {
    const streams = buildStreams({ cells, seed: 3, field: () => [0, 1], outW: 400, outH: 400 })
    expect(streams.length).toBeGreaterThan(0)
    for (const s of streams) {
      expect(s[0]).toBeGreaterThan(150) // seeded in the right band
      expect(s.length).toBeGreaterThan(40)
    }
  })
})
