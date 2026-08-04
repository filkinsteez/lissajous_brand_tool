import { describe, expect, it } from 'vitest'
import { analyzeRGBA } from './analysis'
import { fitRect } from './field'
import { MARK_DEFAULTS, buildMarkStamps, tintFor, TINT_LEVELS } from './markTranslation'
import { builtinBank, brandBankFromAutosave } from './markBank'
import type { MarkTranslationParams } from './types'

// evidence source: a diagonal luminance gradient with a hard vertical
// edge through the middle — tone, structure, and orientation all present
function testMaps() {
  const w = 48
  const h = 48
  const rgba = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = x < w / 2 ? Math.round(((x + y) / (w + h - 2)) * 200) : 255
      const o = (y * w + x) * 4
      rgba[o] = rgba[o + 1] = rgba[o + 2] = v
      rgba[o + 3] = 255
    }
  return analyzeRGBA(rgba, w, h)
}

const MAPS = testMaps()
const OUT = { w: 200, h: 200 }
const RECT = fitRect(MAPS.w, MAPS.h, OUT.w, OUT.h, 'contain')

function build(params: Partial<MarkTranslationParams> = {}, seed = 11, bankSize = 7) {
  return buildMarkStamps({
    params: { ...MARK_DEFAULTS, ...params },
    maps: MAPS,
    rect: RECT,
    outW: OUT.w,
    outH: OUT.h,
    seed,
    bankSize,
  })
}

describe('buildMarkStamps', () => {
  it('is byte-deterministic for the same inputs', () => {
    expect(JSON.stringify(build())).toBe(JSON.stringify(build()))
  })

  it('changes with the seed', () => {
    expect(JSON.stringify(build({}, 11))).not.toBe(JSON.stringify(build({}, 12)))
  })

  it('keeps every stamp inside the output and the bank', () => {
    for (const s of build({ occupancy: 1 })) {
      expect(s.x).toBeGreaterThanOrEqual(0)
      expect(s.x).toBeLessThanOrEqual(OUT.w)
      expect(s.y).toBeGreaterThanOrEqual(0)
      expect(s.y).toBeLessThanOrEqual(OUT.h)
      expect(s.protoIndex).toBeGreaterThanOrEqual(0)
      expect(s.protoIndex).toBeLessThan(7)
      expect(s.tone).toBeGreaterThanOrEqual(0)
      expect(s.tone).toBeLessThanOrEqual(1)
      expect(s.size).toBeGreaterThan(0)
    }
  })

  it('occupancy scales presence monotonically down to zero', () => {
    const none = build({ occupancy: 0 })
    const some = build({ occupancy: 0.5 })
    const most = build({ occupancy: 1 })
    expect(none.length).toBe(0)
    expect(some.length).toBeGreaterThan(0)
    expect(most.length).toBeGreaterThanOrEqual(some.length)
  })

  it('letterboxed cells emit no stamps', () => {
    // portrait source in a landscape output leaves side bands empty
    const rect = fitRect(24, 48, 400, 200, 'contain')
    const stamps = buildMarkStamps({
      params: { ...MARK_DEFAULTS, occupancy: 1 },
      maps: MAPS,
      rect,
      outW: 400,
      outH: 200,
      seed: 3,
      bankSize: 3,
    })
    expect(stamps.length).toBeGreaterThan(0)
    for (const s of stamps) {
      expect(s.x).toBeGreaterThanOrEqual(rect.x - 1)
      expect(s.x).toBeLessThanOrEqual(rect.x + rect.w + 1)
    }
  })

  it('rotation influence 0 leaves marks unrotated', () => {
    for (const s of build({ rotationInfluence: 0 })) expect(s.rot).toBe(0)
  })

  it('a single-mark bank never indexes past 0', () => {
    for (const s of build({}, 11, 1)) expect(s.protoIndex).toBe(0)
  })
})

describe('tints', () => {
  it('quantizes to exactly three inks', () => {
    const seen = new Set([tintFor(0.05), tintFor(0.45), tintFor(0.9)])
    expect(seen.size).toBe(3)
    for (const v of seen) expect(TINT_LEVELS).toContain(v as (typeof TINT_LEVELS)[number])
  })
})

describe('mark banks', () => {
  it('builtin banks have geometry and density order', () => {
    expect(builtinBank('dots')).toHaveLength(1)
    const geo = builtinBank('geo')
    expect(geo.length).toBeGreaterThanOrEqual(6)
    for (const p of geo) {
      expect(p.kind).toBe('path')
      if (p.kind === 'path') expect(p.d.length).toBeGreaterThan(10)
    }
  })

  it('brand bank falls back gracefully without an autosave', () => {
    const { protos, fromProject } = brandBankFromAutosave(null)
    expect(fromProject).toBe(false)
    expect(protos.length).toBeGreaterThanOrEqual(4)
    expect(protos[0].id).toBe('lab-meta')
  })
})
