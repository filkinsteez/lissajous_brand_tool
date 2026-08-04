import { describe, expect, it } from 'vitest'
import { analyzeRGBA, sampleMap, sampleRGB } from './analysis'

// synthetic sources — the brief's fixture set: gradient, hard edges,
// texture, transparency — small enough to reason about by hand

function rgba(w: number, h: number, px: (x: number, y: number) => [number, number, number, number]) {
  const out = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = px(x, y)
      const o = (y * w + x) * 4
      out[o] = r
      out[o + 1] = g
      out[o + 2] = b
      out[o + 3] = a
    }
  return out
}

describe('analyzeRGBA', () => {
  it('luminance follows a horizontal ramp', () => {
    const w = 16
    const maps = analyzeRGBA(
      rgba(w, 8, (x) => {
        const v = Math.round((x / (w - 1)) * 255)
        return [v, v, v, 255]
      }),
      w,
      8,
    )
    expect(maps.lum[0]).toBeLessThan(0.05)
    expect(maps.lum[w - 1]).toBeGreaterThan(0.95)
    for (let x = 1; x < w; x++) expect(maps.lum[x]).toBeGreaterThanOrEqual(maps.lum[x - 1])
  })

  it('transparent pixels read as paper, not black', () => {
    const maps = analyzeRGBA(rgba(4, 4, () => [0, 0, 0, 0]), 4, 4)
    expect(maps.lum[5]).toBeCloseTo(1, 5)
    expect(maps.alpha[5]).toBe(0)
  })

  it('a vertical edge yields a vertical orientation with high magnitude', () => {
    const w = 24
    const maps = analyzeRGBA(rgba(w, 24, (x) => (x < w / 2 ? [0, 0, 0, 255] : [255, 255, 255, 255])), w, 24)
    const i = 12 * w + w / 2 // on the edge, mid-height
    expect(maps.edge[i]).toBeGreaterThan(0.5)
    const angle = 0.5 * Math.atan2(maps.orientY[i], maps.orientX[i])
    // the edge LINE runs vertically: ±π/2
    expect(Math.abs(Math.abs(angle) - Math.PI / 2)).toBeLessThan(0.15)
    // far from the edge, magnitude is ~0
    expect(maps.edge[12 * w + 2]).toBeLessThan(0.05)
  })

  it('a horizontal edge yields a horizontal orientation', () => {
    const w = 24
    const maps = analyzeRGBA(rgba(w, 24, (_, y) => (y < 12 ? [0, 0, 0, 255] : [255, 255, 255, 255])), w, 24)
    const i = 12 * w + 12
    const angle = 0.5 * Math.atan2(maps.orientY[i], maps.orientX[i])
    expect(Math.abs(angle)).toBeLessThan(0.15)
  })

  it('detail is high on texture and low on flat fields', () => {
    const w = 32
    // left half checkerboard, right half flat mid-gray
    const maps = analyzeRGBA(
      rgba(w, 32, (x, y) => {
        if (x < 16) return (x + y) % 2 ? [255, 255, 255, 255] : [0, 0, 0, 255]
        return [128, 128, 128, 255]
      }),
      w,
      32,
    )
    expect(maps.detailFine[16 * w + 6]).toBeGreaterThan(maps.detailFine[16 * w + 26] + 0.2)
  })

  it('sampleMap bilinearly interpolates and edge-clamps', () => {
    const map = Float32Array.from([0, 1, 0, 1])
    expect(sampleMap(map, 2, 2, 0.5, 0.5)).toBeCloseTo(0.5, 5)
    expect(sampleMap(map, 2, 2, -10, -10)).toBeCloseTo(0, 5)
    expect(sampleMap(map, 2, 2, 10, 0)).toBeCloseTo(1, 2)
  })

  it('sampleRGB reads the kept source pixels', () => {
    const maps = analyzeRGBA(rgba(2, 2, (x) => (x === 0 ? [200, 10, 30, 255] : [0, 0, 0, 255])), 2, 2)
    expect(sampleRGB(maps, 0, 0)).toEqual([200, 10, 30])
  })
})
