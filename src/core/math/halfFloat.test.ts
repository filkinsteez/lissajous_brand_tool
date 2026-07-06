import { describe, expect, it } from 'vitest'
import { packHalf, toHalf } from './halfFloat'

// reference decoder
function fromHalf(h: number): number {
  const sign = (h & 0x8000) ? -1 : 1
  const e = (h >> 10) & 0x1f
  const m = h & 0x3ff
  if (e === 0) return sign * m * Math.pow(2, -24)
  if (e === 31) return m ? NaN : sign * Infinity
  return sign * (1 + m / 1024) * Math.pow(2, e - 15)
}

describe('toHalf', () => {
  it('round-trips field-range values within half precision', () => {
    const values = [0, 1, -1, 0.5, -0.5, 0.25, 0.999, 0.001, -0.37, 0.7071]
    for (const v of values) {
      const rt = fromHalf(toHalf(v))
      expect(Math.abs(rt - v)).toBeLessThan(Math.max(1e-3, Math.abs(v) * 1e-3))
    }
  })

  it('preserves sign and zero', () => {
    expect(fromHalf(toHalf(0))).toBe(0)
    expect(fromHalf(toHalf(-0.75))).toBeLessThan(0)
    expect(fromHalf(toHalf(0.75))).toBeGreaterThan(0)
  })

  it('packs arrays element-wise', () => {
    const src = new Float32Array([0, 0.5, -1, 1])
    const packed = packHalf(src)
    expect(packed.length).toBe(4)
    for (let i = 0; i < 4; i++) {
      expect(Math.abs(fromHalf(packed[i]) - src[i])).toBeLessThan(1e-3)
    }
  })
})
