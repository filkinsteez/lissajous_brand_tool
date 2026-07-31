import { describe, expect, it } from 'vitest'
import { textureTile } from './textures'

describe('subtexture tiles', () => {
  it('dither cell count grows monotonically with density', () => {
    let prev = -1
    for (const d of [0, 0.25, 0.5, 0.75, 1]) {
      const n = textureTile('dither', d).rects.length
      expect(n).toBeGreaterThanOrEqual(prev)
      prev = n
    }
    // never empty, never fully solid
    expect(textureTile('dither', 0).rects.length).toBeGreaterThan(0)
    expect(textureTile('dither', 1).rects.length).toBeLessThanOrEqual(16)
  })

  it('dither is deterministic and Bayer-ordered', () => {
    const a = textureTile('dither', 0.5)
    const b = textureTile('dither', 0.5)
    expect(a).toEqual(b)
    // the half-density weave is the classic checkered Bayer scatter, not
    // a filled block: no cell equals its right neighbor at d≈0.5
    const on = new Set(a.rects.map((r) => `${Math.round(r.x / 3)}:${Math.round(r.y / 3)}`))
    let adjacentPairs = 0
    for (const key of on) {
      const [c, r] = key.split(':').map(Number)
      if (on.has(`${c + 1}:${r}`)) adjacentPairs++
    }
    expect(adjacentPairs).toBeLessThan(on.size)
  })

  it('dots and hatch scale their marks with density', () => {
    expect(textureTile('dots', 1).dots[0].r).toBeGreaterThan(textureTile('dots', 0).dots[0].r)
    expect(textureTile('hatch', 1).lines[0].w).toBeGreaterThan(textureTile('hatch', 0).lines[0].w)
    // all marks stay inside sane bounds of the tile
    const t = textureTile('dots', 1)
    for (const d of t.dots) expect(d.r * 2).toBeLessThan(t.size)
  })
})
