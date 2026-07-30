import { describe, expect, it } from 'vitest'
import {
  BRAND_PALETTE,
  BRAND_ROLE_ORDER,
  buildPaletteLUT,
  hexToSrgb,
  oklabToSrgb,
  srgbToOklab,
  type ColorRole,
} from './palette'

describe('oklab conversion', () => {
  it('round-trips sRGB primaries within tolerance', () => {
    const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffffff', '#141412']
    for (const hex of colors) {
      const rt = oklabToSrgb(srgbToOklab(hexToSrgb(hex)))
      const src = hexToSrgb(hex)
      expect(Math.abs(rt.r - src.r)).toBeLessThan(1e-4)
      expect(Math.abs(rt.g - src.g)).toBeLessThan(1e-4)
      expect(Math.abs(rt.b - src.b)).toBeLessThan(1e-4)
    }
  })
})

describe('buildPaletteLUT', () => {
  it('builds a 256x1 RGBA texture payload', () => {
    const lut = buildPaletteLUT(BRAND_ROLE_ORDER, BRAND_PALETTE, ['cyan'])
    expect(lut.width).toBe(256)
    expect(lut.height).toBe(1)
    expect(lut.data.length).toBe(256 * 4)
    expect(lut.order[0]).toBe('cyan')
    expect(lut.data[3]).toBe(255)
    expect(lut.data[lut.data.length - 1]).toBe(255)
  })

  it('stabilizes invalid/duplicate role lists', () => {
    const roles = ['cyan', 'cyan', 'blue'] as ColorRole[]
    const lut = buildPaletteLUT(roles, BRAND_PALETTE, ['blue'])
    expect(lut.order.length).toBe(roles.length)
    expect(new Set(lut.order).has('blue')).toBe(true)
  })
})
